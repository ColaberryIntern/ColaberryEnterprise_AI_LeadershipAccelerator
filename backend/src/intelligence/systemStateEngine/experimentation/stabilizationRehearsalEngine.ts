/**
 * stabilizationRehearsalEngine — Phase 25. Operator-defined chain of
 * recovery actions; engine walks the chain step-by-step against an
 * in-memory baseline and returns projected continuity restoration.
 *
 * Architectural commitment:
 *   - Operator-chained only. No auto-build, no chain optimization,
 *     no chain inference.
 *   - Bounded depth ≤ MAX_REHEARSAL_CHAIN_DEPTH=5.
 *   - Walks Phase 21/22/23 state in-memory; never invokes mutators.
 */

import { randomUUID, createHash } from 'crypto';
import type {
  StabilizationRehearsalReplay, StabilizationRehearsalStep,
  HypotheticalAction, ProjectionDeltaAttribution,
  SandboxDeterminismAttribution,
} from './experimentationTypes';
import {
  MAX_REHEARSAL_CHAIN_DEPTH, MAX_REHEARSALS_PER_PARTITION,
  MAX_PROJECTION_BUDGET_MS,
} from './experimentationTypes';
import { submitExecutionSandbox } from './executionSandboxEngine';
import { publishCognitiveEvent } from '../realtime/cognitiveEventBus';

const partitions = new Map<string, StabilizationRehearsalReplay[]>();

function ensure(organization_id: string): StabilizationRehearsalReplay[] {
  let s = partitions.get(organization_id);
  if (!s) { s = []; partitions.set(organization_id, s); }
  return s;
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export interface RehearseStabilizationInput {
  readonly organization_id: string;
  readonly experiment_id?: string;
  readonly chain: ReadonlyArray<HypotheticalAction>;
}

export interface RehearseStabilizationResult {
  readonly success: boolean;
  readonly replay?: StabilizationRehearsalReplay;
  readonly rejection_reason?: string;
}

export function rehearseStabilization(input: RehearseStabilizationInput): RehearseStabilizationResult {
  if (input.chain.length === 0) {
    return { success: false, rejection_reason: 'empty_chain' };
  }
  if (input.chain.length > MAX_REHEARSAL_CHAIN_DEPTH) {
    return { success: false, rejection_reason: `chain_depth=${input.chain.length}_exceeds_max=${MAX_REHEARSAL_CHAIN_DEPTH}` };
  }

  const t0 = Date.now();
  const rehearsal_id = `rehearse_${randomUUID()}`;
  const experiment_id = input.experiment_id ?? `exp_${randomUUID()}`;

  const steps: StabilizationRehearsalStep[] = [];
  let bounded_reason: string | undefined;
  let projected_final_status: StabilizationRehearsalStep['projected_continuity_status'] = 'continuous';

  // Walk the chain step-by-step. Each step submits a single-action sandbox
  // and reads its projected_deltas. The combined chain is bounded.
  for (let i = 0; i < input.chain.length; i++) {
    if (Date.now() - t0 > MAX_PROJECTION_BUDGET_MS) {
      bounded_reason = 'projection_budget_exhausted';
      break;
    }
    const action = input.chain[i];
    const sandboxResult = submitExecutionSandbox({
      organization_id: input.organization_id,
      hypothetical_actions: [action],
      tier: 'single_step_projection',
    });
    if (!sandboxResult.permitted) {
      return { success: false, rejection_reason: `step_${i}_rejected:${sandboxResult.reason}` };
    }
    const projected_deltas: ReadonlyArray<ProjectionDeltaAttribution> = sandboxResult.sandbox.projected_deltas;
    const projected_status = inferContinuityStatus(action, projected_deltas);
    projected_final_status = projected_status;
    steps.push({
      step_index: i,
      action,
      projected_deltas,
      projected_continuity_status: projected_status,
      explanation: explainStep(action, projected_deltas, projected_status),
    });
  }

  const baseline_state_hash = deterministicHash(JSON.stringify({ org: input.organization_id, t: 'rehearsal_baseline' }));
  const hypothetical_action_hash = deterministicHash(JSON.stringify(input.chain.map(a => ({ k: a.kind, ns: a.target_namespace, w: a.target_worker_id, kk: a.target_kind }))));
  const projected_state_hash = deterministicHash(`${baseline_state_hash}::${hypothetical_action_hash}::${projected_final_status}::${steps.length}`);

  const determinism: SandboxDeterminismAttribution = {
    sandbox_id: rehearsal_id,
    baseline_state_hash,
    projected_state_hash,
    hypothetical_action_hash,
    replayable: true,
    deterministic: true,
    recorded_at: new Date().toISOString(),
  };

  const replay: StabilizationRehearsalReplay = {
    rehearsal_id,
    experiment_id,
    organization_id: input.organization_id,
    steps,
    projected_final_status,
    determinism,
    bounded_reason,
    built_at: new Date().toISOString(),
  };

  const store = ensure(input.organization_id);
  store.push(replay);
  if (store.length > MAX_REHEARSALS_PER_PARTITION) store.shift();

  try {
    publishCognitiveEvent({
      kind: 'rehearsal.executed',
      project_id: 'system',
      severity: 'info',
      payload: {
        rehearsal_id, experiment_id, organization_id: input.organization_id,
        step_count: steps.length, projected_final_status,
      },
    });
  } catch { /* noop */ }

  return { success: true, replay };
}

function inferContinuityStatus(
  action: HypotheticalAction,
  deltas: ReadonlyArray<ProjectionDeltaAttribution>,
): StabilizationRehearsalStep['projected_continuity_status'] {
  if (action.kind === 'add_broker_isolation') {
    return 'degraded';
  }
  if (action.kind === 'lift_broker_isolation' || action.kind === 'lift_execution_isolation') {
    return deltas.some(d => d.projected_change_kind === 'isolation_lifted') ? 'restored' : 'continuous';
  }
  if (action.kind === 'force_continuity_replay') {
    return 'restored';
  }
  if (action.kind === 'execute_topology_recovery_step') {
    return 'restored';
  }
  if (action.kind === 'rollback_worker_lifecycle') {
    return 'restored';
  }
  return 'continuous';
}

function explainStep(
  action: HypotheticalAction,
  deltas: ReadonlyArray<ProjectionDeltaAttribution>,
  status: StabilizationRehearsalStep['projected_continuity_status'],
): string {
  const target = action.target_namespace ?? action.target_kind ?? action.target_worker_id ?? '_system';
  return `Step ${action.kind} on ${target} produced ${deltas.length} projected delta(s); projected continuity status: ${status}.`;
}

export function listRehearsals(organization_id: string): ReadonlyArray<StabilizationRehearsalReplay> {
  return [...(partitions.get(organization_id) ?? [])].reverse();
}

export function recentRehearsalCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  if (organization_id) {
    return (partitions.get(organization_id) ?? []).filter(r => Date.parse(r.built_at) >= cutoff).length;
  }
  let total = 0;
  for (const list of partitions.values()) {
    total += list.filter(r => Date.parse(r.built_at) >= cutoff).length;
  }
  return total;
}

export function _resetRehearsalsForTests(): void {
  partitions.clear();
}
