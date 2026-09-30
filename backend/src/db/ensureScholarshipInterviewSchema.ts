import { sequelize } from '../config/database';

/**
 * The scholarship interview: one row per person who talks to us about what they
 * want to build, captured for a HUMAN to read.
 *
 * Ensured via idempotent raw SQL rather than `sequelize.sync({ alter: true })` —
 * see ensureLiveSessionSchema.ts for why (large prod model graph, alter-sync hits
 * pre-existing index conflicts).
 *
 * WHAT THIS TABLE DELIBERATELY DOES NOT HAVE
 *
 * No score. No rank. No recommendation, decision or eligibility column. Career
 * Pathways Network has not written its eligibility rules or its selection process
 * yet, and a column called `score` would be filled in by somebody long before
 * those exist. The interview's whole job is to give a reviewer something real to
 * read, and adding a number would quietly turn it into the decision itself.
 *
 * It also holds no financial, hardship, immigration, health or household field.
 * The public privacy page promises never to publish those; the honest version of
 * that promise is not to collect them, and the interview prompt is instructed not
 * to ask. If one arrives anyway because somebody volunteered it, it lands in the
 * transcript as their own words and is not indexed, extracted or summarised.
 *
 * Additive only: creates one new table, never alters an existing one. Every
 * statement is IF NOT EXISTS and wrapped so a partial DB self-heals and
 * re-running boot is a no-op.
 */
export async function ensureScholarshipInterviewSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS scholarship_interviews (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       lead_id INTEGER NOT NULL,
       raw_payload_id UUID,
       status TEXT NOT NULL DEFAULT 'in_progress',
       transcript TEXT NOT NULL DEFAULT '',
       summary TEXT,
       exchanges INTEGER NOT NULL DEFAULT 0,
       completed_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    // One interview per submission. This is the idempotency key: a reload, a
    // double submit or a retried request must continue the same interview rather
    // than opening a second one against the same person.
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_scholarship_interviews_raw_payload
       ON scholarship_interviews (raw_payload_id)
       WHERE raw_payload_id IS NOT NULL`,
    // A reviewer works from the lead, so that is the lookup that has to be fast.
    `CREATE INDEX IF NOT EXISTS ix_scholarship_interviews_lead
       ON scholarship_interviews (lead_id)`,
    // Only these three states exist. A `decided` or `approved` value would be the
    // first step toward this table holding a selection outcome it must not hold.
    `ALTER TABLE scholarship_interviews DROP CONSTRAINT IF EXISTS ck_scholarship_interviews_status`,
    `ALTER TABLE scholarship_interviews
       ADD CONSTRAINT ck_scholarship_interviews_status
       CHECK (status IN ('in_progress', 'complete', 'abandoned'))`,
    // Deleting a lead should not strand its interview.
    `ALTER TABLE scholarship_interviews DROP CONSTRAINT IF EXISTS fk_scholarship_interviews_lead`,
    `ALTER TABLE scholarship_interviews
       ADD CONSTRAINT fk_scholarship_interviews_lead
       FOREIGN KEY (lead_id) REFERENCES leads (id) ON DELETE CASCADE`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err) {
      // Self-healing by design: a statement that loses a race with another boot
      // (or is already satisfied) must not stop the rest, and must never stop the
      // server from coming up over an interview table.
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        JSON.stringify({
          level: 'warn',
          service: 'backend',
          event: 'ensure_scholarship_interview_schema_statement_failed',
          outcome: 'partial',
          error_class: 'SchemaEnsureWarning',
          context: { statement: sql.slice(0, 80), message },
        })
      );
    }
  }
}
