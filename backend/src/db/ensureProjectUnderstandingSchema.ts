import { sequelize } from '../config/database';

/**
 * AI Flotation, Gate 2 (2026-09-04) — where a conversation's structured project truth
 * lives once it has been extracted. Additive only: creates 1 new table and 2 indexes,
 * never alters or drops any existing column, table, or constraint.
 *
 * THE UNIQUE INDEX IS THE IDEMPOTENCY KEY, not a tidiness measure.
 *
 * Synthflow can deliver the same call-complete webhook more than once, and a retried
 * delivery must not run a second extraction: it would cost money twice, produce a
 * different answer the second time (the model is not deterministic), and leave two
 * conflicting understandings of one conversation with nothing to say which is current.
 * `(source, source_ref)` makes the second attempt a no-op at the database level rather
 * than relying on the application checking first, which is a race, not a control.
 *
 * FAILED EXTRACTIONS ARE STORED TOO, deliberately.
 *
 * A call that produced no understanding is a fact about that lead, and the row records
 * why - which error class, which message. Without it the failure is invisible: the lead
 * simply has no understanding, indistinguishable from a call nobody has processed yet,
 * and nobody can tell whether the pipeline is working or quietly dropping people.
 */
export async function ensureProjectUnderstandingSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS project_understandings (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       lead_id INTEGER,
       source VARCHAR(32) NOT NULL,
       source_ref VARCHAR(128) NOT NULL,
       status VARCHAR(20) NOT NULL,
       title VARCHAR(255),
       proposed_surfaces JSONB NOT NULL DEFAULT '[]'::jsonb,
       items JSONB NOT NULL DEFAULT '[]'::jsonb,
       rejected JSONB NOT NULL DEFAULT '[]'::jsonb,
       confidence JSONB,
       error_class VARCHAR(40),
       error TEXT,
       cost_usd DOUBLE PRECISION,
       runtime_ms INTEGER,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    // The scoped project - blueprint plus the generated proposal half - cached on the
    // understanding it derives from.
    //
    // Cached rather than regenerated per page load for two reasons: the proposal half costs
    // a model call, and it is NOT deterministic, so a customer refreshing the page would
    // watch the scope of their project quietly change. A scope that shifts while you read
    // it is worse than one that took a moment to appear.
    `ALTER TABLE project_understandings ADD COLUMN IF NOT EXISTS scope JSONB`,
    `ALTER TABLE project_understandings ADD COLUMN IF NOT EXISTS scope_generated_at TIMESTAMPTZ`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_project_understandings_source_ref
       ON project_understandings (source, source_ref)`,
    `CREATE INDEX IF NOT EXISTS idx_project_understandings_lead
       ON project_understandings (lead_id, created_at DESC)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] project_understandings schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Project understanding schema ensured');
}
