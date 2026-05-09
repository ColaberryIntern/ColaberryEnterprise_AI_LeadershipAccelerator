/**
 * delegatedPressureClassifier — Phase 28. Composite execution-economics
 * tier classification (5-tier: stable/constrained/elevated/saturated/exhausted).
 *
 * Architectural commitment:
 *   - Reads ONLY observable data: pressure profile + quota profile.
 *   - Deterministic mapping — same inputs → same tier.
 *   - Classifies; NEVER prioritizes. No queue shaping, no boosting.
 */

import type {
  ExecutionEconomicsTier, RuntimePressureProfile, ExecutionQuotaProfile,
} from './executionEconomicsTypes';

export interface ClassifyEconomicsTierInput {
  readonly pressure: RuntimePressureProfile;
  readonly quota: ExecutionQuotaProfile;
}

/**
 * Composite economics tier:
 *   - exhausted: any quota at 0 remaining
 *   - saturated: pressure tier == 'saturated' or 'critical'
 *   - elevated: pressure tier == 'elevated'
 *   - constrained: pressure tier == 'moderate' OR ≥1 quota under 25% remaining
 *   - stable: otherwise
 */
export function classifyEconomicsTier(
  input: ClassifyEconomicsTierInput,
): ExecutionEconomicsTier {
  if (input.quota.any_exhausted) return 'exhausted';
  if (input.pressure.tier === 'saturated' || input.pressure.tier === 'critical') return 'saturated';
  if (input.pressure.tier === 'elevated') return 'elevated';
  const anyTight = (Object.keys(input.quota.remaining) as Array<keyof typeof input.quota.remaining>)
    .some(k => {
      const limit = input.quota.limits[k];
      const remaining = input.quota.remaining[k];
      return limit > 0 && remaining / limit <= 0.25;
    });
  if (input.pressure.tier === 'moderate' || anyTight) return 'constrained';
  return 'stable';
}
