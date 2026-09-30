import { sequelize } from '../config/database';

/**
 * CAPE Phase 5 schema — the learner feedback-control ledger (design doc §11,
 * §16 Phase 5). Same idempotent-raw-SQL pattern as `ensureCapeSchema.ts` /
 * `ensureCapeLearningValueRankerSchema.ts` — every statement is
 * `CREATE TABLE/INDEX ... IF NOT EXISTS`, wrapped in its own try/catch so a
 * partial DB self-heals and re-running boot is a no-op. This repo does NOT
 * run global `sequelize.sync({alter:true})` at boot.
 *
 * Columns must match `backend/src/models/TodayPlanFeedback.ts` EXACTLY.
 *
 * One new table only. Additive: never alters or drops any existing column,
 * table, or constraint. Does NOT touch `student_skill_evidence` — "Already
 * know this" alone must never award Architecture Skill evidence (design doc
 * §11, §17); `today_plan_feedback` is a ranking/personalization signal table,
 * fully separate from the evidence ledger (see `capeTodayPlanFeedbackService.ts`,
 * which is the ONLY write path onto this table and never calls
 * `capeEvidenceLedgerService.recordSkillEvidence`).
 *
 * Idempotency: `idempotency_key` is `today_plan_feedback:<enrollment_id>:<ref>:
 * <action>` — a repeat of the SAME action on the SAME ref for the SAME
 * enrollment is a no-op (findOrCreate, see capeTodayPlanFeedbackService.ts),
 * matching the `student_skill_evidence.idempotency_key` pattern rather than
 * `today_feed_impressions`'s composite-unique-index pattern, since feedback
 * interactions are naturally keyed by (enrollment_id, ref, action) rather than
 * a stable position.
 */
export async function ensureCapeTodayPlanSchema(): Promise<void> {
  const statements: string[] = [
    // Learner feedback controls (design doc §11): more_like_this /
    // less_like_this / already_know / too_easy / too_advanced / not_interested.
    // "test_out" is deliberately NOT an action stored here — it routes through
    // the existing diagnostic_attempts table via capeDiagnosticService, never
    // duplicated onto this table (see capeTodayPlanFeedbackService.startTestOut).
    `CREATE TABLE IF NOT EXISTS today_plan_feedback (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       enrollment_id UUID NOT NULL REFERENCES enrollments(id),
       ref VARCHAR(255) NOT NULL,
       skill_id VARCHAR(40),
       action VARCHAR(30) NOT NULL,
       idempotency_key VARCHAR(300) NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_today_plan_feedback_idem ON today_plan_feedback (idempotency_key)`,
    `CREATE INDEX IF NOT EXISTS idx_today_plan_feedback_enrollment_ref ON today_plan_feedback (enrollment_id, ref)`,
    `CREATE INDEX IF NOT EXISTS idx_today_plan_feedback_action ON today_plan_feedback (action)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'backend',
        event: 'cape_today_plan_schema_statement_failed',
        error_class: err?.name || 'Error',
        outcome: 'failure',
        context: { sql: sql.slice(0, 120), message: err?.message },
      }));
    }
  }
  console.log('[DB] CAPE Today Plan feedback schema ensured');
}
