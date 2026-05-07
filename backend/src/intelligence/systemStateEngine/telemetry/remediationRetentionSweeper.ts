/**
 * remediationRetentionSweeper — periodic cleanup for ux_remediation_outcomes,
 * resolved ui_element_feedback, and remediation_tier_transitions.
 *
 * Defaults (override per env):
 *   - ux_remediation_outcomes: 90d
 *   - ui_element_feedback (status='resolved'): 90d (older means the user
 *     fixed it long ago and the row is reference-only)
 *   - remediation_tier_transitions: 180d (durable governance signal —
 *     keep longer than outcomes)
 *
 * Idempotent. Pure decision helpers split from IO so policy is testable.
 *
 * Phase 11 §L.
 */

export interface RemediationRetentionPolicy {
  readonly outcomesMs: number;
  readonly resolvedFeedbackMs: number;
  readonly tierTransitionsMs: number;
}

export const DEFAULT_REMEDIATION_RETENTION_POLICY: RemediationRetentionPolicy = {
  outcomesMs: 90 * 24 * 60 * 60 * 1000,
  resolvedFeedbackMs: 90 * 24 * 60 * 60 * 1000,
  tierTransitionsMs: 180 * 24 * 60 * 60 * 1000,
};

export interface SweepStats {
  ux_remediation_outcomes_deleted: number;
  ui_element_feedback_deleted: number;
  remediation_tier_transitions_deleted: number;
  swept_at: string;
}

/**
 * Pure: given lists of (id, observed_at), return the IDs to delete based
 * on the policy and current timestamp. Used by tests.
 */
export function decideRemediationDeletions(
  rows: ReadonlyArray<{ id: string; observed_at: Date }>,
  now: number,
  ageThresholdMs: number,
): string[] {
  const cutoff = now - ageThresholdMs;
  return rows.filter(r => r.observed_at.getTime() < cutoff).map(r => r.id);
}

/** DB-backed sweep. */
export async function sweepRemediationRetention(
  policy: RemediationRetentionPolicy = DEFAULT_REMEDIATION_RETENTION_POLICY,
): Promise<SweepStats> {
  const swept_at = new Date().toISOString();
  const stats: SweepStats = {
    ux_remediation_outcomes_deleted: 0,
    ui_element_feedback_deleted: 0,
    remediation_tier_transitions_deleted: 0,
    swept_at,
  };

  try {
    const { Op } = await import('sequelize');
    const { default: UXRemediationOutcome } = await import('../../../models/UXRemediationOutcome');
    const { default: UIElementFeedback } = await import('../../../models/UIElementFeedback');
    const { default: RemediationTierTransition } = await import('../../../models/RemediationTierTransition');

    const now = Date.now();
    const outcomeCutoff = new Date(now - policy.outcomesMs);
    const feedbackCutoff = new Date(now - policy.resolvedFeedbackMs);
    const transitionCutoff = new Date(now - policy.tierTransitionsMs);

    stats.ux_remediation_outcomes_deleted = await UXRemediationOutcome.destroy({
      where: { observed_at: { [Op.lt]: outcomeCutoff } },
    });
    stats.ui_element_feedback_deleted = await UIElementFeedback.destroy({
      where: { status: 'resolved', resolved_at: { [Op.lt]: feedbackCutoff } },
    });
    stats.remediation_tier_transitions_deleted = await RemediationTierTransition.destroy({
      where: { recorded_at: { [Op.lt]: transitionCutoff } },
    });
  } catch (err: any) {
    console.warn('[remediationRetentionSweeper] sweep failed:', err?.message);
  }

  return stats;
}
