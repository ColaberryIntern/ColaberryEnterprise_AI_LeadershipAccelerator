/**
 * remediationHealthIndex — composite of UX remediation effectiveness +
 * stability + regression risk + UX velocity + unresolved-debt pressure +
 * confidence. Feeds cognitiveHealthIndex as the 10th input.
 *
 * Composed from existing surfaces (no parallel data store):
 *   - aggregateUXOutcomes()                 → effectiveness + stability + ux_velocity
 *   - detectRegressionPronePatterns()       → regression risk
 *   - getRemediationPressure()              → unresolved_debt_pressure
 *   - buildRemediationIntelligenceReport()  → overall_confidence (per-cluster avg)
 *
 * Phase 10.5 §E.
 */

export interface RemediationHealthInputs {
  readonly effectiveness: number;            // 0-100 (avg outcome score)
  readonly stability: number;                // 0-100 (1 - regression rate)
  readonly regression_risk: number;          // 0-100 (HIGH = bad — inverted in score)
  readonly ux_velocity: number;              // 0-100 (outcomes/week throughput, normalized)
  readonly unresolved_debt_pressure: number; // 0-100 (HIGH = bad — inverted in score)
  readonly confidence: number;               // 0-100 (overall_confidence from intelligence report)
}

export interface RemediationHealthIndex {
  readonly score: number;                    // 0-100 unified
  readonly tier: 'healthy' | 'cautious' | 'degraded' | 'critical';
  readonly weakest_dimension: keyof RemediationHealthInputs;
  readonly inputs: RemediationHealthInputs;
  readonly explanation: string;
}

const WEIGHTS: Record<keyof RemediationHealthInputs, number> = {
  effectiveness: 1.5,
  stability: 1.3,
  regression_risk: 1.2,           // weight of the INVERTED contribution
  ux_velocity: 0.6,
  unresolved_debt_pressure: 1.0,  // weight of the INVERTED contribution
  confidence: 1.0,
};

export function computeRemediationHealthIndexPure(inputs: RemediationHealthInputs): RemediationHealthIndex {
  const positive: Record<string, number> = {
    effectiveness: inputs.effectiveness,
    stability: inputs.stability,
    regression_risk: 100 - inputs.regression_risk,
    ux_velocity: inputs.ux_velocity,
    unresolved_debt_pressure: 100 - inputs.unresolved_debt_pressure,
    confidence: inputs.confidence,
  };
  let weightedSum = 0;
  let weightTotal = 0;
  let weakest: keyof RemediationHealthInputs = 'effectiveness';
  let weakestVal = 100;
  for (const k of Object.keys(WEIGHTS) as Array<keyof RemediationHealthInputs>) {
    const v = positive[k] ?? 0;
    const w = WEIGHTS[k];
    weightedSum += v * w;
    weightTotal += w;
    if (v < weakestVal) { weakestVal = v; weakest = k; }
  }
  const score = Math.max(0, Math.min(100, Math.round(weightedSum / weightTotal)));
  const tier: RemediationHealthIndex['tier'] =
    score >= 85 ? 'healthy' :
    score >= 70 ? 'cautious' :
    score >= 50 ? 'degraded' :
    'critical';
  const explanation = `Remediation health ${score}/100 (${tier}). Weakest dimension: ${weakest} (effective ${weakestVal}/100).`;
  return { score, tier, weakest_dimension: weakest, inputs, explanation };
}

/**
 * DB-backed: compose inputs from existing surfaces and run the index.
 */
export async function computeRemediationHealthIndex(projectId: string): Promise<RemediationHealthIndex> {
  const { aggregateUXOutcomes } = await import('../remediation/remediationEffectivenessAnalyzer');
  const { detectRegressionPronePatterns } = await import('../remediation/regressionProneFixDetector');
  const { getRemediationPressure } = await import('../remediation/remediationPressureEngine');

  const [agg, regression] = await Promise.all([
    aggregateUXOutcomes({ project_id: projectId, since_days: 30 }),
    detectRegressionPronePatterns({ project_id: projectId, lookback_days: 30 }),
  ]);
  const pressure = getRemediationPressure(projectId);

  const effectiveness = agg.total_outcomes > 0 ? agg.avg_score : 70;
  // Stability = 1 - (regression_count / outcome_count), clamped.
  const stability = agg.total_outcomes === 0
    ? 80
    : Math.max(0, Math.min(100, Math.round(100 * (1 - regression.patterns.length / Math.max(1, agg.total_outcomes)))));
  // Regression risk = capped recurrence count from detector.
  const regression_risk = Math.min(100, regression.patterns.length * 15);
  // ux_velocity: outcomes/week, normalized so 5 outcomes/week = 70.
  const outcomesPerWeek = agg.total_outcomes / 4.3;
  const ux_velocity = Math.min(100, Math.round(outcomesPerWeek * 14));
  const unresolved_debt_pressure = pressure.pressure;
  // Confidence: heuristic — without a fresh per-BP report, use the
  // historical avg score as a proxy.
  const confidence = agg.total_outcomes > 0 ? agg.avg_score : 60;

  return computeRemediationHealthIndexPure({
    effectiveness,
    stability,
    regression_risk,
    ux_velocity,
    unresolved_debt_pressure,
    confidence,
  });
}
