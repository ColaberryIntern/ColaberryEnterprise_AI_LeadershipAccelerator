/**
 * validatorDriftDetector — Phase 17. Classifies each validator into a
 * `ValidatorStabilityTier` based on the reliability tracker output.
 *
 * Tiers (per the addendum):
 *   - stable:      accuracy ≥ 80, no over/under signals
 *   - cautionary:  accuracy 60-79, mild signals
 *   - drifting:    accuracy 40-59, OR strong over/under-trigger pattern
 *   - unstable:    accuracy < 40, OR ≥2 strong drift signals
 *   - suppressed:  operator-frozen via the suppression registry
 *
 * The tier is the input to:
 *   - adaptiveValidatorEngine (drives weight adjustment)
 *   - the dashboard (validator health badges)
 *   - the audit log (`validator_drift_detected` events)
 */

import type { ValidatorRole } from '../causality/causalityTypes';
import type { ValidatorReliabilityMetrics } from './adaptiveGovernanceTypes';
import { VALIDATOR_ROLES } from '../causality/distributedValidationHarness';
import type { ValidatorDriftSignal, ValidatorDriftProfile, ValidatorStabilityTier } from './adaptiveGovernanceTypes';
import { MIN_OBSERVATIONS_FOR_DRIFT } from './adaptiveGovernanceTypes';
import { readReliabilityProfile } from './validatorReliabilityTracker';

const suppressedValidators = new Map<string, Set<ValidatorRole>>();

function suppressionSet(project_id: string): Set<ValidatorRole> {
  let s = suppressedValidators.get(project_id);
  if (!s) {
    s = new Set();
    suppressedValidators.set(project_id, s);
  }
  return s;
}

export function suppressValidator(project_id: string, role: ValidatorRole): void {
  suppressionSet(project_id).add(role);
}

export function unsuppressValidator(project_id: string, role: ValidatorRole): void {
  suppressionSet(project_id).delete(role);
}

export function isValidatorSuppressed(project_id: string, role: ValidatorRole): boolean {
  return suppressionSet(project_id).has(role);
}

/**
 * Build the drift profile by classifying each validator's reliability
 * metrics into a `ValidatorStabilityTier`.
 */
export function buildDriftProfile(project_id: string): ValidatorDriftProfile {
  const reliability = readReliabilityProfile(project_id);
  const signals: ValidatorDriftSignal[] = [];
  let worst: ValidatorStabilityTier = 'stable';
  for (const role of VALIDATOR_ROLES) {
    const m = reliability.metrics_by_role[role];
    const signal = classify(role, m, isValidatorSuppressed(project_id, role));
    signals.push(signal);
    if (compareTier(signal.tier, worst) > 0) worst = signal.tier;
  }
  return {
    project_id,
    signals,
    worst_tier: worst,
    built_at: new Date().toISOString(),
  };
}

function classify(role: ValidatorRole, m: ValidatorReliabilityMetrics, suppressed: boolean): ValidatorDriftSignal {
  if (suppressed) {
    return {
      validator_role: role, tier: 'suppressed',
      signals: ['operator-suppressed'],
      confidence_inflation_pct: 0, over_trigger_pct: 0, under_detect_pct: 0, disagreement_drift_pct: 0,
      recommended_action: 'noop',
    };
  }

  const drivers: string[] = [];
  // Confidence inflation = high confidence + low accuracy.
  const confidence_inflation = m.observations === 0 ? 0 :
    Math.max(0, 80 - m.accuracy);                               // simple heuristic; tuned for v1
  const over = m.false_positive_rate;
  const under = m.false_negative_rate;
  const divergence = Math.max(0, 100 - m.arbitration_agreement_quality);

  if (m.observations < MIN_OBSERVATIONS_FOR_DRIFT) {
    return {
      validator_role: role, tier: 'stable',
      signals: ['insufficient_observations'],
      confidence_inflation_pct: 0, over_trigger_pct: 0, under_detect_pct: 0, disagreement_drift_pct: 0,
      recommended_action: 'noop',
    };
  }

  if (over >= 50) drivers.push(`over-triggering ${over}%`);
  if (under >= 50) drivers.push(`under-detecting ${under}%`);
  if (confidence_inflation >= 30) drivers.push(`confidence inflation ${confidence_inflation}%`);
  if (divergence >= 50) drivers.push(`disagreement drift ${divergence}%`);

  // Tier classification
  let tier: ValidatorStabilityTier;
  let recommended: ValidatorDriftSignal['recommended_action'] = 'monitor';
  if (m.accuracy < 40 || drivers.length >= 2) {
    tier = 'unstable';
    recommended = 'recalibrate';
  } else if (m.accuracy < 60 || over >= 50 || under >= 50) {
    tier = 'drifting';
    recommended = 'recalibrate';
  } else if (m.accuracy < 80 || drivers.length >= 1) {
    tier = 'cautionary';
    recommended = 'monitor';
  } else {
    tier = 'stable';
    recommended = 'noop';
  }

  return {
    validator_role: role,
    tier,
    signals: drivers.length > 0 ? drivers : [`accuracy ${m.accuracy}%`],
    confidence_inflation_pct: Math.round(confidence_inflation),
    over_trigger_pct: over,
    under_detect_pct: under,
    disagreement_drift_pct: divergence,
    recommended_action: recommended,
  };
}

function tierRank(t: ValidatorStabilityTier): number {
  switch (t) {
    case 'stable': return 0;
    case 'cautionary': return 1;
    case 'drifting': return 2;
    case 'unstable': return 3;
    case 'suppressed': return 4;
  }
}

function compareTier(a: ValidatorStabilityTier, b: ValidatorStabilityTier): number {
  return tierRank(a) - tierRank(b);
}

export function _resetDriftDetector(): void {
  suppressedValidators.clear();
}
