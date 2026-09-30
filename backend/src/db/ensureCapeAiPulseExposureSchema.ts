import { sequelize } from '../config/database';

/**
 * CAPE Today Plan `ai_pulse` rotation ledger — scoped bugfix (2026-08-06,
 * Session CC-20260802-r4q9). `capeTodayPlanService.ts`'s `ai_pulse` slot was
 * always `pickFirst`-ing the earliest-in-candidate-order AI Pulse item — a
 * stable, unshuffled, append-only feed (`today_feed_impressions`) — so a
 * learner saw the literal same card every day even with 300+ eligible
 * alternatives in production. See `capeTodayPlanService.ts`'s own header
 * comment and `capeAiPulseExposureService.ts` for the full root cause and fix.
 *
 * This table is the minimum-necessary new signal: one row per
 * (enrollment_id, ref) recording the last time that ref was actually placed
 * in the `ai_pulse` slot of an assembled Today Plan, so the picker can prefer
 * least-recently-shown eligible candidates instead of always the first one in
 * a frozen candidate list (design doc §9 Stage 2 "frequency/cooldown policy"
 * and Stage 4 anti-crowd-out reranking language — "Prevent one popular
 * skill, source, or content format from crowding out the path").
 *
 * Deliberately NOT reusing/altering `today_feed_impressions`: that table's
 * `served_at` records when an item was first MATERIALIZED into the
 * bottomless feed (once, ever, for pagination/cooldown purposes) — not when
 * it was last surfaced specifically in the finite Today Plan's `ai_pulse`
 * slot. Conflating the two would corrupt that table's existing
 * ambient-cooldown/pagination contract, which this fix must not touch.
 *
 * Idempotent raw-SQL pattern, additive only — same convention as the other
 * `ensureCape*Schema.ts` files in this directory (this repo does NOT run
 * global `sequelize.sync({alter:true})` at boot). `(enrollment_id, ref)` is
 * unique and backs an `ON CONFLICT ... DO UPDATE` upsert in
 * `capeAiPulseExposureService.recordAiPulseExposure`, so recording the same
 * exposure twice converges to one row with the latest `last_shown_at` — safe
 * to call on every `getTodayPlan` run, never a duplicate-row hazard.
 */
export async function ensureCapeAiPulseExposureSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS cape_ai_pulse_exposure (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       enrollment_id UUID NOT NULL REFERENCES enrollments(id),
       ref VARCHAR(255) NOT NULL,
       shown_count INTEGER NOT NULL DEFAULT 1,
       last_shown_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_cape_ai_pulse_exposure_enrollment_ref ON cape_ai_pulse_exposure (enrollment_id, ref)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'backend',
        event: 'cape_ai_pulse_exposure_schema_statement_failed',
        error_class: err?.name || 'Error',
        outcome: 'failure',
        context: { sql: sql.slice(0, 120), message: err?.message },
      }));
    }
  }
  console.log('[DB] CAPE AI Pulse exposure schema ensured');
}
