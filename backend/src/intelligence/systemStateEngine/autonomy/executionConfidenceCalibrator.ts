/**
 * executionConfidenceCalibrator — Phase 13 confidence scorer for autonomy
 * decisions. Parallel to (NOT replacing) automationConfidenceGate, which
 * gates governance recommendations broadly. This one operates on a
 * specific PreparedRemediationPlan + execution context with finer
 * inputs:
 *   - governance trust score (per-action-class memory)
 *   - execution success rate (rolling)
 *   - rollback frequency (rolling)
 *   - recent drift signal
 *   - sandbox calibration score (predict-vs-actual error)
 *
 * Phase 13 §A.3 + §G.
 */

import { calibrationScoreFor } from './sandboxCalibrationBuffer';

export interface ExecutionConfidenceInputs {
  readonly governance_trust_score: number;          // 0-100
  readonly execution_success_rate: number;          // 0-100 (% of recent applied that didn't roll back)
  readonly rollback_frequency: number;              // 0-100 (% of recent applied that did roll back)
  readonly recent_drift: number;                    // 0-100, higher = more drift
  readonly task_type_for_calibration: string;
  readonly base_automation_confidence: number;       // 0-100 (Phase 12 automationConfidenceGate output)
}

export interface ExecutionConfidence {
  readonly confidence: number;                       // 0-100
  readonly tier: 'low' | 'moderate' | 'high';
  readonly reasons: ReadonlyArray<string>;
  readonly contributions: Readonly<Record<string, number>>;
  readonly drift: number;
  readonly sandbox_calibration_score: number;
}

export function evaluateExecutionConfidence(input: ExecutionConfidenceInputs): ExecutionConfidence {
  const reasons: string[] = [];
  const contributions: Record<string, number> = {};

  const calibration = calibrationScoreFor(input.task_type_for_calibration);
  contributions.sandbox_calibration = Math.round(calibration.score * 0.20);
  if (calibration.score < 70) {
    reasons.push(`Sandbox calibration is degraded (score ${calibration.score}, mean abs error ${calibration.mean_abs_pct_error}%).`);
  }

  contributions.governance_trust = Math.round(input.governance_trust_score * 0.30);
  if (input.governance_trust_score < 50) reasons.push(`Governance trust is low (${Math.round(input.governance_trust_score)}/100).`);

  contributions.execution_success = Math.round(input.execution_success_rate * 0.25);

  contributions.rollback_penalty = -Math.round(input.rollback_frequency * 0.30);
  if (input.rollback_frequency > 20) reasons.push(`Rollback frequency is elevated (${Math.round(input.rollback_frequency)}%).`);

  contributions.drift_penalty = -Math.round(input.recent_drift * 0.20);
  if (input.recent_drift > 50) reasons.push(`Drift signal is high (${Math.round(input.recent_drift)}/100).`);

  // Inherit a small floor from the base automation confidence so cold-start
  // projects can still get out of "always low" by virtue of having a healthy
  // governance pipeline.
  const baselineFloor = Math.round(input.base_automation_confidence * 0.10);

  const raw = baselineFloor + Object.values(contributions).reduce((s, v) => s + v, 0);
  const confidence = Math.max(0, Math.min(100, Math.round(raw)));
  const tier: ExecutionConfidence['tier'] =
    confidence >= 70 ? 'high' :
    confidence >= 45 ? 'moderate' :
    'low';

  if (reasons.length === 0) {
    if (tier === 'high') reasons.push('All inputs strong; autonomy is on a healthy trajectory.');
    else if (tier === 'moderate') reasons.push('Mixed signal — autonomy can proceed but operator should monitor.');
    else reasons.push('Low confidence — recommend supervised mode until trust recovers.');
  }

  return {
    confidence,
    tier,
    reasons,
    contributions: Object.freeze(contributions),
    drift: Math.round(input.recent_drift),
    sandbox_calibration_score: calibration.score,
  };
}
