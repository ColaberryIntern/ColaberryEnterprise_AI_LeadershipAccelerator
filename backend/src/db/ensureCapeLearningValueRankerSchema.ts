import { sequelize } from '../config/database';

/**
 * CAPE Phase 4 schema — the learning-value ranker's explanation storage
 * (design doc §9 Stage 5, §13, §16 Phase 4). Same idempotent-raw-SQL pattern
 * as `ensureCapeSchema.ts` / `ensureCapePlacementSchema.ts` /
 * `ensureCapeCurriculumMapSchema.ts` — every statement is
 * `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, wrapped in its own try/catch so
 * a partial DB self-heals and re-running boot is a no-op. This repo does NOT
 * run global `sequelize.sync({alter:true})` at boot.
 *
 * Purely additive: 4 new NULLABLE columns on the EXISTING
 * `today_feed_impressions` table (created by `ensureTodayFeedSchema()` in
 * `server.ts`). MUST run AFTER `ensureTodayFeedSchema()` so the table already
 * exists before these ALTER TABLE statements run. Does not create any new
 * table, does not touch `student_skill_evidence`, `student_architecture_skill`,
 * `resume_skill_claims`, `architecture_skill_prerequisites`,
 * `curriculum_skill_maps`, or any promotion/XP table (design doc §17 AC 12).
 *
 * All 4 columns are nullable and stay NULL for every impression served while
 * `CAPE_LEARNING_VALUE_RANKER_ENABLED` is off (the default everywhere,
 * including production) — running this migration has zero behavioral effect
 * until the flag is flipped and the composer's write path (a later Phase 4
 * task) starts populating them.
 */
export async function ensureCapeLearningValueRankerSchema(): Promise<void> {
  const statements: string[] = [
    // rank_score — the Stage 3 explainable score (0..1) at serve time.
    `ALTER TABLE today_feed_impressions ADD COLUMN IF NOT EXISTS rank_score DOUBLE PRECISION`,
    // reasons — the Stage 3/4 human-readable explanation list, e.g.
    // ["closes a skill gap", "right difficulty level for you"].
    `ALTER TABLE today_feed_impressions ADD COLUMN IF NOT EXISTS reasons JSONB NOT NULL DEFAULT '[]'::jsonb`,
    // policy_version — which Stage 4 policy config (FeedPolicy) produced this
    // ordering, for audit/replay (design doc §13).
    `ALTER TABLE today_feed_impressions ADD COLUMN IF NOT EXISTS policy_version INTEGER`,
    // learner_state_version — the ISO timestamp of the LearnerState snapshot
    // (capeLearnerStateService.getLearnerState) this item was scored against.
    `ALTER TABLE today_feed_impressions ADD COLUMN IF NOT EXISTS learner_state_version TEXT`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'backend',
        event: 'cape_learning_value_ranker_schema_statement_failed',
        error_class: err?.name || 'Error',
        outcome: 'failure',
        context: { sql: sql.slice(0, 120), message: err?.message },
      }));
    }
  }
  console.log('[DB] CAPE learning-value ranker schema ensured');
}
