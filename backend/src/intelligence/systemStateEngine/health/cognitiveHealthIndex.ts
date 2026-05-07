/**
 * cognitiveHealthIndex — unified score combining every health dimension
 * the prior phases produce.
 *
 * Reads:
 *   - sync_health (engine baseline)
 *   - UX debt total (Phase 5)
 *   - workflow friction (Phase 5)
 *   - worst-route cognition (Phase 6)
 *   - behavioral friction pressure (Phase 6)
 *   - live pressure (Phase 8)
 *   - open contradiction count (any phase)
 *   - prediction confidence (Phase 9)
 *
 * Output: unified `CognitiveHealthIndex` 0-100 + per-dimension breakdown.
 *
 * Pure helper for the index computation; DB-backed wrapper composes the
 * inputs from existing surfaces.
 *
 * Phase 9 §11.
 */

export interface CognitiveHealthInputs {
  readonly sync_health: number;             // 0-100
  readonly ux_health: number;                // 0-100 (100 - ux_debt_total)
  readonly workflow_health: number;          // 0-100 (100 - friction)
  readonly cognition_health: number;         // 0-100 (worst route)
  readonly behavioral_health: number;        // 0-100 (100 - friction_pressure)
  readonly pressure_health: number;          // 0-100 (100 - pressure_value)
  readonly contradiction_health: number;     // 0-100 (100 - clamped contradiction count)
  readonly prediction_confidence: number;    // 0-100
  readonly operational_stability: number;    // 0-100 (rerank churn / stability proxy)
  readonly remediation_health: number;       // 0-100 (Phase 10.5 — UX remediation effectiveness composite)
}

export interface CognitiveHealthIndex {
  readonly score: number;                                   // 0-100 unified
  readonly tier: 'healthy' | 'cautious' | 'degraded' | 'critical';
  readonly orchestration_health: number;
  readonly cognition_health: number;
  readonly UX_health: number;
  readonly behavioral_health: number;
  readonly pressure_health: number;
  readonly contradiction_health: number;
  readonly prediction_confidence: number;
  readonly operational_stability: number;
  readonly remediation_health: number;
  readonly weakest_dimension: string;
  readonly explanation: string;
}

// Phase 10.5 rebalance: dropped prediction_confidence 0.5 → 0.4 to make
// room for remediation_health 1.2 — UX remediation effectiveness is a
// load-bearing dimension once the cycle is closed end-to-end.
//
// Phase 13 rebalance: bumped operational_stability 0.8 → 1.0 because
// autonomy_health now folds into operational_stability (50/50 blend
// with the existing rerank-frequency proxy). Total weight delta:
// +0.2 (was 11.3, now 11.5). Existing 448 systemStateEngine tests
// keep their tier thresholds — 0-100 input range is unchanged.
const WEIGHTS: Record<keyof CognitiveHealthInputs, number> = {
  sync_health: 1.5,
  ux_health: 1.2,
  workflow_health: 1.0,
  cognition_health: 1.5,
  behavioral_health: 1.2,
  pressure_health: 1.5,
  contradiction_health: 1.0,
  prediction_confidence: 0.4,
  operational_stability: 1.0,
  remediation_health: 1.2,
};

export function computeCognitiveHealthIndex(inputs: CognitiveHealthInputs): CognitiveHealthIndex {
  let weightedSum = 0;
  let weightTotal = 0;
  let weakestKey: keyof CognitiveHealthInputs = 'sync_health';
  let weakestVal = 100;
  for (const k of Object.keys(WEIGHTS) as Array<keyof CognitiveHealthInputs>) {
    const v = inputs[k] ?? 0;
    const w = WEIGHTS[k];
    weightedSum += v * w;
    weightTotal += w;
    if (v < weakestVal) {
      weakestVal = v;
      weakestKey = k;
    }
  }
  const score = Math.max(0, Math.min(100, Math.round(weightedSum / weightTotal)));
  const tier: CognitiveHealthIndex['tier'] =
    score >= 85 ? 'healthy' :
    score >= 70 ? 'cautious' :
    score >= 50 ? 'degraded' :
    'critical';

  const explanation = `Aggregate ${score}/100 (${tier}). Weakest: ${weakestKey} at ${weakestVal}.`;

  // The "orchestration_health" rollup combines sync + contradictions + stability
  const orchestration_health = Math.round((inputs.sync_health + inputs.contradiction_health + inputs.operational_stability) / 3);

  return {
    score,
    tier,
    orchestration_health,
    cognition_health: inputs.cognition_health,
    UX_health: Math.round((inputs.ux_health + inputs.workflow_health) / 2),
    behavioral_health: inputs.behavioral_health,
    pressure_health: inputs.pressure_health,
    contradiction_health: inputs.contradiction_health,
    prediction_confidence: inputs.prediction_confidence,
    operational_stability: inputs.operational_stability,
    remediation_health: inputs.remediation_health,
    weakest_dimension: weakestKey,
    explanation,
  };
}

/**
 * DB-backed: compose inputs from the existing surfaces and run the index.
 */
export async function computeCognitiveHealthIndexForProject(projectId: string): Promise<CognitiveHealthIndex> {
  // Pull sync + cognition + behavioral telemetry through existing helpers
  const { readOrRebuild } = await import('../snapshotReader');
  const { loadVisionTelemetry } = await import('../vision/visionTelemetrySynchronizer');
  const { loadVisualTelemetry } = await import('../visual/visualTelemetrySynchronizer');
  const { getPressureState } = await import('../realtime/livePressureEngine');

  const [state, vision, visual] = await Promise.all([
    readOrRebuild(projectId).catch(() => null),
    loadVisionTelemetry(projectId).catch(() => null),
    loadVisualTelemetry(projectId).catch(() => null),
  ]);

  const sync_health = state?.sync_health.score ?? 50;
  const ux_health = visual?.ux_debt.ux_health ?? 100;
  const friction = visual?.workflow_friction.friction_score ?? 0;
  const workflow_health = Math.max(0, 100 - friction);
  const cognition_health = vision?.worst_cognition_score ?? 100;
  const behavioral = vision?.behavioral.project_friction_pressure ?? 0;
  const behavioral_health = Math.max(0, 100 - behavioral);
  const pressureState = getPressureState(projectId);
  const pressure_health = Math.max(0, 100 - pressureState.pressure);
  const contradictionCount = state?.contradictions.length ?? 0;
  const contradiction_health = Math.max(0, 100 - Math.min(100, contradictionCount * 5));

  // Phase 10.5: pull remediation health composite. Uses lazy import +
  // safe fallback so this module stays resilient if the remediation
  // surface hasn't been wired up yet (cold project, fresh deploy).
  let remediation_health = 100;
  try {
    const { computeRemediationHealthIndex } = await import('./remediationHealthIndex');
    const r = await computeRemediationHealthIndex(projectId);
    remediation_health = r.score;
  } catch { /* keep baseline */ }

  // Phase 13: fold autonomy_health into operational_stability via 50/50
  // blend with the existing rerank-frequency proxy. Phase 14 enriches
  // autonomy_health to also incorporate verification_success_rate:
  //   autonomy_health = trust_score × execution_success_rate ×
  //                     verification_success_rate × (1 - rollback_freq).
  // Fail-soft if the autonomy state hasn't accumulated.
  let autonomy_health = 80;
  try {
    const { readTrustProfile, executionSuccessRate, rollbackFrequency, verificationSuccessRate } = await import('../autonomy/autonomyTrustState');
    const trust = readTrustProfile(projectId);
    const trustAvg =
      Object.values(trust.profiles_by_class).reduce((s, e) => s + e.trust_score, 0) / 4;
    const successRate = executionSuccessRate(projectId);
    const rbFreq = rollbackFrequency(projectId);
    const verifyRate = verificationSuccessRate(projectId);
    autonomy_health = Math.max(0, Math.min(100, Math.round(
      trustAvg * (successRate / 100) * (verifyRate / 100) * (1 - rbFreq / 100),
    )));
  } catch { /* baseline */ }

  // Phase 15: fold mutation_health (avg trust across non-frozen mutation
  // intent classes, dampened by recent rollback ratio) into the same
  // operational_stability blend. The three legs are now:
  //   - 80 (baseline rerank-frequency proxy)
  //   - autonomy_health (Phase 13 + 14)
  //   - mutation_health (Phase 15)
  // Equal-weighted; same denominator (operational_stability weight 1.0
  // unchanged from Phase 13). Existing health-index tests stay green.
  let mutation_health = 80;
  try {
    const { avgMutationTrust, readMutationTrustProfile } = await import('../mutation/mutationTrustCalibrator');
    const { readMutationCounters } = await import('../mutation/mutationSummaryCounters');
    const avgTrust = avgMutationTrust(projectId);
    const counters = readMutationCounters(projectId);
    const totalActivity = counters.recent_verifications + counters.recent_rollbacks;
    const rollbackRatio = totalActivity === 0 ? 0 : counters.recent_rollbacks / totalActivity;
    const profile = readMutationTrustProfile(projectId);
    const _frozenPenalty = Object.values(profile.profiles_by_intent).filter(p => p.trust_score === 0).length * 5;
    void _frozenPenalty;     // surfaced via avgTrust already; kept for clarity
    mutation_health = Math.max(0, Math.min(100, Math.round(avgTrust * (1 - rollbackRatio))));
  } catch { /* baseline */ }

  const operational_stability_blended = Math.round((80 + autonomy_health + mutation_health) / 3);

  return computeCognitiveHealthIndex({
    sync_health,
    ux_health,
    workflow_health,
    cognition_health,
    behavioral_health,
    pressure_health,
    contradiction_health,
    prediction_confidence: 60,           // baseline; updated when predictor runs
    operational_stability: operational_stability_blended,
    remediation_health,
  });
}
