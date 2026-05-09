/**
 * executionSandboxEngine — Phase 25. Top-level operator-initiated
 * counterfactual projection.
 *
 * Architectural commitment:
 *   - PURE in-memory simulation. Reads state from Phase 21/22/23,
 *     applies hypothetical actions to in-memory copies, projects deltas,
 *     and returns. NEVER calls live mutators (liftIsolation /
 *     buildRecoveryPlan / forceReplay / executeRecoveryStep).
 *   - Every sandbox carries a `SandboxIsolationGuarantee` proof + a
 *     `SandboxDeterminismAttribution` hash.
 *   - Same inputs reproduce same projected_state_hash.
 *   - Bounded ring buffer per partition.
 */

import { randomUUID, createHash } from 'crypto';
import type {
  ExecutionSandboxProfile, HypotheticalAction, SimulationProjectionTier,
  ProjectionDeltaAttribution, SandboxIsolationGuarantee,
  SandboxDeterminismAttribution, ExperimentationBoundaryProfile,
  ExperimentReplayAttribution, ExperimentReplayConfidenceBounds,
  ProjectedChangeKind,
} from './experimentationTypes';
import {
  MAX_SANDBOXES_PER_PARTITION, MAX_HYPOTHETICAL_ACTIONS_PER_SANDBOX,
  MAX_REHEARSAL_CHAIN_DEPTH, MAX_PROJECTION_BUDGET_MS,
  MAX_BASELINE_DELTA_ENTRIES, SANDBOX_TTL_MS,
} from './experimentationTypes';
import { evaluateSandboxSubmission } from './sandboxGovernanceSupervisor';
import { buildIsolationProfile as buildBrokerIsolationProfile, isIsolated as isBrokerIsolated } from '../distributedRuntime/brokerIsolationEngine';
import { getActiveAdapterKind } from '../distributedRuntime/distributedBrokerRuntime';
import { buildIsolationProfile as buildExecIsolationProfile } from '../executionSubstrate/executionIsolationEngine';
import { listEnvelopes } from '../executionSubstrate/executionRuntimeCoordinator';
import { downstreamNamespaces } from '../topology/cognitionTopologyGraph';
import { publishCognitiveEvent } from '../realtime/cognitiveEventBus';

interface PartitionStore {
  sandboxes: ExecutionSandboxProfile[];
  recent_24h: number[];
}

const partitions = new Map<string, PartitionStore>();

function ensure(organization_id: string): PartitionStore {
  let s = partitions.get(organization_id);
  if (!s) {
    s = { sandboxes: [], recent_24h: [] };
    partitions.set(organization_id, s);
  }
  return s;
}

function pruneRecent(store: PartitionStore, now: number): void {
  const cutoff = now - 24 * 60 * 60_000;
  while (store.recent_24h.length > 0 && store.recent_24h[0] < cutoff) {
    store.recent_24h.shift();
  }
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function buildIsolationGuarantee(sandbox_id: string): SandboxIsolationGuarantee {
  const expires_at = new Date(Date.now() + SANDBOX_TTL_MS).toISOString();
  const proof_input = `${sandbox_id}::runtime_blocked::broker_blocked::federation_blocked::topology_blocked::execution_substrate_blocked::${expires_at}`;
  return {
    sandbox_id,
    runtime_writes_blocked: true,
    broker_writes_blocked: true,
    federation_writes_blocked: true,
    topology_writes_blocked: true,
    execution_substrate_writes_blocked: true,
    expires_at,
    isolation_proof_hash: deterministicHash(proof_input),
  };
}

function buildBoundaryProfile(organization_id: string, chain_depth: number): ExperimentationBoundaryProfile {
  return {
    organization_id,
    partition_id: organization_id,
    max_chain_depth: Math.min(chain_depth, MAX_REHEARSAL_CHAIN_DEPTH),
    max_projection_budget_ms: MAX_PROJECTION_BUDGET_MS,
    max_action_count: MAX_HYPOTHETICAL_ACTIONS_PER_SANDBOX,
    runtime_mutation_blocked: true,
    broker_mutation_blocked: true,
    topology_mutation_blocked: true,
    federation_mutation_blocked: true,
    execution_substrate_mutation_blocked: true,
  };
}

export interface SubmitSandboxInput {
  readonly organization_id: string;
  readonly hypothetical_actions: ReadonlyArray<HypotheticalAction>;
  readonly tier?: SimulationProjectionTier;
}

export type SubmitSandboxResult =
  | { permitted: true; sandbox: ExecutionSandboxProfile; replay_attribution: ExperimentReplayAttribution }
  | { permitted: false; decision: 'rejected' | 'flagged'; reason: string; supervisor_rule_violated?: string };

/**
 * Operator-initiated counterfactual projection. Snapshots Phase 21/22/23
 * state, applies hypothetical actions to an in-memory copy, projects
 * deltas, returns.
 */
export function submitExecutionSandbox(input: SubmitSandboxInput): SubmitSandboxResult {
  const t0 = Date.now();
  const experiment_id = `exp_${randomUUID()}`;
  const sandbox_id = `sandbox_${randomUUID()}`;

  const tier: SimulationProjectionTier =
    input.tier ?? (input.hypothetical_actions.length === 0 ? 'observed_state'
                  : input.hypothetical_actions.length === 1 ? 'single_step_projection'
                  : 'chained_rehearsal');

  // Hard governance gate — stricter for chained_rehearsal.
  const chain_depth = tier === 'chained_rehearsal' ? input.hypothetical_actions.length : 0;
  const gate = evaluateSandboxSubmission({
    experiment_id,
    organization_id: input.organization_id,
    hypothetical_actions: input.hypothetical_actions,
    chain_depth,
    projection_budget_ms: MAX_PROJECTION_BUDGET_MS,
  });
  if (gate.decision !== 'permitted') {
    return {
      permitted: false,
      decision: gate.decision === 'flagged' ? 'flagged' : 'rejected',
      reason: gate.reason,
      supervisor_rule_violated: gate.supervisor_rule_violated,
    };
  }

  // ── Snapshot baseline state IN-MEMORY ───────────────────────────
  const baseline_snapshot_id = `baseline_${randomUUID().slice(0, 8)}`;
  const adapter_kind = getActiveAdapterKind();
  const brokerProfile = buildBrokerIsolationProfile(adapter_kind);
  const orgBrokerIsolations = brokerProfile.isolated_namespaces.filter(
    i => i.organization_id === input.organization_id || i.organization_id === null,
  );
  const execProfile = buildExecIsolationProfile();
  const orgExecIsolations = execProfile.isolated_kinds.filter(i => i.organization_id === input.organization_id);
  const envelopes = listEnvelopes(input.organization_id);

  // Baseline deltas: each currently-isolated namespace + each non-completed worker.
  const baseline: ProjectionDeltaAttribution[] = [];
  for (const iso of orgBrokerIsolations.slice(0, 10)) {
    baseline.push({
      namespace: iso.namespace,
      projected_change_kind: 'no_change',
      derived_from_action: '__baseline__',
      dependency_depth: 0,
      projected_impact_score: 0,
    });
  }
  for (const env of envelopes.slice(-10)) {
    baseline.push({
      namespace: env.kind,
      projected_change_kind: 'no_change',
      derived_from_action: '__baseline__',
      dependency_depth: 0,
      projected_impact_score: 0,
    });
  }

  // ── Build in-memory simulated state ──────────────────────────────
  // We model only the pieces relevant to the hypothetical actions:
  //   - simulated isolated set (broker + exec)
  //   - simulated worker lifecycle map (worker_id → state)
  const simIsolatedBroker = new Set(orgBrokerIsolations.map(i => `${i.namespace}::${i.organization_id ?? '*'}`));
  const simIsolatedExec = new Set(orgExecIsolations.map(i => `${i.kind}::${i.organization_id}`));
  const simWorkerLifecycle = new Map<string, string>();
  for (const env of envelopes) simWorkerLifecycle.set(env.worker_id, env.lifecycle_state);

  // ── Apply hypothetical actions ──────────────────────────────────
  const projected_deltas: ProjectionDeltaAttribution[] = [];
  let bounded_reason: string | undefined;
  for (const action of input.hypothetical_actions) {
    if (Date.now() - t0 > MAX_PROJECTION_BUDGET_MS) {
      bounded_reason = 'projection_budget_exhausted';
      break;
    }
    applyHypothetical(action, input.organization_id, {
      simIsolatedBroker, simIsolatedExec, simWorkerLifecycle,
    }, projected_deltas);
  }

  if (projected_deltas.length > MAX_BASELINE_DELTA_ENTRIES) {
    projected_deltas.length = MAX_BASELINE_DELTA_ENTRIES;
    bounded_reason = bounded_reason ?? 'delta_cap_reached';
  }

  // ── Determinism: hash baseline + actions + projected ─────────────
  const baseline_state_hash = deterministicHash(JSON.stringify(baseline.map(b => ({ ns: b.namespace, c: b.projected_change_kind }))));
  const hypothetical_action_hash = deterministicHash(JSON.stringify(input.hypothetical_actions.map(a => ({ k: a.kind, ns: a.target_namespace, w: a.target_worker_id }))));
  const projected_state_hash = deterministicHash(`${baseline_state_hash}::${hypothetical_action_hash}::${JSON.stringify(projected_deltas.map(d => ({ ns: d.namespace, k: d.projected_change_kind, dep: d.dependency_depth })))}`);

  const determinism: SandboxDeterminismAttribution = {
    sandbox_id,
    baseline_state_hash,
    projected_state_hash,
    hypothetical_action_hash,
    replayable: true,
    deterministic: true,
    recorded_at: new Date().toISOString(),
  };

  const isolation_guarantee = buildIsolationGuarantee(sandbox_id);
  const boundary = buildBoundaryProfile(input.organization_id, chain_depth);
  const time_elapsed_ms = Date.now() - t0;

  const sandbox: ExecutionSandboxProfile = {
    sandbox_id,
    experiment_id,
    organization_id: input.organization_id,
    tier,
    hypothetical_actions: input.hypothetical_actions,
    baseline,
    projected_deltas,
    isolation_guarantee,
    determinism,
    boundary,
    time_elapsed_ms,
    bounded_reason,
    built_at: new Date().toISOString(),
  };

  const store = ensure(input.organization_id);
  store.sandboxes.push(sandbox);
  if (store.sandboxes.length > MAX_SANDBOXES_PER_PARTITION) store.sandboxes.shift();
  store.recent_24h.push(Date.now());
  pruneRecent(store, Date.now());

  // Inherited confidence: from Phase 22 forecast confidence center if applicable.
  const replay_attribution: ExperimentReplayAttribution = {
    experiment_id,
    baseline_snapshot_id,
    hypothetical_action_count: input.hypothetical_actions.length,
    hypothetical_action_hash,
    projected_state_hash,
    confidence_bounds: buildInheritedConfidence(projected_deltas),
    source_attributions: [
      { source_kind: 'broker_isolation_profile', source_id: `iso_at_${brokerProfile.built_at}`, source_phase: 'phase_21_runtime' },
      { source_kind: 'execution_isolation_profile', source_id: `exec_iso_at_${execProfile.built_at}`, source_phase: 'phase_23_execution_substrate' },
    ],
  };

  try {
    publishCognitiveEvent({
      kind: 'sandbox.completed',
      project_id: 'system',
      severity: 'info',
      payload: {
        sandbox_id, experiment_id, organization_id: input.organization_id,
        tier, action_count: input.hypothetical_actions.length,
        time_elapsed_ms,
      },
    });
  } catch { /* noop */ }

  return { permitted: true, sandbox, replay_attribution };
}

function buildInheritedConfidence(projected_deltas: ProjectionDeltaAttribution[]): ExperimentReplayConfidenceBounds | undefined {
  if (projected_deltas.length === 0) return undefined;
  // Aggregate from inherited bounds carried by deltas (when present).
  const inherited = projected_deltas
    .map(d => d.inherited_confidence_bounds)
    .filter((c): c is ExperimentReplayConfidenceBounds => c !== undefined);
  if (inherited.length === 0) {
    return {
      low: 60, high: 80,
      drivers: ['no_inherited_phase_22_confidence_in_deltas'],
      inherited_from_phase: 'phase_22_topology',
      inherited_from_source_id: '_no_phase22_attribution',
    };
  }
  let low = 100, high = 0;
  const drivers = new Set<string>();
  for (const c of inherited) {
    low = Math.min(low, c.low);
    high = Math.max(high, c.high);
    for (const d of c.drivers) drivers.add(d);
  }
  return {
    low, high,
    drivers: Array.from(drivers),
    inherited_from_phase: inherited[0].inherited_from_phase,
    inherited_from_source_id: inherited[0].inherited_from_source_id,
  };
}

interface SimState {
  simIsolatedBroker: Set<string>;
  simIsolatedExec: Set<string>;
  simWorkerLifecycle: Map<string, string>;
}

function applyHypothetical(
  action: HypotheticalAction,
  organization_id: string,
  state: SimState,
  projected_deltas: ProjectionDeltaAttribution[],
): void {
  switch (action.kind) {
    case 'lift_broker_isolation': {
      if (!action.target_namespace) return;
      const k = `${action.target_namespace}::${organization_id}`;
      const wasIsolated = state.simIsolatedBroker.has(k) || isBrokerIsolated(action.target_namespace, organization_id);
      if (!wasIsolated) {
        projected_deltas.push({
          namespace: action.target_namespace,
          projected_change_kind: 'no_change',
          derived_from_action: action.action_id,
          dependency_depth: 0,
          projected_impact_score: 0,
        });
        return;
      }
      state.simIsolatedBroker.delete(k);
      // Project downstream namespaces stabilizing (they were at risk).
      const downstream = downstreamNamespaces(organization_id, action.target_namespace, 8);
      projected_deltas.push({
        namespace: action.target_namespace,
        projected_change_kind: 'isolation_lifted',
        derived_from_action: action.action_id,
        dependency_depth: 0,
        projected_impact_score: 80,
      });
      for (const d of downstream.slice(0, 6)) {
        projected_deltas.push({
          namespace: d.namespace,
          projected_change_kind: 'no_change',                  // downstream un-blocks but doesn't itself change isolation
          derived_from_action: action.action_id,
          dependency_depth: d.depth,
          projected_impact_score: Math.max(20, 60 - d.depth * 10),
        });
      }
      break;
    }
    case 'add_broker_isolation': {
      if (!action.target_namespace) return;
      const k = `${action.target_namespace}::${organization_id}`;
      if (state.simIsolatedBroker.has(k)) {
        projected_deltas.push({
          namespace: action.target_namespace,
          projected_change_kind: 'no_change',
          derived_from_action: action.action_id,
          dependency_depth: 0,
          projected_impact_score: 0,
        });
        return;
      }
      state.simIsolatedBroker.add(k);
      const downstream = downstreamNamespaces(organization_id, action.target_namespace, 8);
      projected_deltas.push({
        namespace: action.target_namespace,
        projected_change_kind: 'isolation_added',
        derived_from_action: action.action_id,
        dependency_depth: 0,
        projected_impact_score: 70,
      });
      for (const d of downstream.slice(0, 6)) {
        projected_deltas.push({
          namespace: d.namespace,
          projected_change_kind: 'no_change',
          derived_from_action: action.action_id,
          dependency_depth: d.depth,
          projected_impact_score: Math.max(15, 50 - d.depth * 10),
        });
      }
      break;
    }
    case 'lift_execution_isolation': {
      if (!action.target_kind) return;
      const k = `${action.target_kind}::${organization_id}`;
      if (!state.simIsolatedExec.has(k)) {
        projected_deltas.push({
          namespace: action.target_kind,
          projected_change_kind: 'no_change',
          derived_from_action: action.action_id,
          dependency_depth: 0,
          projected_impact_score: 0,
        });
        return;
      }
      state.simIsolatedExec.delete(k);
      projected_deltas.push({
        namespace: action.target_kind,
        projected_change_kind: 'isolation_lifted',
        derived_from_action: action.action_id,
        dependency_depth: 0,
        projected_impact_score: 70,
      });
      break;
    }
    case 'execute_topology_recovery_step': {
      if (!action.target_namespace) return;
      // Treat as a recovery_step_executed projection; downstream stabilize.
      const downstream = downstreamNamespaces(organization_id, action.target_namespace, 8);
      projected_deltas.push({
        namespace: action.target_namespace,
        projected_change_kind: 'recovery_step_executed',
        derived_from_action: action.action_id,
        dependency_depth: 0,
        projected_impact_score: 65,
      });
      for (const d of downstream.slice(0, 4)) {
        projected_deltas.push({
          namespace: d.namespace,
          projected_change_kind: 'no_change',
          derived_from_action: action.action_id,
          dependency_depth: d.depth,
          projected_impact_score: Math.max(10, 40 - d.depth * 10),
        });
      }
      break;
    }
    case 'force_continuity_replay': {
      // Affects all currently-tracked workers — bounded delta count.
      const workerIds = Array.from(state.simWorkerLifecycle.keys()).slice(0, 4);
      projected_deltas.push({
        namespace: '_system',
        projected_change_kind: 'replay_completed',
        derived_from_action: action.action_id,
        dependency_depth: 0,
        projected_impact_score: 60,
      });
      for (const wid of workerIds) {
        const current = state.simWorkerLifecycle.get(wid);
        if (current === 'interrupted') {
          // Replay surfaces the interrupted worker for operator review (no lifecycle change).
          projected_deltas.push({
            namespace: wid,
            projected_change_kind: 'no_change',
            derived_from_action: action.action_id,
            dependency_depth: 1,
            projected_impact_score: 30,
          });
        }
      }
      break;
    }
    case 'rollback_worker_lifecycle': {
      if (!action.target_worker_id) return;
      const current = state.simWorkerLifecycle.get(action.target_worker_id);
      if (!current) {
        projected_deltas.push({
          namespace: action.target_worker_id,
          projected_change_kind: 'no_change',
          derived_from_action: action.action_id,
          dependency_depth: 0,
          projected_impact_score: 0,
        });
        return;
      }
      // Project transition: any state → rolled_back is valid.
      state.simWorkerLifecycle.set(action.target_worker_id, 'rolled_back');
      const projected_change_kind: ProjectedChangeKind = current === 'rolled_back' ? 'no_change' : 'worker_lifecycle_advanced';
      projected_deltas.push({
        namespace: action.target_worker_id,
        projected_change_kind,
        derived_from_action: action.action_id,
        dependency_depth: 0,
        projected_impact_score: 50,
      });
      break;
    }
  }
}

// ─── Read APIs ──────────────────────────────────────────────────────

export function listSandboxes(organization_id: string): ReadonlyArray<ExecutionSandboxProfile> {
  return [...(partitions.get(organization_id)?.sandboxes ?? [])].reverse();
}

export function getSandbox(organization_id: string, sandbox_id: string): ExecutionSandboxProfile | null {
  return (partitions.get(organization_id)?.sandboxes ?? []).find(s => s.sandbox_id === sandbox_id) ?? null;
}

export function recentSandboxCount24h(organization_id?: string): number {
  if (organization_id) {
    const store = partitions.get(organization_id);
    if (!store) return 0;
    pruneRecent(store, Date.now());
    return store.recent_24h.length;
  }
  let total = 0;
  for (const store of partitions.values()) {
    pruneRecent(store, Date.now());
    total += store.recent_24h.length;
  }
  return total;
}

export function _resetSandboxesForTests(): void {
  partitions.clear();
}
