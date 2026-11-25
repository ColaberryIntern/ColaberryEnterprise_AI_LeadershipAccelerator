import { sequelize } from '../config/database';

/**
 * Career Prep pilot feedback (Ali, 2026-11-25): what a student said about Career Prep, and our answer back.
 *
 * ADDITIVE ONLY: one new table, created lazily and memoized (like ensureBugReportSchema). UNIQUE (enrollment_id,
 * client_key) makes a double click or a retried request ONE row. The row is the record; the email is only a notice
 * (mail_status says whether it left). Deleting the enrollment deletes its feedback.
 * ROLLBACK, by hand: DROP TABLE IF EXISTS prep_feedback. Nothing references it.
 */
export const PREP_FEEDBACK_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS prep_feedback (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
     client_key VARCHAR(64) NOT NULL,
     kind VARCHAR(12) NOT NULL CHECK (kind IN ('broken','confusing','idea','works')),
     message TEXT NOT NULL,
     better TEXT,
     context JSONB NOT NULL DEFAULT '{}'::jsonb,
     screenshot BYTEA,
     screenshot_filename VARCHAR(40),
     status VARCHAR(12) NOT NULL DEFAULT 'new' CHECK (status IN ('new','looking','fixed','planned','not_now')),
     reply TEXT,
     replied_at TIMESTAMPTZ,
     reply_seen_at TIMESTAMPTZ,
     mail_status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (mail_status IN ('pending','sent','failed')),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (enrollment_id, client_key)
   )`,
  'CREATE INDEX IF NOT EXISTS prep_feedback_status_idx ON prep_feedback (status, created_at)',
];

let inflight: Promise<void> | null = null;

export function ensureCareerPrepFeedbackSchema(run: (sql: string) => Promise<unknown> = (s) => sequelize.query(s)): Promise<void> {
  if (!inflight) {
    inflight = (async () => { for (const s of PREP_FEEDBACK_STATEMENTS) await run(s); })()
      .catch((err) => { inflight = null; throw err; });
  }
  return inflight;
}

/** Tests only: forget the memo. */
export function resetCareerPrepFeedbackSchema(): void { inflight = null; }
