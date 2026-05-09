/**
 * adaptiveValidatorEngine — Phase 17 top-level coordinator.
 *
 * Reads:
 *   - validatorReliabilityTracker (per-validator accuracy / FP / FN)
 *   - validatorDriftDetector (per-validator stability tier)
 *   - validatorSpecializationAnalyzer (per-validator-per-domain strength)
 *
 * Writes:
 *   - AdaptiveWeightSet (dynamic ROLE_WEIGHTS for the next arbitration)
 *   - One AdaptiveWeightAttribution per validator role explaining the
 *     adjustment
 *
 * Architectural commitment (per the Phase 17 stress-test + addendum):
 *   - Adaptive weights are SOFT modulation. Hard architectural vetoes
 *     (containment confidence ≤ 20 → reject) remain absolute. The
 *     arbitration engine consults these weights for the normal vote
 *     tally; the veto path skips them entirely.
 *   - Every adjustment is replayable + auditable via the attribution.
 *   - Weights are clamped to [ROLE_WEIGHT_MIN, ROLE_WEIGHT_MAX] so a
 *     drifting validator can't be amplified to dominance and a strong
 *     validator can't be flattened to noise.
 */

import type {
  ValidatorRole, MutationIntent,
} from '../causality/causalityTypes';
import { VALIDATOR_ROLES } from '../causality/distributedValidationHarness';
import { _ROLE_WEIGHTS_FOR_TESTS as STATIC_ROLE_WEIGHTS } from '../causality/validationArbitrationEngine';
import {
  STATIC_ROLE_WEIGHT_DEFAULT, ROLE_WEIGHT_MIN, ROLE_WEIGHT_MAX,
} from './adaptiveGovernanceTypes';
import type {
  AdaptiveWeightAttribution, AdaptiveWeightSet, ValidatorStabilityTier,
} from './adaptiveGovernanceTypes';
import { readReliabilityProfile } from './validatorReliabilityTracker';
import { buildDriftProfile } from './validatorDriftDetector';
import { buildSpecializationMap, specializationAccuracy } from './validatorSpecializationAnalyzer';

export interface BuildAdaptiveWeightsInput {
  readonly project_id: string;
  /** Optional: bias the adjustment toward a specific intent class
   *  (e.g., the mutation about to be arbitrated). If supplied, the
   *  engine consults specializationAccuracy(role, domain). */
  readonly target_intent?: MutationIntent;
}

export function buildAdaptiveWeights(input: BuildAdaptiveWeightsInput): AdaptiveWeightSet {
  const reliability = readReliabilityProfile(input.project_id);
  const drift = buildDriftProfile(input.project_id);
  const specializationMap = buildSpecializationMap(input.project_id);
  const driftByRole = new Map(drift.signals.map(s => [s.validator_role, s] as const));

  const attributions: AdaptiveWeightAttribution[] = [];
  const weights_by_role = {} as Record<ValidatorRole, number>;

  for (const role of VALIDATOR_ROLES) {
    const prior = (STATIC_ROLE_WEIGHTS as any)[role] ?? STATIC_ROLE_WEIGHT_DEFAULT;
    const metrics = reliability.metrics_by_role[role];
    const driftSignal = driftByRole.get(role)!;

    const { adjusted, reason } = computeAdjustment(prior, driftSignal.tier, metrics.accuracy, metrics.observations,
      input.target_intent ? specializationAccuracy(input.project_id, role, input.target_intent) : undefined);

    weights_by_role[role] = adjusted;

    const strongDomains = specializationMap.entries
      .filter(e => e.validator_role === role && e.is_strong)
      .map(e => e.domain);
    const weakDomains = specializationMap.entries
      .filter(e => e.validator_role === role && e.is_weak)
      .map(e => e.domain);

    attributions.push({
      validator_role: role,
      prior_weight: prior,
      adjusted_weight: adjusted,
      adjustment_reason: reason,
      reliability_inputs: { accuracy: metrics.accuracy, observations: metrics.observations },
      drift_inputs: { tier: driftSignal.tier, confidence_inflation_pct: driftSignal.confidence_inflation_pct },
      specialization_inputs: { strong_domains: strongDomains, weak_domains: weakDomains },
    });
  }

  return {
    project_id: input.project_id,
    weights_by_role,
    attributions,
    built_at: new Date().toISOString(),
  };
}

function computeAdjustment(
  prior: number,
  tier: ValidatorStabilityTier,
  accuracy: number,
  observations: number,
  specialization?: { accuracy: number; observations: number },
): { adjusted: number; reason: string } {
  // Cold-start: keep static weight.
  if (observations === 0) {
    return { adjusted: prior, reason: `cold-start: no observations, prior weight ${prior} preserved` };
  }

  // Drift tier sets the headline multiplier.
  let multiplier = 1.0;
  let driver = 'stable';
  switch (tier) {
    case 'stable': multiplier = 1.05; driver = 'stable + boost'; break;
    case 'cautionary': multiplier = 1.0; driver = 'cautionary + neutral'; break;
    case 'drifting': multiplier = 0.7; driver = 'drifting → soft suppression'; break;
    case 'unstable': multiplier = 0.4; driver = 'unstable → strong suppression'; break;
    case 'suppressed': multiplier = 0.3; driver = 'suppressed → minimum'; break;
  }

  // Accuracy nudge (small): well-calibrated validators get +5%, mis-calibrated get -10%.
  let accuracyNudge = 1.0;
  if (accuracy >= 85) accuracyNudge = 1.05;
  else if (accuracy < 50) accuracyNudge = 0.85;

  // Specialization nudge for the target domain (when provided).
  let specializationNudge = 1.0;
  let specializationDriver = '';
  if (specialization && specialization.observations >= 3) {
    if (specialization.accuracy >= 85) {
      specializationNudge = 1.10;
      specializationDriver = `; specialization strong (${specialization.accuracy}% in domain)`;
    } else if (specialization.accuracy <= 50) {
      specializationNudge = 0.85;
      specializationDriver = `; specialization weak (${specialization.accuracy}% in domain)`;
    }
  }

  const raw = prior * multiplier * accuracyNudge * specializationNudge;
  const adjusted = Math.max(ROLE_WEIGHT_MIN, Math.min(ROLE_WEIGHT_MAX, Math.round(raw * 100) / 100));
  const reason = `${driver}; accuracy ${accuracy}%${specializationDriver}; ${prior.toFixed(2)} → ${adjusted.toFixed(2)}`;
  return { adjusted, reason };
}

/** Convenience: produce just the weight map for arbitrate()'s
 *  weight_overrides parameter. */
export function buildAdaptiveWeightOverrides(input: BuildAdaptiveWeightsInput): Partial<Record<ValidatorRole, number>> {
  const set = buildAdaptiveWeights(input);
  return set.weights_by_role;
}

export const _STATIC_ROLE_WEIGHTS_FOR_TESTS = STATIC_ROLE_WEIGHTS;
export const _ROLE_WEIGHT_MIN_FOR_TESTS = ROLE_WEIGHT_MIN;
export const _ROLE_WEIGHT_MAX_FOR_TESTS = ROLE_WEIGHT_MAX;
