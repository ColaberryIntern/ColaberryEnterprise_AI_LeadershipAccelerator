import { sequelize } from '../config/database';

/**
 * Milestone ladder schema — the two tables behind the build ladder decided on
 * 2026-09-16 (docs/POINTS_LADDER_DECISIONS.md):
 *
 *   student_milestones       latched program milestones (curriculum, projects,
 *                            approved certification); counted by the promotion
 *                            engine, never edited
 *   student_certifications   a certificate the student uploaded and staff
 *                            approve or reject
 *
 * Ensured via idempotent raw SQL like every sibling ensure* module: this model
 * graph runs NO global sync at boot, so each statement is CREATE ... IF NOT
 * EXISTS in its own try/catch and a partial database self-heals on the next
 * boot. Additive only — no existing table or column is touched. FK-shaped
 * columns are plain UUIDs without REFERENCES, matching the repo convention, so
 * boot order is not load-bearing.
 *
 * The UNIQUE index on student_milestones is THE idempotency guarantee of the
 * whole ladder: two concurrent syncs (a card completion and a repo push in the
 * same second) cannot latch the same milestone twice, because the storage
 * engine refuses the second row. The partial unique index on certifications
 * lets a rejected claim be re-submitted as a new row while a pending or
 * approved one blocks duplicates.
 */
export async function ensureMilestoneLadderSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS student_milestones (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       enrollment_id UUID NOT NULL,
       milestone_type VARCHAR(40) NOT NULL,
       source_ref VARCHAR(150) NOT NULL,
       achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       evidence JSONB,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_student_milestones_key
       ON student_milestones (enrollment_id, milestone_type, source_ref)`,
    `CREATE INDEX IF NOT EXISTS idx_student_milestones_enrollment
       ON student_milestones (enrollment_id)`,

    `CREATE TABLE IF NOT EXISTS student_certifications (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       enrollment_id UUID NOT NULL,
       track VARCHAR(40) NOT NULL DEFAULT 'cca_f',
       status VARCHAR(20) NOT NULL DEFAULT 'pending',
       file_name VARCHAR(255) NOT NULL,
       file_mime VARCHAR(100) NOT NULL,
       original_name VARCHAR(255),
       credential_id VARCHAR(120),
       passed_on DATE,
       note TEXT,
       submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       reviewed_at TIMESTAMPTZ,
       reviewed_by VARCHAR(255),
       review_note TEXT,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_student_certifications_open
       ON student_certifications (enrollment_id, track)
       WHERE status IN ('pending', 'approved')`,
    `CREATE INDEX IF NOT EXISTS idx_student_certifications_enrollment
       ON student_certifications (enrollment_id)`,
    `CREATE INDEX IF NOT EXISTS idx_student_certifications_status
       ON student_certifications (status)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        service: 'backend',
        event: 'ensure_milestone_ladder_schema_statement_failed',
        outcome: 'failure',
        error_class: err?.constructor?.name ?? 'Error',
        context: { message: err?.message, sql: sql.slice(0, 120) },
      }));
    }
  }

  await assertMilestoneLadderSchema();
}

/**
 * Post-check that names what is missing rather than letting the per-statement
 * try/catch report "ensured" over a half-built schema.
 */
async function assertMilestoneLadderSchema(): Promise<void> {
  try {
    const [rows] = await sequelize.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name IN ('student_milestones', 'student_certifications')`,
    ) as [Array<{ table_name: string }>, unknown];
    const present = new Set(rows.map((r) => r.table_name));
    const missing = ['student_milestones', 'student_certifications'].filter((t) => !present.has(t));
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: missing.length ? 'error' : 'info',
      service: 'backend',
      event: 'milestone_ladder_schema_ensured',
      outcome: missing.length ? 'partial' : 'success',
      context: { missing },
    }));
  } catch (err: any) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event: 'milestone_ladder_schema_assert_failed',
      outcome: 'failure',
      error_class: err?.constructor?.name ?? 'Error',
      context: { message: err?.message },
    }));
  }
}
