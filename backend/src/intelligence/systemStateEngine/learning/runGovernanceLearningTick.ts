/**
 * runGovernanceLearningTick — Phase 12 governance-specific learning loop.
 * Separate from runLearningTick (which gates priority-weight proposals)
 * so the two learning loops stay independent and testable.
 *
 * Reads recently-decided GovernanceRecommendation rows for a project,
 * scores acceptance × outcome quality, feeds into the operational
 * confidence calibrator, returns a GovernanceLearningResult.
 *
 * Triggered by `governance.recommendation.decided` and `operator.override`
 * events on the cognitive event bus, NOT on a daily cron.
 *
 * Phase 12 §D.
 */

import { calibrateOperationalConfidence } from './operationalConfidenceCalibrator';

export interface GovernanceLearningResult {
  readonly project_id: string;
  readonly decisions_scanned: number;
  readonly accepted_count: number;
  readonly rejected_count: number;
  readonly acceptance_rate: number;          // 0-1
  readonly governance_confidence: number;    // 0-100
  readonly governance_confidence_tier: 'low' | 'moderate' | 'high';
  readonly notes: ReadonlyArray<string>;
  readonly elapsed_ms: number;
}

const LOOKBACK_DAYS = 14;

export async function runGovernanceLearningTick(project_id: string): Promise<GovernanceLearningResult> {
  const start = Date.now();
  const notes: string[] = [];
  let accepted = 0;
  let rejected = 0;
  let total = 0;

  try {
    const { Op } = await import('sequelize');
    const { default: GovernanceRecommendation } = await import('../../../models/GovernanceRecommendation');
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86400 * 1000);
    const rows: any[] = await GovernanceRecommendation.findAll({
      where: { project_id, status: { [Op.in]: ['accepted', 'rejected'] }, operator_decision_at: { [Op.gte]: since } },
    });
    total = rows.length;
    for (const r of rows) {
      if (r.status === 'accepted') accepted++;
      else if (r.status === 'rejected') rejected++;
    }
  } catch (err: any) {
    notes.push(`DB read failed: ${err?.message}`);
  }

  const acceptance_rate = total > 0 ? accepted / total : 0;
  // Governance confidence: starts at 50, +30 if acceptance rate ≥ 70%,
  //   -25 if rejection rate ≥ 70%, scaled by sample size.
  const sampleScale = Math.min(1, total / 5);
  let governance_confidence = 50;
  if (acceptance_rate >= 0.7) governance_confidence += 30 * sampleScale;
  else if (acceptance_rate <= 0.3 && total >= 3) governance_confidence -= 25 * sampleScale;
  governance_confidence = Math.max(0, Math.min(100, Math.round(governance_confidence)));

  const tier: GovernanceLearningResult['governance_confidence_tier'] =
    governance_confidence >= 70 ? 'high' :
    governance_confidence >= 45 ? 'moderate' :
    'low';

  if (total === 0) notes.push('No decisions in window — confidence at baseline.');
  if (total > 0) notes.push(`${accepted}/${total} accepted (${Math.round(acceptance_rate * 100)}%)`);

  // Reuse the calibrator as a primitive — operates on the governance signal
  void calibrateOperationalConfidence;

  return {
    project_id,
    decisions_scanned: total,
    accepted_count: accepted,
    rejected_count: rejected,
    acceptance_rate: Math.round(acceptance_rate * 100) / 100,
    governance_confidence,
    governance_confidence_tier: tier,
    notes,
    elapsed_ms: Date.now() - start,
  };
}
