/**
 * validationArbitrationEngine — Phase 16. Combine the 5 validator
 * verdicts into a single arbitration result with:
 *   - consensus_recommendation (weighted majority)
 *   - consensus_confidence (weighted avg)
 *   - confidence_range (min/max — exposes the full spread, NOT just the avg)
 *   - minority_warning (set when ≥1 validator's recommendation diverges materially)
 *   - arbitration_risk (0-100; higher = more risky to act on consensus alone)
 *   - escalation_required (true when arbitration_risk crosses the threshold)
 *
 * Per the addendum: arbitration must surface confidence ranges, not
 * just point values. A 40-95 spread with a 70 average tells a different
 * story than a 65-75 spread also averaging 70.
 */

import type {
  ValidatorVerdict, ValidatorRecommendation, ValidationArbitrationResult,
  ValidatorRole,
} from './causalityTypes';

const ESCALATION_RISK_THRESHOLD = 60;     // arbitration_risk above this triggers escalation
const RECOMMENDATION_PRIORITY: Record<ValidatorRecommendation, number> = {
  // Higher number = more conservative; we tie-break toward conservative.
  apply: 1, monitor: 2, contain: 3, rollback: 4, reject: 5,
};

/**
 * Per-role weight: containment + blast are slightly heavier because they
 * can hard-block, while trust + mutation are looser informational signals.
 */
const ROLE_WEIGHTS: Record<ValidatorRole, number> = {
  mutation_validator: 1.0,
  rollback_validator: 1.0,
  trust_validator: 1.0,
  containment_validator: 1.5,
  blast_radius_validator: 1.5,
};

export interface ArbitrateInput {
  readonly mutation_id: string;
  readonly verdicts: ReadonlyArray<ValidatorVerdict>;
  /**
   * Phase 17: optional adaptive weight overrides. When supplied, the
   * arbitration engine uses these per-validator weights for the normal
   * vote tally. Hard architectural vetoes (containment_validator
   * confidence ≤ 20 → forced reject) IGNORE these overrides — vetoes
   * are absolute, not voting. Missing roles fall back to static defaults.
   */
  readonly weight_overrides?: Partial<Record<ValidatorRole, number>>;
}

export function arbitrate(input: ArbitrateInput): ValidationArbitrationResult {
  const verdicts = input.verdicts;
  if (verdicts.length === 0) {
    return {
      mutation_id: input.mutation_id,
      verdicts: [],
      consensus_recommendation: 'monitor',
      consensus_confidence: 50,
      confidence_range: { min: 50, max: 50 },
      minority_warning: 'no validators ran',
      arbitration_risk: 100,
      escalation_required: true,
      built_at: new Date().toISOString(),
    };
  }

  // ─── Hard veto rule ───────────────────────────────────────────────
  // If the containment_validator returns 'reject' with confidence <= 20,
  // treat that as an architectural block (frozen / hard-contained intent)
  // and force consensus = 'reject' regardless of other votes. This makes
  // frozen state a true veto, not a vote.
  let vetoed = false;
  for (const v of verdicts) {
    if (v.validator_type === 'containment_validator' && v.recommendation === 'reject' && v.confidence <= 20) {
      vetoed = true;
      break;
    }
  }

  // Weighted vote tally per recommendation. Phase 17: when
  // weight_overrides are supplied, they replace the static ROLE_WEIGHTS
  // for the normal vote tally. Hard vetoes already short-circuited
  // above and don't consult these weights.
  const overrides = input.weight_overrides ?? {};
  const effectiveWeight = (role: ValidatorRole): number => {
    const override = overrides[role];
    return typeof override === 'number' ? override : (ROLE_WEIGHTS[role] ?? 1.0);
  };
  const tally = new Map<ValidatorRecommendation, number>();
  for (const v of verdicts) {
    const weight = effectiveWeight(v.validator_type);
    tally.set(v.recommendation, (tally.get(v.recommendation) ?? 0) + weight);
  }
  // Pick the recommendation with the highest weight; ties go to the more
  // conservative option.
  let consensus: ValidatorRecommendation = vetoed ? 'reject' : 'monitor';
  let bestWeight = -1;
  if (!vetoed) {
    for (const [rec, w] of tally.entries()) {
      if (w > bestWeight || (w === bestWeight && RECOMMENDATION_PRIORITY[rec] > RECOMMENDATION_PRIORITY[consensus])) {
        bestWeight = w;
        consensus = rec;
      }
    }
  }

  // Weighted confidence average uses the same effective weights so the
  // adaptive overrides influence the consensus_confidence + range too.
  let weightSum = 0;
  let weightedTotal = 0;
  let minConf = 100;
  let maxConf = 0;
  for (const v of verdicts) {
    const w = effectiveWeight(v.validator_type);
    weightSum += w;
    weightedTotal += v.confidence * w;
    if (v.confidence < minConf) minConf = v.confidence;
    if (v.confidence > maxConf) maxConf = v.confidence;
  }
  const consensusConfidence = Math.round(weightedTotal / weightSum);

  // Minority warning: any validator whose recommendation is materially
  // different from consensus. "Material" = at least one priority step
  // away (e.g., consensus=apply but a validator says reject).
  const consensusPriority = RECOMMENDATION_PRIORITY[consensus];
  const dissenters = verdicts.filter(v => Math.abs(RECOMMENDATION_PRIORITY[v.recommendation] - consensusPriority) >= 2);
  const minority_warning = dissenters.length > 0
    ? `Minority: ${dissenters.map(d => `${d.validator_type}→${d.recommendation}`).join(', ')}`
    : null;

  // Arbitration risk = confidence spread + dissent factor + worst-case
  // recommendation distance.
  const confidenceSpread = maxConf - minConf;
  const dissentPenalty = dissenters.length * 15;
  const worstDistance = verdicts.reduce(
    (m, v) => Math.max(m, Math.abs(RECOMMENDATION_PRIORITY[v.recommendation] - consensusPriority)),
    0,
  );
  const arbitration_risk = Math.min(100, Math.round(confidenceSpread * 0.6 + dissentPenalty + worstDistance * 8));
  const escalation_required = arbitration_risk >= ESCALATION_RISK_THRESHOLD;

  return {
    mutation_id: input.mutation_id,
    verdicts,
    consensus_recommendation: consensus,
    consensus_confidence: consensusConfidence,
    confidence_range: { min: minConf, max: maxConf },
    minority_warning,
    arbitration_risk,
    escalation_required,
    built_at: new Date().toISOString(),
  };
}

export const _ESCALATION_RISK_THRESHOLD_FOR_TESTS = ESCALATION_RISK_THRESHOLD;
export const _ROLE_WEIGHTS_FOR_TESTS = ROLE_WEIGHTS;
