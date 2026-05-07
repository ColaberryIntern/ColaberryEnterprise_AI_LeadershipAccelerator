/**
 * operationalConfidenceCalibrator — quantifies how much the system should
 * trust its own current orchestration decisions.
 *
 * Inputs:
 *   - sample size (more outcomes → higher confidence)
 *   - prediction accuracy (compare past predictions to actual outcomes)
 *   - contradiction churn (high churn → low confidence)
 *   - policy stability (frequent re-tunes → low confidence)
 *   - historical_support (federated pattern matches)
 *
 * Output: structured `OrchestrationConfidence` with explicit reasons.
 *
 * Phase 10 §5.
 */

export interface ConfidenceInputs {
  readonly sample_count: number;
  readonly prediction_accuracy: number;            // 0-1, share of correct past predictions
  readonly contradiction_churn_per_hour: number;
  readonly policy_changes_last_24h: number;
  readonly historical_pattern_matches: number;
  readonly recent_remediation_success_rate: number; // 0-1
}

export interface OrchestrationConfidence {
  readonly confidence: number;             // 0-100
  readonly evidence_strength: number;       // 0-100
  readonly historical_support: number;      // 0-100
  readonly prediction_reliability: number;  // 0-100
  readonly contradiction_risk: number;      // 0-100 — higher = more risk
  readonly uncertainty_reasons: ReadonlyArray<string>;
  readonly tier: 'low' | 'moderate' | 'high';
}

export function calibrateOperationalConfidence(input: ConfidenceInputs): OrchestrationConfidence {
  const reasons: string[] = [];

  // Evidence strength: sample size with diminishing returns past 50.
  const evidence_strength = Math.min(100, Math.round(20 + Math.min(80, Math.log10(Math.max(1, input.sample_count)) * 50)));
  if (input.sample_count < 10) reasons.push(`Only ${input.sample_count} outcomes recorded — under-sampled.`);

  // Historical support: capped at 100, log-scaled.
  const historical_support = Math.min(100, Math.round(Math.log10(Math.max(1, input.historical_pattern_matches + 1)) * 60));
  if (input.historical_pattern_matches < 3) reasons.push('Few historical matches — federation memory thin.');

  // Prediction reliability
  const prediction_reliability = Math.round(Math.max(0, Math.min(100, input.prediction_accuracy * 100)));
  if (prediction_reliability < 60) reasons.push(`Past prediction accuracy ${prediction_reliability}/100 — model lacks calibration.`);

  // Contradiction risk: more churn = higher risk = lower trust.
  const contradiction_risk = Math.min(100, Math.round(input.contradiction_churn_per_hour * 10));
  if (contradiction_risk > 50) reasons.push(`Contradictions churning at ${input.contradiction_churn_per_hour}/h — operational state unstable.`);

  // Policy stability: frequent re-tunes drag confidence
  let policy_stability = 100;
  if (input.policy_changes_last_24h > 0) policy_stability -= Math.min(60, input.policy_changes_last_24h * 12);
  if (input.policy_changes_last_24h >= 3) reasons.push(`${input.policy_changes_last_24h} policy adjustments in 24h — adaptation may overshoot.`);

  // Composite confidence
  const recent = Math.round(input.recent_remediation_success_rate * 100);
  const composite = Math.round(
    evidence_strength * 0.20 +
    historical_support * 0.20 +
    prediction_reliability * 0.20 +
    (100 - contradiction_risk) * 0.20 +
    policy_stability * 0.10 +
    recent * 0.10,
  );
  const confidence = Math.max(0, Math.min(100, composite));

  let tier: OrchestrationConfidence['tier'] = 'low';
  if (confidence >= 70) tier = 'high';
  else if (confidence >= 45) tier = 'moderate';
  if (tier === 'low' && reasons.length === 0) {
    reasons.push('Composite confidence below 45 — proceed with caution.');
  }

  return {
    confidence,
    evidence_strength,
    historical_support,
    prediction_reliability,
    contradiction_risk,
    uncertainty_reasons: reasons,
    tier,
  };
}
