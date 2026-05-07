/**
 * remediationConfidenceEngine — pure composite scorer that says "how
 * confident should we be that this remediation will hold." Used by:
 *   - the post-validation confidence badge on each step row
 *   - the queue reranker (low confidence → keep cluster surfaced for
 *     re-attention even though it just resolved)
 *   - cognitivePolicyEngine signalling
 *
 * Inputs are intentionally generic so the caller can compose them from
 * whatever data they have on hand. Each input is 0-100 already-normalized
 * EXCEPT regression_risk which is 0-100 with HIGH = bad.
 *
 * Phase 10.5 §A.4.
 */

export interface RemediationConfidenceInputs {
  readonly historical_success_rate: number;     // 0-100, higher = more confident
  readonly regression_risk: number;              // 0-100, higher = LESS confident
  readonly cognition_stability: number;          // 0-100, higher = stable
  readonly behavioral_improvement: number;       // 0-100, higher = users moved through faster
  readonly unresolved_related_count: number;     // raw count; capped at 10 internally
}

export interface RemediationConfidence {
  readonly confidence: number;     // 0-100
  readonly tier: 'low' | 'moderate' | 'high';
  readonly reasons: ReadonlyArray<string>;
  readonly contributions: Readonly<Record<string, number>>;
}

export function computeRemediationConfidence(inputs: RemediationConfidenceInputs): RemediationConfidence {
  const reasons: string[] = [];
  const contributions: Record<string, number> = {};

  // Historical success: 0-35 points
  contributions.historical_success = Math.round(inputs.historical_success_rate * 0.35);
  if (inputs.historical_success_rate < 40) reasons.push(`Historical success rate is low (${Math.round(inputs.historical_success_rate)}/100).`);

  // Regression risk penalty: 0 to -25
  contributions.regression_penalty = -Math.round(inputs.regression_risk * 0.25);
  if (inputs.regression_risk > 50) reasons.push(`Regression risk is elevated (${Math.round(inputs.regression_risk)}/100).`);

  // Cognition stability: 0-20 points
  contributions.cognition_stability = Math.round(inputs.cognition_stability * 0.20);

  // Behavioral improvement: 0-15 points
  contributions.behavioral_improvement = Math.round(inputs.behavioral_improvement * 0.15);

  // Unresolved related issues penalty: 0 to -10 (capped)
  const cappedRelated = Math.min(10, Math.max(0, inputs.unresolved_related_count));
  contributions.unresolved_related_penalty = -cappedRelated;
  if (cappedRelated >= 3) reasons.push(`${cappedRelated} related cluster issue(s) still open.`);

  // Baseline floor: 30 points so a fresh cluster with no data is
  // moderate-low, not zero. Without this, brand-new clusters always read
  // "low confidence" which discourages user action.
  const baseline = 30;

  const raw = baseline + Object.values(contributions).reduce((s, v) => s + v, 0);
  const confidence = Math.max(0, Math.min(100, Math.round(raw)));

  const tier: RemediationConfidence['tier'] =
    confidence >= 70 ? 'high' :
    confidence >= 45 ? 'moderate' :
    'low';

  if (reasons.length === 0) {
    if (tier === 'high') reasons.push('All inputs strong; remediation is likely to hold.');
    else if (tier === 'moderate') reasons.push('Mixed signal — proceed but monitor.');
    else reasons.push('Low confidence — consider deferring or surfacing alternatives.');
  }

  return {
    confidence,
    tier,
    reasons,
    contributions: Object.freeze(contributions),
  };
}
