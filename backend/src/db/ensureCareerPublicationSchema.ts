import { sequelize } from '../config/database';

/**
 * Career portfolio governance schema — the review gate and mentor scoping that sit on
 * top of the Capstone Record.
 *
 * Idempotent raw DDL, same pattern as ensureRefactoredDeliverySchema.ts. Everything is
 * CREATE/DROP ... IF EXISTS, so a partial database self-heals and re-running boot is a
 * no-op. Deliberately NOT `sync({alter:true})` — an ungated boot sync against this repo's
 * model graph has previously driven Postgres into OOM.
 *
 * CONVERGENCE, 2026-08-25. This file originally created a second public-portfolio stack
 * (`career_publications` + `career_publication_snapshots`) that duplicated
 * `capstone_records` + `capstone_record_versions` almost field for field. Two sessions had
 * independently built the same product and landed on the same design. Ali's call: the
 * Capstone Record at /p/:slug wins, because it shipped and is live.
 *
 * So what remains here is only what Capstone genuinely lacked:
 *
 *   capstone_review_approvals   a human must approve before status becomes 'published'
 *   career_mentor_scopes        which learners a given mentor may review
 *
 * The superseded tables are dropped at boot rather than by hand, so any environment that
 * already created them converges on the next deploy.
 */

/** Structured, non-fatal failure log. One bad statement must never stop the server. */
function logStatementFailure(sql: string, err: unknown): void {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event: 'ensure_career_publication_schema_statement_failed',
      outcome: 'failure',
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      context: {
        sql: sql.slice(0, 160),
        message: err instanceof Error ? err.message : String(err),
      },
    }),
  );
}




/**
 * Which learners a mentor is over.
 *
 * Ali, 2026-08-25: "mentors should be able to see all the projects and details that
 * they are over" and "mentor privilege can be controlled by admin". Two separate
 * grants, deliberately: mgmt_role = mentor decides whether they may open the review
 * surface AT ALL, and THIS table decides whose portfolios they see inside it. Without
 * the second, a mentor role alone would expose every learner on the platform.
 *
 * scope_type is COHORT or ENROLLMENT so an admin can grant breadth ("you mentor the
 * July cohort") or precision ("you mentor these four people") without needing two
 * different tables or a migration when the answer changes.
 *
 * Revocation is a timestamp, never a delete: who could see whose portfolio, and when,
 * is exactly the kind of question that gets asked months later.
 */
const MENTOR_SCOPES: string[] = [
  `CREATE TABLE IF NOT EXISTS career_mentor_scopes (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     mentor_enrollment_id UUID NOT NULL,
     scope_type VARCHAR(16) NOT NULL,
     scope_id UUID NOT NULL,
     granted_by VARCHAR(255) NOT NULL,
     granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     revoked_at TIMESTAMPTZ,
     revoked_by VARCHAR(255),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  // One LIVE grant per (mentor, scope). Re-granting something already granted must be
  // a no-op rather than a second row that has to be revoked twice.
  `CREATE UNIQUE INDEX IF NOT EXISTS career_mentor_scopes_live_unique
     ON career_mentor_scopes (mentor_enrollment_id, scope_type, scope_id)
     WHERE revoked_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS career_mentor_scopes_mentor
     ON career_mentor_scopes (mentor_enrollment_id) WHERE revoked_at IS NULL`,
];

/**
 * CONVERGENCE, 2026-08-25. `career_publications` and `career_publication_snapshots`
 * duplicated `capstone_records` and `capstone_record_versions` almost field for field —
 * two sessions independently landed on "store the compiled record whole, keep a versions
 * table". Capstone shipped first and is live, so it wins and these are dropped rather
 * than reconciled. All three were empty in production, so nothing migrated.
 *
 * DROP IF EXISTS, not a manual cleanup, so an environment that already created them
 * self-heals on the next boot exactly like every other statement in this file.
 */
const DROP_SUPERSEDED: string[] = [
  `DROP TABLE IF EXISTS career_publication_approvals`,
  `DROP TABLE IF EXISTS career_publication_snapshots`,
  `DROP TABLE IF EXISTS career_publications`,
];

/**
 * The review gate Capstone lacked. One row per review of one record version: created when
 * the learner asks (decision NULL), stamped when a human decides.
 *
 * The partial unique index is what makes "ask twice" a no-op instead of two identical
 * things in a reviewer's queue.
 */
const CAPSTONE_REVIEWS: string[] = [
  `CREATE TABLE IF NOT EXISTS capstone_review_approvals (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     record_id UUID NOT NULL,
     enrollment_id UUID NOT NULL,
     version INTEGER NOT NULL,
     requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     decision VARCHAR(24),
     reviewer_id VARCHAR(255),
     reviewer_email VARCHAR(255),
     reviewer_notes TEXT,
     decided_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  // At most ONE pending review per record. Asking again while one is open returns the
  // existing request rather than queueing a reviewer a second copy.
  `CREATE UNIQUE INDEX IF NOT EXISTS capstone_review_pending_unique
     ON capstone_review_approvals (record_id) WHERE decision IS NULL`,
  `CREATE INDEX IF NOT EXISTS capstone_review_queue
     ON capstone_review_approvals (enrollment_id, requested_at) WHERE decision IS NULL`,
];

/**
 * The person-level public portfolio at /u/:slug.
 *
 * THIS IS NOT `career_publications` COMING BACK. That table was deleted on 2026-08-25
 * because it stored a compiled record whole plus a versions table, which is exactly what
 * `capstone_records` + `capstone_record_versions` already do. This table stores NO
 * compiled content and has NO versions table. It holds three things a projection cannot
 * compute for itself: where the page lives (`slug`), who may see it (`visibility`), and
 * the small set of LEARNER-AUTHORED strings a human actually approved.
 *
 * LIVE WHERE THE SYSTEM IS THE AUTHOR, FROZEN WHERE THE LEARNER IS.
 *
 *   capabilities   computed from the append-only evidence ledger -> read LIVE. New
 *                  verified evidence appearing on the page is the point.
 *   records        only already-published capstone records, each individually reviewed
 *                  -> read LIVE, because each one already passed a human.
 *   headline       learner-authored free text -> FROZEN in `approved_identity`. Read
 *   avatar         live, a learner could be approved and then change their headline to
 *                  anything, or upload any image, and it would sit on a public
 *                  colaberry.ai URL under Colaberry's name.
 *
 * So `approved_identity` is a review artifact, not a content snapshot: it exists only so
 * that what a reviewer read is what a stranger sees.
 *
 * `visibility` defaults to `unlisted`, never `public`. Ali, 2026-08-25: default noindex,
 * the learner opts in to being indexable.
 */
const PORTFOLIO_PAGES: string[] = [
  `CREATE TABLE IF NOT EXISTS career_portfolio_pages (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     enrollment_id UUID NOT NULL,
     slug VARCHAR(160) NOT NULL,
     status VARCHAR(24) NOT NULL DEFAULT 'draft',
     visibility VARCHAR(24) NOT NULL DEFAULT 'unlisted',
     approved_identity JSONB,
     review_requested_at TIMESTAMPTZ,
     approved_at TIMESTAMPTZ,
     approved_by VARCHAR(255),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  // One page per learner. Without this, a retried create makes a second page and the
  // slug a learner shared silently stops being the one that resolves.
  // Idempotent for a table that may already exist from an earlier deploy of this file.
  `ALTER TABLE career_portfolio_pages ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ`,
  `CREATE UNIQUE INDEX IF NOT EXISTS career_portfolio_pages_enrollment_unique
     ON career_portfolio_pages (enrollment_id)`,
  // A slug is an address. Two people cannot hold the same one, ever.
  `CREATE UNIQUE INDEX IF NOT EXISTS career_portfolio_pages_slug_unique
     ON career_portfolio_pages (LOWER(slug))`,
  // The public reader's only lookup: resolve a slug that is actually viewable.
  `CREATE INDEX IF NOT EXISTS career_portfolio_pages_public_lookup
     ON career_portfolio_pages (LOWER(slug)) WHERE status = 'published'`,
];

const STATEMENTS: string[] = [
  ...DROP_SUPERSEDED,
  ...CAPSTONE_REVIEWS,
  ...MENTOR_SCOPES,
  ...PORTFOLIO_PAGES,
];

/**
 * Runs every statement, logging and continuing on failure. A schema step must never be
 * able to stop the server from booting — a missing index degrades a query, a thrown
 * error takes the whole platform down.
 */
export async function ensureCareerPublicationSchema(): Promise<void> {
  for (const sql of STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err) {
      logStatementFailure(sql, err);
    }
  }
}

export default ensureCareerPublicationSchema;
