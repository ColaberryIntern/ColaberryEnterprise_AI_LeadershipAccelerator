/**
 * cognitivePolicyEngine — single source of truth for the runtime
 * orchestration policy: weights, escalation thresholds, cooldowns,
 * confidence floors, governance rules.
 *
 * Reads / writes live policy state for a project. Persists snapshots
 * to `learning_policy_snapshots` whenever a material change happens.
 *
 * Phase 10 §13.
 */
import type { PriorityWeights } from '../learning/adaptivePriorityTrainer';
import { BASELINE_WEIGHTS } from '../learning/adaptivePriorityTrainer';
import type { GuardrailConfig } from './safeLearningGuardrails';
import { DEFAULT_GUARDRAILS } from './safeLearningGuardrails';

export interface AdaptiveEscalationThresholds {
  warning_dispatch_min_occurrences: number;
  warning_to_error_min_occurrences: number;
  redispatch_after_min: number;
  correlation_window_min: number;
  reopen_window_hours: number;
}

export const DEFAULT_ESCALATION_THRESHOLDS: AdaptiveEscalationThresholds = Object.freeze({
  warning_dispatch_min_occurrences: 3,
  warning_to_error_min_occurrences: 5,
  redispatch_after_min: 60,
  correlation_window_min: 30,
  reopen_window_hours: 24,
});

export interface CognitivePolicy {
  readonly project_id: string;
  readonly priority_weights: PriorityWeights;
  readonly escalation: AdaptiveEscalationThresholds;
  readonly guardrails: GuardrailConfig;
  readonly version: number;
  readonly updated_at: string;
}

const policies = new Map<string, CognitivePolicy>();
const recentDrift = new Map<string, number>();
const consecutiveWorse = new Map<string, number>();

function defaultPolicy(projectId: string): CognitivePolicy {
  return {
    project_id: projectId,
    priority_weights: BASELINE_WEIGHTS,
    escalation: DEFAULT_ESCALATION_THRESHOLDS,
    guardrails: DEFAULT_GUARDRAILS,
    version: 1,
    updated_at: new Date().toISOString(),
  };
}

export function getPolicy(projectId: string): CognitivePolicy {
  return policies.get(projectId) ?? defaultPolicy(projectId);
}

export function recentDriftFor(projectId: string): number {
  return recentDrift.get(projectId) ?? 0;
}

export function consecutiveWorseOutcomesFor(projectId: string): number {
  return consecutiveWorse.get(projectId) ?? 0;
}

export function recordOutcomeOutcome(projectId: string, betterThanBaseline: boolean): void {
  if (betterThanBaseline) consecutiveWorse.set(projectId, 0);
  else consecutiveWorse.set(projectId, (consecutiveWorse.get(projectId) ?? 0) + 1);
}

export interface PolicyUpdate {
  readonly priority_weights?: PriorityWeights;
  readonly escalation?: Partial<AdaptiveEscalationThresholds>;
  readonly guardrails?: Partial<GuardrailConfig>;
  readonly trigger: string;
  readonly applied_drift?: number;
}

export async function updatePolicy(projectId: string, update: PolicyUpdate, opts: { confidence?: number; persist?: boolean } = {}): Promise<CognitivePolicy> {
  const current = getPolicy(projectId);
  const next: CognitivePolicy = {
    project_id: projectId,
    priority_weights: update.priority_weights ?? current.priority_weights,
    escalation: { ...current.escalation, ...(update.escalation ?? {}) },
    guardrails: { ...current.guardrails, ...(update.guardrails ?? {}) },
    version: current.version + 1,
    updated_at: new Date().toISOString(),
  };
  policies.set(projectId, next);

  if (typeof update.applied_drift === 'number') {
    recentDrift.set(projectId, (recentDrift.get(projectId) ?? 0) + update.applied_drift);
  }

  // Persist a snapshot (best-effort)
  if (opts.persist !== false) {
    try {
      const { default: LearningPolicySnapshot } = await import('../../../models/LearningPolicySnapshot');
      const deltas = computeDeltas(current, next);
      await LearningPolicySnapshot.create({
        project_id: projectId,
        trigger: update.trigger,
        policy: next,
        deltas,
        confidence: opts.confidence ?? 50,
        recorded_at: new Date(),
      } as any);
    } catch (err: any) {
      console.warn('[cognitivePolicyEngine] snapshot persist failed:', err?.message);
    }
  }
  return next;
}

function computeDeltas(prev: CognitivePolicy, next: CognitivePolicy): Record<string, number> {
  const deltas: Record<string, number> = {};
  for (const k of Object.keys(prev.priority_weights) as Array<keyof PriorityWeights>) {
    const d = next.priority_weights[k] - prev.priority_weights[k];
    if (Math.abs(d) > 0.0005) deltas[`weight.${k}`] = Math.round(d * 1000) / 1000;
  }
  for (const k of Object.keys(prev.escalation) as Array<keyof AdaptiveEscalationThresholds>) {
    const d = next.escalation[k] - prev.escalation[k];
    if (d !== 0) deltas[`escalation.${k}`] = d;
  }
  return deltas;
}

/** Test helper. */
export function _resetPoliciesForTests(): void {
  policies.clear();
  recentDrift.clear();
  consecutiveWorse.clear();
}
