/**
 * rollbackSimulationEngine — Phase 25. Dry-run walk over existing
 * Phase 23 rollback execution plan steps + Phase 15/22 source chain
 * references.
 *
 * Architectural commitment:
 *   - DRY-RUN ONLY. Reads chain data, walks projected transitions,
 *     NEVER invokes rollback execution.
 *   - Bounded ring buffer per partition.
 */

import { randomUUID, createHash } from 'crypto';
import type {
  RollbackSimulationReplay, RollbackSimulationStep,
  SandboxDeterminismAttribution,
} from './experimentationTypes';
import {
  MAX_ROLLBACK_SIMULATIONS_PER_PARTITION, MAX_PROJECTION_BUDGET_MS,
} from './experimentationTypes';
import { listRollbackPlans } from '../executionSubstrate/rollbackExecutionCoordinator';
import { listEnvelopes } from '../executionSubstrate/executionRuntimeCoordinator';
import { publishCognitiveEvent } from '../realtime/cognitiveEventBus';

const partitions = new Map<string, RollbackSimulationReplay[]>();

function ensure(organization_id: string): RollbackSimulationReplay[] {
  let s = partitions.get(organization_id);
  if (!s) {
    s = [];
    partitions.set(organization_id, s);
  }
  return s;
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export interface SimulateRollbackInput {
  readonly organization_id: string;
  readonly experiment_id?: string;
  readonly plan_id?: string;            // simulate this specific plan
  readonly source_chain_ids?: ReadonlyArray<string>;  // OR simulate these chain refs
}

export function simulateRollback(input: SimulateRollbackInput): RollbackSimulationReplay {
  const t0 = Date.now();
  const simulation_id = `rsim_${randomUUID()}`;
  const experiment_id = input.experiment_id ?? `exp_${randomUUID()}`;

  const plans = listRollbackPlans(input.organization_id);
  const targetPlan = input.plan_id ? plans.find(p => p.plan_id === input.plan_id) : plans[0];
  const sourceChainIds = input.source_chain_ids
    ?? (targetPlan ? targetPlan.source_chains.map(c => c.chain_id) : []);

  const envelopes = listEnvelopes(input.organization_id);
  const simWorkerLifecycle = new Map<string, string>();
  for (const env of envelopes) simWorkerLifecycle.set(env.worker_id, env.lifecycle_state);

  const steps: RollbackSimulationStep[] = [];
  let bounded_reason: string | undefined;
  let stepIdx = 0;

  if (targetPlan) {
    for (const planStep of targetPlan.steps) {
      if (Date.now() - t0 > MAX_PROJECTION_BUDGET_MS) {
        bounded_reason = 'projection_budget_exhausted';
        break;
      }
      // Project a lifecycle transition: pick the next failed/interrupted worker
      // and project a rolled_back transition. Pure projection — never mutates.
      const candidate = Array.from(simWorkerLifecycle.entries()).find(
        ([_, state]) => state === 'failed' || state === 'interrupted',
      );
      let from = 'unknown';
      let to = 'rolled_back';
      let workerId: string | undefined;
      if (candidate) {
        workerId = candidate[0];
        from = candidate[1];
        simWorkerLifecycle.set(workerId, 'rolled_back');     // simulated only
      }
      steps.push({
        step_index: stepIdx++,
        source_step_ref: planStep.source_step_ref,
        source_phase: planStep.source_phase,
        projected_lifecycle_transition: {
          worker_id: workerId,
          from, to,
        },
        projected_namespace_change: workerId ? {
          namespace: workerId,
          projected_change_kind: 'worker_lifecycle_advanced',
          derived_from_action: planStep.step_id,
          dependency_depth: 0,
          projected_impact_score: 50,
        } : undefined,
        explanation: `Rolling back worker ${workerId ?? '(none-available)'} from ${from} → rolled_back via Phase ${planStep.source_phase} chain step ${planStep.source_step_ref}.`,
      });
    }
  } else {
    bounded_reason = 'no_target_plan_or_chains_found';
  }

  // Project outcome distribution. For v1 we estimate "all_full" if all
  // steps had a worker to flip; "skipped" if none; otherwise "partial".
  const flipped = steps.filter(s => s.projected_lifecycle_transition.worker_id).length;
  const projected_outcome: RollbackSimulationReplay['projected_outcome'] =
    steps.length === 0 ? 'skipped'
    : flipped === steps.length ? 'all_full'
    : flipped === 0 ? 'failed'
    : 'partial';

  const baseline_state_hash = deterministicHash(JSON.stringify(envelopes.map(e => ({ id: e.worker_id, s: e.lifecycle_state }))));
  const hypothetical_action_hash = deterministicHash(JSON.stringify(sourceChainIds));
  const projected_state_hash = deterministicHash(`${baseline_state_hash}::${hypothetical_action_hash}::${steps.length}::${projected_outcome}`);

  const determinism: SandboxDeterminismAttribution = {
    sandbox_id: simulation_id,
    baseline_state_hash,
    projected_state_hash,
    hypothetical_action_hash,
    replayable: true,
    deterministic: true,
    recorded_at: new Date().toISOString(),
  };

  const replay: RollbackSimulationReplay = {
    simulation_id,
    experiment_id,
    organization_id: input.organization_id,
    source_chain_ids: sourceChainIds,
    steps,
    projected_outcome,
    determinism,
    bounded_reason,
    built_at: new Date().toISOString(),
  };

  const store = ensure(input.organization_id);
  store.push(replay);
  if (store.length > MAX_ROLLBACK_SIMULATIONS_PER_PARTITION) store.shift();

  try {
    publishCognitiveEvent({
      kind: 'rollback.simulated',
      project_id: 'system',
      severity: 'info',
      payload: {
        simulation_id, experiment_id, organization_id: input.organization_id,
        step_count: steps.length, projected_outcome,
      },
    });
  } catch { /* noop */ }

  return replay;
}

export function listRollbackSimulations(organization_id: string): ReadonlyArray<RollbackSimulationReplay> {
  return [...(partitions.get(organization_id) ?? [])].reverse();
}

export function recentRollbackSimulationCount24h(organization_id?: string): number {
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

export function _resetRollbackSimulationsForTests(): void {
  partitions.clear();
}
