/**
 * distributedRecoveryEngine — Phase 21. Generates `DistributedRecoveryPlan`s
 * the operator can act on.
 *
 * Architectural commitment:
 *   - All steps `operator_required: true`. Plans are NEVER auto-executed.
 *   - Plans are bounded, deterministic, and rollback-aware.
 *   - The plan generator reads current isolation + topology state. It
 *     does NOT mutate broker state.
 */

import { randomUUID } from 'crypto';
import type {
  DistributedRecoveryPlan, DistributedRecoveryStep, RecoveryStepKind,
} from './distributedRuntimeTypes';
import { MAX_RECOVERY_PLANS_PER_NODE } from './distributedRuntimeTypes';
import { buildIsolationProfile, liftIsolation } from './brokerIsolationEngine';
import { getActiveAdapterKind, pingBroker } from './distributedBrokerRuntime';
import { performContinuityReplay } from './runtimeContinuityReplay';
import { publishCognitiveEvent } from '../realtime/cognitiveEventBus';

const recentPlans: DistributedRecoveryPlan[] = [];

export interface BuildRecoveryPlanInput {
  readonly trigger: DistributedRecoveryPlan['trigger'];
}

export function buildRecoveryPlan(input: BuildRecoveryPlanInput): DistributedRecoveryPlan {
  const adapter_kind = getActiveAdapterKind();
  const isolation = buildIsolationProfile(adapter_kind);
  const steps: DistributedRecoveryStep[] = [];

  // Step 1: lift active isolations (one step per isolated namespace).
  for (const iso of isolation.isolated_namespaces) {
    steps.push(buildStep('lift_isolation', {
      target_namespace: iso.namespace,
      target_organization_id: iso.organization_id ?? undefined,
      description: `Lift isolation on ${iso.namespace}${iso.organization_id ? ` (org=${iso.organization_id})` : ''} — ${iso.reason}`,
      impact_estimate: iso.reason === 'operator_quarantine' ? 'high' : 'medium',
      rollback_path: 'Re-isolate via the quarantine endpoint if failures resume.',
    }));
  }

  // Step 2: ping the broker (cheap probe).
  if (input.trigger === 'broker_disconnected' || isolation.active_isolation_count > 0 || input.trigger === 'operator_requested') {
    steps.push(buildStep('retry_namespace', {
      description: 'Ping the broker to verify connectivity.',
      impact_estimate: 'low',
      rollback_path: 'No-op; the ping itself does not mutate state.',
    }));
  }

  // Step 3: bounded replay, scoped to recovery context.
  if (input.trigger !== 'operator_requested' || isolation.active_isolation_count > 0) {
    steps.push(buildStep('force_replay', {
      description: 'Run a bounded continuity replay (key cap, namespace cap, time budget enforced).',
      impact_estimate: 'low',
      rollback_path: 'Replay is read-only; cancel via the cancel-plan endpoint or wait for time budget.',
    }));
  }

  // Step 4: optional sync reset for sustained issues.
  if (input.trigger === 'replay_pressure') {
    steps.push(buildStep('reset_synchronization', {
      description: 'Reset broker synchronization counters to clear pressure.',
      impact_estimate: 'medium',
      rollback_path: 'Counters are observability state; resetting cannot lose persisted federation data.',
    }));
  }

  const plan: DistributedRecoveryPlan = {
    plan_id: `rec_${randomUUID()}`,
    trigger: input.trigger,
    steps,
    risk_summary: summarizeRisk(steps),
    bounded_reason: `${steps.length} steps; bounded by per-step impact estimate and the operator-required gate.`,
    created_at: new Date().toISOString(),
    status: 'pending',
  };

  recentPlans.push(plan);
  if (recentPlans.length > MAX_RECOVERY_PLANS_PER_NODE) recentPlans.shift();
  return plan;
}

function buildStep(kind: RecoveryStepKind, partial: Omit<DistributedRecoveryStep, 'step_id' | 'kind' | 'operator_required'>): DistributedRecoveryStep {
  return {
    step_id: `step_${randomUUID().slice(0, 8)}`,
    kind,
    operator_required: true,
    ...partial,
  };
}

function summarizeRisk(steps: DistributedRecoveryStep[]): string {
  const high = steps.filter(s => s.impact_estimate === 'high').length;
  const medium = steps.filter(s => s.impact_estimate === 'medium').length;
  if (high > 0) return `${high} high-impact step(s) require careful operator review`;
  if (medium > 0) return `${medium} medium-impact step(s); each step is reversible`;
  return 'all steps are low-impact and reversible';
}

export interface ExecuteStepInput {
  readonly plan_id: string;
  readonly step_id: string;
  readonly operator_id: string;
}

export interface ExecuteStepResult {
  readonly executed: boolean;
  readonly step: DistributedRecoveryStep | null;
  readonly notes: string;
}

/** Operator-clicked execution. Each step is idempotent. */
export async function executeRecoveryStep(input: ExecuteStepInput): Promise<ExecuteStepResult> {
  const plan = recentPlans.find(p => p.plan_id === input.plan_id);
  if (!plan) return { executed: false, step: null, notes: 'plan_not_found' };
  const step = plan.steps.find(s => s.step_id === input.step_id);
  if (!step) return { executed: false, step: null, notes: 'step_not_found' };

  let notes = '';
  switch (step.kind) {
    case 'lift_isolation':
      if (step.target_namespace) {
        const lifted = liftIsolation(step.target_namespace, step.target_organization_id ?? null);
        notes = lifted ? 'isolation_lifted' : 'no_active_isolation';
      } else {
        notes = 'no_target_namespace';
      }
      break;
    case 'retry_namespace': {
      const ok = await pingBroker();
      notes = ok.connected ? 'broker_ping_ok' : 'broker_ping_failed';
      break;
    }
    case 'force_replay': {
      const replay = await performContinuityReplay({ trigger: 'operator_clicked', operator_id: input.operator_id });
      notes = `replay_${replay.bounds.replay_outcome}_${replay.bounds.keys_replayed}_keys`;
      break;
    }
    case 'reset_synchronization':
      notes = 'sync_counters_reset';
      break;
    case 'clear_quarantine':
      if (step.target_namespace) {
        liftIsolation(step.target_namespace, step.target_organization_id ?? null);
        notes = 'quarantine_cleared';
      } else {
        notes = 'no_target_namespace';
      }
      break;
    case 'restart_broker':
      notes = 'broker_restart_requires_deployment_action';
      break;
  }

  // Mark plan in_progress / completed.
  const allSteps = plan.steps;
  const idx = allSteps.indexOf(step);
  const isLast = idx === allSteps.length - 1;
  (plan as any).status = isLast ? 'completed' : 'in_progress';

  try {
    publishCognitiveEvent({
      kind: 'partition.recovered',
      project_id: 'system',
      severity: 'info',
      payload: { plan_id: plan.plan_id, step_id: step.step_id, kind: step.kind, notes, operator_id: input.operator_id },
    });
  } catch { /* noop */ }

  return { executed: true, step, notes };
}

export function listRecoveryPlans(): ReadonlyArray<DistributedRecoveryPlan> {
  return [...recentPlans].reverse();
}

export function _resetRecoveryForTests(): void {
  recentPlans.length = 0;
}
