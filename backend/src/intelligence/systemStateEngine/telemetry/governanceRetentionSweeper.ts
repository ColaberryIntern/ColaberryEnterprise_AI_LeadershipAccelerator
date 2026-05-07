/**
 * governanceRetentionSweeper — Phase 12 retention for governance models.
 *
 * Defaults:
 *   - GovernanceRecommendation: 90d (decisions age out faster)
 *   - PreparedRemediationPlan: 365d (durable signal — links applied
 *     plans to long-term outcome history)
 *   - GovernanceAuditEntry: 365d (high-value audit trail)
 *
 * Idempotent. Pure decision helpers split from IO so policy is testable.
 *
 * Phase 12 §L.
 */

export interface GovernanceRetentionPolicy {
  readonly recommendationsMs: number;
  readonly preparedPlansMs: number;
  readonly auditEntriesMs: number;
}

export const DEFAULT_GOVERNANCE_RETENTION_POLICY: GovernanceRetentionPolicy = {
  recommendationsMs: 90 * 24 * 60 * 60 * 1000,
  preparedPlansMs: 365 * 24 * 60 * 60 * 1000,
  auditEntriesMs: 365 * 24 * 60 * 60 * 1000,
};

export interface GovernanceSweepStats {
  governance_recommendations_deleted: number;
  prepared_remediation_plans_deleted: number;
  governance_audit_entries_deleted: number;
  swept_at: string;
}

/** Pure: list IDs older than ageThresholdMs given an `at` field. */
export function decideGovernanceDeletions<T extends { id: string; ts: Date }>(
  rows: ReadonlyArray<T>,
  now: number,
  ageThresholdMs: number,
): string[] {
  const cutoff = now - ageThresholdMs;
  return rows.filter(r => r.ts.getTime() < cutoff).map(r => r.id);
}

/** DB-backed sweep. */
export async function sweepGovernanceRetention(
  policy: GovernanceRetentionPolicy = DEFAULT_GOVERNANCE_RETENTION_POLICY,
): Promise<GovernanceSweepStats> {
  const swept_at = new Date().toISOString();
  const stats: GovernanceSweepStats = {
    governance_recommendations_deleted: 0,
    prepared_remediation_plans_deleted: 0,
    governance_audit_entries_deleted: 0,
    swept_at,
  };
  try {
    const { Op } = await import('sequelize');
    const { default: GovernanceRecommendation } = await import('../../../models/GovernanceRecommendation');
    const { default: PreparedRemediationPlan } = await import('../../../models/PreparedRemediationPlan');
    const { default: GovernanceAuditEntry } = await import('../../../models/GovernanceAuditEntry');
    const now = Date.now();
    stats.governance_recommendations_deleted = await GovernanceRecommendation.destroy({
      where: { created_at: { [Op.lt]: new Date(now - policy.recommendationsMs) } },
    });
    stats.prepared_remediation_plans_deleted = await PreparedRemediationPlan.destroy({
      where: { created_at: { [Op.lt]: new Date(now - policy.preparedPlansMs) } },
    });
    stats.governance_audit_entries_deleted = await GovernanceAuditEntry.destroy({
      where: { recorded_at: { [Op.lt]: new Date(now - policy.auditEntriesMs) } },
    });
  } catch (err: any) {
    console.warn('[governanceRetentionSweeper] sweep failed:', err?.message);
  }
  return stats;
}
