/**
 * validatorMetaReasoning — Phase 17. Analytical view OVER Phase 16's
 * `validator_disagreement` audit history + per-pair disagreement
 * profiles. NOT a separate cognition layer; just deterministic
 * statistics + replay-safe summaries.
 *
 * Surfaces:
 *   - highest_disagreement_pair (which two validators clash most)
 *   - recurring_disagreement_topics (top topic across pairs)
 *   - arbitration_instability_score (composite)
 *   - consensus_fragility (how often consensus is dragged by 1-2 votes)
 *   - calibration_quality (inverse of confidence inflation aggregate)
 *
 * The architectural commitment: meta-reasoning is REPORTING. It does
 * NOT spawn validators, modify validators, or recurse into itself.
 */

import type {
  ValidatorTrustProfile, ValidatorRole,
} from '../causality/causalityTypes';
import type { ValidatorMetaReasoningSummary } from './adaptiveGovernanceTypes';
import { readValidatorTrustProfile } from '../causality/validatorTrustCalibrator';
import { readReliabilityProfile } from './validatorReliabilityTracker';

export interface BuildMetaReasoningInput {
  readonly project_id: string;
  /** Optional override for testing — when supplied, the function reads
   *  these instead of calling readValidatorTrustProfile. */
  readonly trust_profile?: ValidatorTrustProfile;
}

export function buildValidatorMetaReasoningSummary(input: BuildMetaReasoningInput): ValidatorMetaReasoningSummary {
  const trust = input.trust_profile ?? readValidatorTrustProfile(input.project_id);
  const reliability = readReliabilityProfile(input.project_id);

  // Highest-disagreement pair
  let highest: { pair: readonly [ValidatorRole, ValidatorRole]; rate: number } | null = null;
  for (const p of trust.disagreement_profiles) {
    if (highest === null || p.disagreement_rate > highest.rate) {
      highest = { pair: p.validator_pair, rate: p.disagreement_rate };
    }
  }

  // Recurring topics across pairs (top 5 by total mention count).
  const topicCounts = new Map<string, number>();
  for (const p of trust.disagreement_profiles) {
    for (const t of p.disagreement_topics) topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
  }
  const recurring_disagreement_topics = Array.from(topicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);

  // Arbitration instability composite
  const escalationAvg = trust.disagreement_profiles.length === 0 ? 0 :
    Math.round(trust.disagreement_profiles.reduce((s, p) => s + p.escalation_rate, 0) / trust.disagreement_profiles.length);
  const disagreementAvg = trust.disagreement_profiles.length === 0 ? 0 :
    Math.round(trust.disagreement_profiles.reduce((s, p) => s + p.disagreement_rate, 0) / trust.disagreement_profiles.length);
  const arbitration_instability_score = Math.min(100, Math.round(escalationAvg * 0.6 + disagreementAvg * 0.4));

  // Consensus fragility: inversely proportional to validator agreement_quality
  const agreementQualityAvg = aggregateField(reliability, 'arbitration_agreement_quality');
  const consensus_fragility = Math.max(0, Math.min(100, Math.round(100 - agreementQualityAvg)));

  // Calibration quality: 100 minus aggregate FP+FN halved
  const fpAvg = aggregateField(reliability, 'false_positive_rate');
  const fnAvg = aggregateField(reliability, 'false_negative_rate');
  const calibration_quality = Math.max(0, Math.min(100, Math.round(100 - (fpAvg + fnAvg) / 2)));

  const notes: string[] = [];
  if (arbitration_instability_score >= 60) notes.push(`Arbitration instability is high (${arbitration_instability_score}/100).`);
  if (consensus_fragility >= 60) notes.push(`Consensus fragility is elevated — minor validator shifts can flip outcome.`);
  if (calibration_quality < 60) notes.push(`Calibration quality below 60 — recalibrate the most-mis-firing validators.`);
  if (highest && highest.rate >= 50) notes.push(`Recurring conflict between ${highest.pair[0]} ↔ ${highest.pair[1]} (${highest.rate}%).`);

  return {
    project_id: input.project_id,
    highest_disagreement_pair: highest,
    recurring_disagreement_topics,
    arbitration_instability_score,
    consensus_fragility,
    calibration_quality,
    notes,
    built_at: new Date().toISOString(),
  };
}

function aggregateField(reliability: ReturnType<typeof readReliabilityProfile>, field: keyof typeof reliability.metrics_by_role['mutation_validator']): number {
  const values = Object.values(reliability.metrics_by_role).map(m => (m as any)[field] ?? 0);
  if (values.length === 0) return 0;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

