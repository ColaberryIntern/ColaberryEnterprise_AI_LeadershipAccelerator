/**
 * rollbackExecutionCoordinator — Phase 23. Thin AGGREGATION wrapper
 * over Phase 15 mutation rollback chains, Phase 21 distributed
 * recovery plans, and Phase 22 topology recovery plans.
 *
 * Architectural commitment:
 *   - NEVER builds a parallel rollback engine.
 *   - Aggregates source chains into one operator-facing `RollbackExecutionPlan`.
 *   - Operator-clicked execution: every step inherits `operator_required:true`
 *     from its source phase.
 *   - Records a `RollbackContinuityBounds` per source chain it links to.
 */

import { randomUUID } from 'crypto';
import type {
  RollbackExecutionPlan, RollbackExecutionStep, RollbackSourcePhase,
  RollbackContinuityBounds, RollbackOutcome,
} from './executionSubstrateTypes';
import { MAX_ROLLBACK_PLANS_PER_PARTITION } from './executionSubstrateTypes';
import { markRolledBack } from './executionRuntimeCoordinator';
import { publishCognitiveEvent } from '../realtime/cognitiveEventBus';

interface PartitionStore {
  plans: RollbackExecutionPlan[];
  bounds: RollbackContinuityBounds[];
}

const partitions = new Map<string, PartitionStore>();

function ensure(organization_id: string): PartitionStore {
  let s = partitions.get(organization_id);
  if (!s) {
    s = { plans: [], bounds: [] };
    partitions.set(organization_id, s);
  }
  return s;
}

export interface BuildRollbackPlanInput {
  readonly organization_id: string;
  readonly trigger: RollbackExecutionPlan['trigger'];
  /** Phase-specific source chains the operator wants aggregated. Caller
   *  passes already-built chain references; the coordinator does not run
   *  the underlying phases itself. */
  readonly source_chains: ReadonlyArray<{
    readonly source_phase: RollbackSourcePhase;
    readonly chain_id: string;
    readonly steps: ReadonlyArray<{
      readonly source_step_ref: string;
      readonly description: string;
      readonly impact_estimate: 'low' | 'medium' | 'high';
    }>;
  }>;
}

export function buildRollbackExecutionPlan(input: BuildRollbackPlanInput): RollbackExecutionPlan {
  const steps: RollbackExecutionStep[] = [];
  const source_chains = input.source_chains.map(c => ({
    source_phase: c.source_phase,
    chain_id: c.chain_id,
    step_count: c.steps.length,
  }));

  for (const chain of input.source_chains) {
    for (const s of chain.steps) {
      steps.push({
        step_id: `rstep_${randomUUID().slice(0, 8)}`,
        source_phase: chain.source_phase,
        source_step_ref: s.source_step_ref,
        description: s.description,
        operator_required: true,
        impact_estimate: s.impact_estimate,
      });
    }
  }

  const aggregation_summary = `Aggregated ${input.source_chains.length} source chain(s) covering ${steps.length} step(s) across ${new Set(input.source_chains.map(c => c.source_phase)).size} phase(s).`;

  const plan: RollbackExecutionPlan = {
    plan_id: `rollback_${randomUUID()}`,
    organization_id: input.organization_id,
    trigger: input.trigger,
    steps,
    aggregation_summary,
    source_chains,
    bounded_reason: `Bounded by per-step operator-required gate, MAX_ROLLBACK_PLANS_PER_PARTITION=${MAX_ROLLBACK_PLANS_PER_PARTITION}, and the underlying source phase budgets.`,
    created_at: new Date().toISOString(),
    status: 'pending',
  };

  const store = ensure(input.organization_id);
  store.plans.push(plan);
  if (store.plans.length > MAX_ROLLBACK_PLANS_PER_PARTITION) store.plans.shift();

  try {
    publishCognitiveEvent({
      kind: 'rollback.orchestrated',
      project_id: 'system',
      severity: 'info',
      payload: {
        plan_id: plan.plan_id,
        organization_id: input.organization_id,
        trigger: input.trigger,
        source_chains: source_chains.length,
        step_count: steps.length,
      },
    });
  } catch { /* noop */ }

  return plan;
}

export interface RecordRollbackContinuityInput {
  readonly organization_id: string;
  readonly rollback_chain_id: string;
  readonly steps_replayed: number;
  readonly max_chain_depth: number;
  readonly time_elapsed_ms: number;
  readonly outcome: RollbackOutcome;
  readonly bounded_reason?: string;
  readonly source_phase: RollbackSourcePhase;
  /** Optional: the worker_id whose lifecycle should be flipped to `rolled_back`. */
  readonly worker_id?: string;
}

export function recordRollbackContinuity(input: RecordRollbackContinuityInput): RollbackContinuityBounds {
  const bounds: RollbackContinuityBounds = {
    rollback_chain_id: input.rollback_chain_id,
    steps_replayed: input.steps_replayed,
    max_chain_depth: input.max_chain_depth,
    time_elapsed_ms: input.time_elapsed_ms,
    outcome: input.outcome,
    bounded_reason: input.bounded_reason,
    source_phase: input.source_phase,
  };
  const store = ensure(input.organization_id);
  store.bounds.push(bounds);
  if (store.bounds.length > MAX_ROLLBACK_PLANS_PER_PARTITION * 4) store.bounds.shift();

  if (input.worker_id) {
    markRolledBack(input.worker_id, input.rollback_chain_id);
  }
  return bounds;
}

export function listRollbackPlans(organization_id: string): ReadonlyArray<RollbackExecutionPlan> {
  return [...(partitions.get(organization_id)?.plans ?? [])].reverse();
}

export function listRollbackContinuityBounds(organization_id: string): ReadonlyArray<RollbackContinuityBounds> {
  return [...(partitions.get(organization_id)?.bounds ?? [])].reverse();
}

export function _resetRollbackForTests(): void {
  partitions.clear();
}
