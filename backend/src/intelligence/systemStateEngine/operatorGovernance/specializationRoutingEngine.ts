/**
 * specializationRoutingEngine — Phase 18. Soft routing bias on top of
 * Phase 17's adaptive weights. Produces `RoutingAttribution` per
 * validator + a `weight_overrides` map suitable for direct passthrough
 * to Phase 16's `arbitrate(weight_overrides)` parameter.
 *
 * Architectural commitment (per Phase 18 stress-test):
 *   - Routing is SOFT. Validators are NEVER excluded from arbitration.
 *   - Hard architectural vetoes (containment confidence ≤ 20 → reject)
 *     remain absolute and unaffected by routing bias.
 *   - Bias multipliers are clamped to [ROUTING_BIAS_MIN, ROUTING_BIAS_MAX].
 *   - Operator routing overrides take precedence over computed bias.
 */

import type {
  ValidatorRole, MutationIntent,
} from '../causality/causalityTypes';
import { VALIDATOR_ROLES } from '../causality/distributedValidationHarness';
import type {
  RoutingAttribution, SpecializationRoutingDecision, RoutingStabilityTier,
} from './operatorGovernanceTypes';
import { ROUTING_BIAS_MIN, ROUTING_BIAS_MAX } from './operatorGovernanceTypes';
import { specializationAccuracy, buildSpecializationMap } from '../adaptiveGovernance/validatorSpecializationAnalyzer';
import { buildDriftProfile } from '../adaptiveGovernance/validatorDriftDetector';
import { buildAdaptiveWeights } from '../adaptiveGovernance/adaptiveValidatorEngine';

const STRONG_BIAS = 1.20;
const WEAK_BIAS = 0.70;
const NEUTRAL_BIAS = 1.0;
const VOLATILE_HISTORY_SIZE = 8;
const VOLATILE_VARIANCE_THRESHOLD = 0.15;     // 15% variance across recent decisions = volatile

interface RoutingHistoryEntry {
  readonly target_intent: MutationIntent;
  readonly bias_by_role: Readonly<Record<ValidatorRole, number>>;
  readonly recorded_at: number;
}

interface RoutingState {
  history: RoutingHistoryEntry[];
  /** Operator-set fixed routing overrides keyed by `${role}::${intent}`. */
  operator_overrides: Map<string, { fixed_bias: number; set_by: string; set_at: string }>;
  routing_suppressed: boolean;
}

const projectStates = new Map<string, RoutingState>();

function getProjectState(project_id: string): RoutingState {
  let s = projectStates.get(project_id);
  if (!s) {
    s = { history: [], operator_overrides: new Map(), routing_suppressed: false };
    projectStates.set(project_id, s);
  }
  return s;
}

function overrideKey(role: ValidatorRole, intent: MutationIntent): string {
  return `${role}::${intent}`;
}

export interface BuildRoutingDecisionInput {
  readonly project_id: string;
  readonly target_intent: MutationIntent;
}

export function buildRoutingDecision(input: BuildRoutingDecisionInput): SpecializationRoutingDecision {
  const state = getProjectState(input.project_id);

  // Phase 17 adaptive weights bias the baseline weights this decision
  // builds on top of.
  const adaptive = buildAdaptiveWeights({ project_id: input.project_id, target_intent: input.target_intent });
  const drift = buildDriftProfile(input.project_id);
  const driftByRole = new Map(drift.signals.map(s => [s.validator_role, s] as const));
  const specializationMap = buildSpecializationMap(input.project_id);

  const attributions: RoutingAttribution[] = [];
  const weight_overrides: Partial<Record<ValidatorRole, number>> = {};

  for (const role of VALIDATOR_ROLES) {
    const adaptiveWeight = adaptive.weights_by_role[role] ?? 1.0;
    const acc = specializationAccuracy(input.project_id, role, input.target_intent);
    const driftSignal = driftByRole.get(role)!;
    const isStrong = specializationMap.entries.some(e => e.validator_role === role && e.domain === input.target_intent && e.is_strong);
    const isWeak = specializationMap.entries.some(e => e.validator_role === role && e.domain === input.target_intent && e.is_weak);

    let bias = NEUTRAL_BIAS;
    let reason = `neutral: domain accuracy ${acc.accuracy}% (${acc.observations} obs)`;

    // Operator override takes priority.
    const override = state.operator_overrides.get(overrideKey(role, input.target_intent));
    if (override) {
      bias = clampBias(override.fixed_bias);
      reason = `operator override → fixed bias ${bias.toFixed(2)} (set by ${override.set_by})`;
    } else if (state.routing_suppressed) {
      bias = NEUTRAL_BIAS;
      reason = 'routing suppressed by operator → neutral bias';
    } else if (isStrong) {
      bias = STRONG_BIAS;
      reason = `strong specialization in ${input.target_intent} (${acc.accuracy}% / ${acc.observations} obs)`;
    } else if (isWeak) {
      bias = WEAK_BIAS;
      reason = `weak specialization in ${input.target_intent} (${acc.accuracy}% / ${acc.observations} obs)`;
    }

    // Drift further dampens the bias for unstable validators.
    if (driftSignal.tier === 'unstable') {
      bias = bias * 0.8;
      reason += `; drift unstable → dampened`;
    } else if (driftSignal.tier === 'drifting') {
      bias = bias * 0.9;
      reason += `; drift drifting → light dampen`;
    }

    bias = clampBias(bias);
    const final_weight = clampBias(adaptiveWeight * bias);
    weight_overrides[role] = final_weight;

    attributions.push({
      validator_role: role,
      target_intent: input.target_intent,
      applied_bias: bias,
      reason,
      inputs: {
        domain_accuracy: acc.accuracy,
        domain_observations: acc.observations,
        validator_drift_tier: driftSignal.tier,
        is_strong_in_domain: isStrong,
        is_weak_in_domain: isWeak,
      },
      operator_override: override,
    });
  }

  // Track in history for stability tier calculation.
  const biasByRole = {} as Record<ValidatorRole, number>;
  for (const a of attributions) biasByRole[a.validator_role] = a.applied_bias;
  state.history.push({ target_intent: input.target_intent, bias_by_role: biasByRole, recorded_at: Date.now() });
  if (state.history.length > VOLATILE_HISTORY_SIZE) state.history.shift();

  const stability_tier = computeStabilityTier(state, attributions);

  return {
    project_id: input.project_id,
    target_intent: input.target_intent,
    attributions,
    weight_overrides,
    stability_tier,
    built_at: new Date().toISOString(),
  };
}

function computeStabilityTier(state: RoutingState, currentAttributions: RoutingAttribution[]): RoutingStabilityTier {
  if (state.routing_suppressed) return 'suppressed';
  if (currentAttributions.some(a => a.operator_override)) return 'overridden';
  if (state.history.length < 3) return 'stable';
  // Compute variance across recent history per role; if any role's bias
  // varies by more than VOLATILE_VARIANCE_THRESHOLD, classify as volatile.
  let maxVariance = 0;
  for (const role of Object.keys(state.history[0].bias_by_role) as ValidatorRole[]) {
    const values = state.history.map(h => h.bias_by_role[role] ?? 1);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
    if (variance > maxVariance) maxVariance = variance;
  }
  if (maxVariance >= VOLATILE_VARIANCE_THRESHOLD) return 'volatile';
  if (maxVariance >= 0.05) return 'adaptive';
  return 'stable';
}

function clampBias(b: number): number {
  if (Number.isNaN(b)) return NEUTRAL_BIAS;
  return Math.max(ROUTING_BIAS_MIN, Math.min(ROUTING_BIAS_MAX, Math.round(b * 100) / 100));
}

// ─── Operator override surface ────────────────────────────────────────

export interface SetRoutingOverrideInput {
  readonly project_id: string;
  readonly validator_role: ValidatorRole;
  readonly target_intent: MutationIntent;
  readonly fixed_bias: number;
  readonly set_by: string;
}

export function setRoutingOverride(input: SetRoutingOverrideInput): { applied_bias: number } {
  const state = getProjectState(input.project_id);
  const bias = clampBias(input.fixed_bias);
  state.operator_overrides.set(overrideKey(input.validator_role, input.target_intent), {
    fixed_bias: bias, set_by: input.set_by, set_at: new Date().toISOString(),
  });
  return { applied_bias: bias };
}

export function clearRoutingOverride(project_id: string, validator_role: ValidatorRole, target_intent: MutationIntent): void {
  getProjectState(project_id).operator_overrides.delete(overrideKey(validator_role, target_intent));
}

export function suppressRouting(project_id: string): void {
  getProjectState(project_id).routing_suppressed = true;
}

export function unsuppressRouting(project_id: string): void {
  getProjectState(project_id).routing_suppressed = false;
}

export function isRoutingSuppressed(project_id: string): boolean {
  return getProjectState(project_id).routing_suppressed;
}

export function _resetRoutingEngine(): void {
  projectStates.clear();
}

export const _STRONG_BIAS_FOR_TESTS = STRONG_BIAS;
export const _WEAK_BIAS_FOR_TESTS = WEAK_BIAS;
export const _VOLATILE_VARIANCE_THRESHOLD_FOR_TESTS = VOLATILE_VARIANCE_THRESHOLD;
