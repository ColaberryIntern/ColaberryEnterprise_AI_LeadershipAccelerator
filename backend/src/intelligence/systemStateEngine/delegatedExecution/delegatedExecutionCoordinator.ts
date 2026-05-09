/**
 * delegatedExecutionCoordinator — Phase 27. Synchronous-only inline
 * top-level coordinator.
 *
 * Architectural commitment:
 *   - SYNCHRONOUS only. No queues, no background, no deferred execution.
 *     Flow: validate → execute ONE mutator → record replay → consume.
 *   - Hard timeout via Promise.race; permanent envelope invalidation
 *     on exhaustion.
 *   - Invokes ONE existing Phase 21/22/23 mutator from a bounded
 *     5-action whitelist. NEVER spawns workers, NEVER issues secondary
 *     delegated actions, NEVER cascades operational side effects.
 *   - Records `DelegatedExecutionAttributionLineage` + governance
 *     replay hash + finality proof + 7 safety invariants.
 */

import { randomUUID, createHash } from 'crypto';
import type {
  DelegatedExecutionResult, DelegatedExecutionReplayTrace,
  DelegatedExecutionAttributionLineage, DelegatedGovernanceReplayHash,
  AuthorityScopeBoundaryProofChain, DelegatedExecutionTimeoutBounds,
  DelegatedExecutionFinalityProof, DelegatedExecutionOutcome,
  DelegatableActionKind,
} from './delegatedExecutionTypes';
import { MAX_TRACES_PER_PARTITION } from './delegatedExecutionTypes';
import {
  validateEnvelope, transitionEnvelopeLifecycle, consumeEnvelope,
} from './authorityEnvelopeEngine';
import {
  evaluateExecution,
} from './delegatedExecutionGovernance';
import {
  buildExecutionBudgetProfile, buildTimeoutBounds, runWithHardTimeout,
} from './executionBudgetGovernor';
import { publishCognitiveEvent } from '../realtime/cognitiveEventBus';

// ─── Trace storage ──────────────────────────────────────────────────

const traceStore = new Map<string, DelegatedExecutionReplayTrace[]>();
const recentExecutions24h = new Map<string, number[]>();
const recentRefusals24h = new Map<string, number[]>();
const recentTimeouts24h = new Map<string, number[]>();
const recentExpirations24h = new Map<string, number[]>();

function ensureTraceStore(organization_id: string): DelegatedExecutionReplayTrace[] {
  let s = traceStore.get(organization_id);
  if (!s) { s = []; traceStore.set(organization_id, s); }
  return s;
}

function bumpCounter(map: Map<string, number[]>, organization_id: string): void {
  let arr = map.get(organization_id);
  if (!arr) { arr = []; map.set(organization_id, arr); }
  arr.push(Date.now());
  const cutoff = Date.now() - 24 * 60 * 60_000;
  while (arr.length > 0 && arr[0] < cutoff) arr.shift();
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

// ─── Top-level execute ─────────────────────────────────────────────

export interface ExecuteDelegatedInput {
  readonly envelope_id: string;
  readonly issuer_organization_id: string;     // operator's organization
  readonly timeout_ms?: number;
}

/**
 * SYNCHRONOUS inline execution. Returns when execution completes,
 * fails, or times out. No deferred completion.
 */
export async function executeDelegated(input: ExecuteDelegatedInput): Promise<DelegatedExecutionResult> {
  const t0 = Date.now();
  const started_at = new Date(t0).toISOString();

  // 1. Validate envelope (existence, not consumed, not revoked, not expired, immutable).
  const validation = validateEnvelope(input.envelope_id);
  if (!validation.valid) {
    return refuseEarly(input.envelope_id, input.issuer_organization_id, validation.reason, t0, started_at);
  }
  const envelope = validation.envelope;

  // 2. Transition issued → verified.
  transitionEnvelopeLifecycle(envelope.envelope_id, 'verified');

  // 3. Execution gate (verifies 7 safety invariants).
  const gate = evaluateExecution({ envelope, issuer_organization_id: input.issuer_organization_id });
  if (gate.decision !== 'permitted') {
    consumeEnvelope(envelope.envelope_id, 'failed');
    bumpCounter(recentRefusals24h, envelope.target_organization_id);
    return refusedResult(envelope, input, gate.safety_invariants, gate.reason, t0, started_at);
  }

  // 4. Build budget + timeout bounds.
  const budget = buildExecutionBudgetProfile({ envelope_id: envelope.envelope_id, timeout_ms: input.timeout_ms });
  const timeout_bounds = buildTimeoutBounds(envelope.envelope_id, budget.max_runtime_ms, started_at);

  // 5. Transition verified → executing.
  transitionEnvelopeLifecycle(envelope.envelope_id, 'executing');

  // 6. Invoke the underlying mutator with hard timeout.
  let outcome: DelegatedExecutionOutcome;
  let mutator_response_summary = '';
  let rollback_chain_invoked_at: string | undefined;
  try {
    publishCognitiveEvent({
      kind: 'delegation.executed',
      project_id: 'system',
      severity: 'info',
      payload: { envelope_id: envelope.envelope_id, action_kind: envelope.action_kind, organization_id: envelope.target_organization_id },
    });
  } catch { /* noop */ }

  const mutator_promise = invokeMutator(envelope.action_kind, envelope, input.issuer_organization_id);
  const raceResult = await runWithHardTimeout(mutator_promise, budget.max_runtime_ms);

  if (raceResult.ok) {
    outcome = raceResult.value.outcome;
    mutator_response_summary = raceResult.value.summary;
    rollback_chain_invoked_at = raceResult.value.rollback_invoked_at;
  } else {
    outcome = 'timeout';
    mutator_response_summary = `hard timeout after ${budget.max_runtime_ms}ms`;
  }

  // 7. Consume envelope with terminal state.
  const terminal_state: 'completed' | 'failed' | 'expired' =
    outcome === 'success' ? 'completed'
    : outcome === 'timeout' ? 'expired'
    : 'failed';
  consumeEnvelope(envelope.envelope_id, terminal_state);

  // Track counters.
  if (outcome === 'success') bumpCounter(recentExecutions24h, envelope.target_organization_id);
  if (outcome === 'timeout') bumpCounter(recentTimeouts24h, envelope.target_organization_id);

  // Phase 28 — quota consumption recording. Always bump envelope slot
  // (one envelope was issued and used). Bump execution-specific keys
  // when execution actually ran (not on early refusal).
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { recordConsumption } = require('../executionEconomics/executionQuotaEngine');
    recordConsumption(envelope.target_organization_id, 'envelopes_per_24h', 1);
    if (outcome === 'success' || outcome === 'failure' || outcome === 'timeout') {
      recordConsumption(envelope.target_organization_id, 'executions_per_24h', 1);
      switch (envelope.action_kind) {
        case 'force_continuity_replay':
          recordConsumption(envelope.target_organization_id, 'continuity_replays_per_24h', 1);
          break;
        case 'execute_topology_recovery_step':
          recordConsumption(envelope.target_organization_id, 'topology_recovery_steps_per_24h', 1);
          break;
        case 'execute_distributed_recovery_step':
          recordConsumption(envelope.target_organization_id, 'rollback_chains_per_24h', 1);
          break;
      }
    }
  } catch { /* phase 28 not loaded — acceptable in test environments */ }

  const terminated_at = new Date().toISOString();
  const updated_timeout_bounds: DelegatedExecutionTimeoutBounds = {
    ...timeout_bounds,
    terminated_at,
    timeout_triggered: outcome === 'timeout',
    rollback_verification_completed: gate.safety_invariants.some(i => i.invariant_name === 'rollback_exists' && i.invariant_verified),
  };

  // 8. Build replay trace artifacts.
  const lineage: DelegatedExecutionAttributionLineage = {
    envelope_id: envelope.envelope_id,
    operator_id: envelope.operator_id,
    executed_at: started_at,
    action_kind: envelope.action_kind,
    actual_action_outcome: outcome === 'success' ? 'success'
      : outcome === 'timeout' ? 'timeout'
      : outcome === 'refused' ? 'refused'
      : 'failure',
    rollback_chain_invoked_at,
    source_attributions: [
      { source_kind: 'phase_27_envelope', source_id: envelope.envelope_id, source_phase: 'phase_23_execution_substrate' },
      { source_kind: 'phase_27_action', source_id: envelope.action_kind, source_phase: 'phase_21_runtime' },
    ],
  };

  const governance_replay_hash = buildGovernanceReplayHash(envelope, gate.safety_invariants);
  const boundary_proof_chain = buildBoundaryProofChain(envelope, gate.safety_invariants);
  const finality_proof = buildFinalityProof(envelope.envelope_id, terminal_state);

  const trace: DelegatedExecutionReplayTrace = {
    trace_id: `trace_${randomUUID()}`,
    envelope_id: envelope.envelope_id,
    operator_id: envelope.operator_id,
    organization_id: envelope.target_organization_id,
    action_kind: envelope.action_kind,
    attribution_lineage: lineage,
    governance_replay_hash,
    safety_invariants: gate.safety_invariants,
    boundary_proof_chain,
    timeout_bounds: updated_timeout_bounds,
    finality_proof,
    built_at: new Date().toISOString(),
  };

  const store = ensureTraceStore(envelope.target_organization_id);
  store.push(trace);
  if (store.length > MAX_TRACES_PER_PARTITION) store.shift();

  void budget;

  return {
    envelope_id: envelope.envelope_id,
    outcome,
    reason: outcome === 'success' ? 'mutator returned successfully'
      : outcome === 'timeout' ? `hard timeout after ${budget.max_runtime_ms}ms`
      : outcome === 'failure' ? mutator_response_summary
      : 'refused',
    executed_action_kind: envelope.action_kind,
    mutator_response_summary,
    trace,
  };
}

// ─── Mutator dispatcher (the only place real Phase 21/22/23 mutators are invoked) ─

interface MutatorResult {
  outcome: DelegatedExecutionOutcome;
  summary: string;
  rollback_invoked_at?: string;
}

async function invokeMutator(
  action_kind: DelegatableActionKind,
  envelope: import('./delegatedExecutionTypes').DelegatedAuthorityEnvelope,
  _issuer_organization_id: string,
): Promise<MutatorResult> {
  try {
    switch (action_kind) {
      case 'lift_broker_isolation': {
        if (!envelope.target_namespace) return { outcome: 'failure', summary: 'target_namespace missing' };
        const { liftIsolation } = await import('../distributedRuntime/brokerIsolationEngine');
        const lifted = liftIsolation(envelope.target_namespace, envelope.target_organization_id);
        return { outcome: lifted ? 'success' : 'failure', summary: lifted ? `broker namespace ${envelope.target_namespace} isolation lifted` : 'no active broker isolation' };
      }
      case 'lift_execution_isolation': {
        if (!envelope.target_kind) return { outcome: 'failure', summary: 'target_kind missing' };
        const { liftIsolation } = await import('../executionSubstrate/executionIsolationEngine');
        const lifted = liftIsolation(envelope.target_kind as any, envelope.target_organization_id);
        return { outcome: lifted ? 'success' : 'failure', summary: lifted ? `execution kind ${envelope.target_kind} isolation lifted` : 'no active execution isolation' };
      }
      case 'force_continuity_replay': {
        const { performContinuityReplay } = await import('../distributedRuntime/runtimeContinuityReplay');
        const replay = await performContinuityReplay({
          trigger: 'operator_clicked',
          organization_id: envelope.target_organization_id,
          operator_id: envelope.operator_id,
        });
        return {
          outcome: replay.bounds.replay_outcome === 'failed' ? 'failure' : 'success',
          summary: `continuity replay outcome=${replay.bounds.replay_outcome}, keys_replayed=${replay.bounds.keys_replayed}`,
        };
      }
      case 'execute_topology_recovery_step': {
        if (!envelope.target_plan_id || !envelope.target_step_id) return { outcome: 'failure', summary: 'plan_id or step_id missing' };
        const { executeTopologyRecoveryStep } = await import('../topology/topologyRecoveryOrchestrator');
        const result = await executeTopologyRecoveryStep({
          plan_id: envelope.target_plan_id,
          step_id: envelope.target_step_id,
          operator_id: envelope.operator_id,
        });
        return {
          outcome: result.executed ? 'success' : 'failure',
          summary: `topology step executed=${result.executed}, notes=${result.notes}`,
        };
      }
      case 'execute_distributed_recovery_step': {
        if (!envelope.target_plan_id || !envelope.target_step_id) return { outcome: 'failure', summary: 'plan_id or step_id missing' };
        const { executeRecoveryStep } = await import('../distributedRuntime/distributedRecoveryEngine');
        const result = await executeRecoveryStep({
          plan_id: envelope.target_plan_id,
          step_id: envelope.target_step_id,
          operator_id: envelope.operator_id,
        });
        return {
          outcome: result.executed ? 'success' : 'failure',
          summary: `distributed step executed=${result.executed}, notes=${result.notes}`,
        };
      }
    }
  } catch (err: any) {
    return { outcome: 'failure', summary: `mutator threw: ${err?.message ?? 'unknown'}` };
  }
}

// ─── Refusal helpers ──────────────────────────────────────────────

function refuseEarly(
  envelope_id: string, issuer_organization_id: string, reason: string,
  t0: number, started_at: string,
): DelegatedExecutionResult {
  bumpCounter(recentRefusals24h, issuer_organization_id);
  // Build a minimal trace for the refusal.
  const empty_invariants: ReadonlyArray<import('./delegatedExecutionTypes').DelegatedExecutionSafetyInvariant> = [];
  const trace: DelegatedExecutionReplayTrace = {
    trace_id: `trace_${randomUUID()}`,
    envelope_id,
    operator_id: 'unknown',
    organization_id: issuer_organization_id,
    action_kind: 'lift_broker_isolation', // placeholder — real action unknown when envelope itself is invalid
    attribution_lineage: {
      envelope_id, operator_id: 'unknown', executed_at: started_at,
      action_kind: 'lift_broker_isolation',
      actual_action_outcome: 'refused',
      source_attributions: [],
    },
    governance_replay_hash: {
      envelope_id, governance_mode_hash: '_', partition_isolation_state_hash: '_',
      rollback_coverage_state_hash: '_', execution_budget_state_hash: '_',
      composite_replay_hash: deterministicHash(`refuse::${envelope_id}::${reason}`),
    },
    safety_invariants: empty_invariants,
    boundary_proof_chain: {
      authority_validity_hash: '_', rollback_coverage_hash: '_',
      topology_containment_hash: '_', budget_compliance_hash: '_',
      single_use_proof_hash: '_',
    },
    timeout_bounds: {
      envelope_id, timeout_ms: 0, started_at,
      terminated_at: new Date().toISOString(),
      timeout_triggered: false, rollback_verification_completed: false,
    },
    finality_proof: buildFinalityProof(envelope_id, 'failed'),
    built_at: new Date().toISOString(),
  };
  void t0;
  return {
    envelope_id, outcome: 'refused', reason,
    trace,
  };
}

function refusedResult(
  envelope: import('./delegatedExecutionTypes').DelegatedAuthorityEnvelope,
  input: ExecuteDelegatedInput,
  safety_invariants: ReadonlyArray<import('./delegatedExecutionTypes').DelegatedExecutionSafetyInvariant>,
  reason: string,
  t0: number, started_at: string,
): DelegatedExecutionResult {
  bumpCounter(recentRefusals24h, envelope.target_organization_id);
  const lineage: DelegatedExecutionAttributionLineage = {
    envelope_id: envelope.envelope_id, operator_id: envelope.operator_id,
    executed_at: started_at, action_kind: envelope.action_kind,
    actual_action_outcome: 'refused',
    source_attributions: [],
  };
  const governance_replay_hash = buildGovernanceReplayHash(envelope, safety_invariants);
  const boundary_proof_chain = buildBoundaryProofChain(envelope, safety_invariants);
  const trace: DelegatedExecutionReplayTrace = {
    trace_id: `trace_${randomUUID()}`,
    envelope_id: envelope.envelope_id,
    operator_id: envelope.operator_id,
    organization_id: envelope.target_organization_id,
    action_kind: envelope.action_kind,
    attribution_lineage: lineage,
    governance_replay_hash,
    safety_invariants,
    boundary_proof_chain,
    timeout_bounds: {
      envelope_id: envelope.envelope_id, timeout_ms: 0, started_at,
      terminated_at: new Date().toISOString(),
      timeout_triggered: false,
      rollback_verification_completed: safety_invariants.some(i => i.invariant_name === 'rollback_exists' && i.invariant_verified),
    },
    finality_proof: buildFinalityProof(envelope.envelope_id, 'failed'),
    built_at: new Date().toISOString(),
  };
  const store = ensureTraceStore(envelope.target_organization_id);
  store.push(trace);
  if (store.length > MAX_TRACES_PER_PARTITION) store.shift();
  void input; void t0;
  return {
    envelope_id: envelope.envelope_id, outcome: 'refused', reason,
    executed_action_kind: envelope.action_kind,
    trace,
  };
}

// ─── Trace artifact builders ──────────────────────────────────────

function buildGovernanceReplayHash(
  envelope: import('./delegatedExecutionTypes').DelegatedAuthorityEnvelope,
  safety_invariants: ReadonlyArray<import('./delegatedExecutionTypes').DelegatedExecutionSafetyInvariant>,
): DelegatedGovernanceReplayHash {
  const governance_mode_hash = deterministicHash(`gov_mode::${envelope.envelope_id}::${safety_invariants.length}`);
  const partition_isolation_state_hash = deterministicHash(`partition::${envelope.target_organization_id}::${envelope.target_namespace ?? '_'}`);
  const rollback_coverage_state_hash = deterministicHash(`rollback::${envelope.rollback_chain_id}`);
  const execution_budget_state_hash = deterministicHash(`budget::${envelope.envelope_id}::single_use=${envelope.single_use}::max=${envelope.max_action_count}`);
  const composite_replay_hash = deterministicHash(
    `${governance_mode_hash}::${partition_isolation_state_hash}::${rollback_coverage_state_hash}::${execution_budget_state_hash}`,
  );
  return {
    envelope_id: envelope.envelope_id,
    governance_mode_hash,
    partition_isolation_state_hash,
    rollback_coverage_state_hash,
    execution_budget_state_hash,
    composite_replay_hash,
  };
}

function buildBoundaryProofChain(
  envelope: import('./delegatedExecutionTypes').DelegatedAuthorityEnvelope,
  safety_invariants: ReadonlyArray<import('./delegatedExecutionTypes').DelegatedExecutionSafetyInvariant>,
): AuthorityScopeBoundaryProofChain {
  const findInvariantHash = (name: import('./delegatedExecutionTypes').SafetyInvariantName): string =>
    safety_invariants.find(i => i.invariant_name === name)?.verification_hash
    ?? deterministicHash(`missing::${name}::${envelope.envelope_id}`);
  return {
    authority_validity_hash: findInvariantHash('authority_bounded'),
    rollback_coverage_hash: findInvariantHash('rollback_exists'),
    topology_containment_hash: findInvariantHash('topology_contained'),
    budget_compliance_hash: deterministicHash(`budget::${envelope.envelope_id}::compliance`),
    single_use_proof_hash: deterministicHash(`single_use::${envelope.envelope_id}::${envelope.single_use}`),
  };
}

function buildFinalityProof(envelope_id: string, terminal_state: 'completed' | 'failed' | 'expired'): DelegatedExecutionFinalityProof {
  const finalized_at = new Date().toISOString();
  const finality_hash = deterministicHash(`finality::${envelope_id}::${terminal_state}::${finalized_at}`);
  return {
    envelope_id,
    finalized_at,
    terminal_state,
    cannot_re_execute: true,
    cannot_re_consume: true,
    cannot_re_validate: true,
    finality_hash,
  };
}

// ─── Read APIs ────────────────────────────────────────────────────

export function listExecutionTraces(organization_id: string): ReadonlyArray<DelegatedExecutionReplayTrace> {
  return [...(traceStore.get(organization_id) ?? [])].reverse();
}

export function getExecutionTrace(organization_id: string, envelope_id: string): DelegatedExecutionReplayTrace | null {
  const traces = traceStore.get(organization_id) ?? [];
  return traces.find(t => t.envelope_id === envelope_id) ?? null;
}

export function recentExecutionCount24h(organization_id?: string): number {
  return countWindow(recentExecutions24h, organization_id);
}
export function recentRefusalCount24h(organization_id?: string): number {
  return countWindow(recentRefusals24h, organization_id);
}
export function recentTimeoutCount24h(organization_id?: string): number {
  return countWindow(recentTimeouts24h, organization_id);
}
export function recentExpirationCount24h(organization_id?: string): number {
  return countWindow(recentExpirations24h, organization_id);
}

function countWindow(map: Map<string, number[]>, organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  if (organization_id) {
    const arr = map.get(organization_id) ?? [];
    return arr.filter(t => t >= cutoff).length;
  }
  let total = 0;
  for (const arr of map.values()) total += arr.filter(t => t >= cutoff).length;
  return total;
}

export function _resetCoordinatorForTests(): void {
  traceStore.clear();
  recentExecutions24h.clear();
  recentRefusals24h.clear();
  recentTimeouts24h.clear();
  recentExpirations24h.clear();
}
