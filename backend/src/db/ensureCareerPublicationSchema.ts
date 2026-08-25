import { sequelize } from '../config/database';

/**
 * Living Career Portfolio — Gate 10 (versioned publication) schema.
 *
 * Idempotent raw DDL, same pattern as ensureRefactoredDeliverySchema.ts /
 * ensureMultiTenantSchema.ts. Everything is CREATE ... IF NOT EXISTS, so a partial
 * database self-heals and re-running boot is a no-op. Deliberately NOT
 * `sync({alter:true})` — an ungated boot sync against this repo's model graph has
 * previously driven Postgres into OOM.
 *
 * THE INVARIANT THIS SCHEMA EXISTS TO ENFORCE (build plan §23):
 *
 *   The private Career Studio is live and changes constantly.
 *   The public portfolio is an IMMUTABLE APPROVED SNAPSHOT.
 *
 * New class work must grow the private portfolio without silently changing what an
 * employer already looked at. That is a data-model property here, not a discipline
 * someone has to remember: `career_publication_snapshots.payload` is written once at
 * submission and has no update path anywhere in the codebase.
 *
 * WHY APPROVALS ARE A SEPARATE TABLE. The obvious design puts `reviewed_by` /
 * `decision` / `reviewer_notes` on the snapshot row. That would mean the snapshot is
 * mutated after creation, and "immutable except for the columns we mutate" is not
 * immutable — it is an invitation for the payload to be edited too, one convenient
 * patch at a time. Keeping the decision in `career_publication_approvals` lets the
 * snapshot table be genuinely append-only, which is what makes "the public page cannot
 * have changed since review" checkable rather than merely intended.
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
 * One publication per person. `slug` is the public identity and is UNIQUE across the
 * platform — collision handling lives in the service (plan §58), because a database
 * error is a bad way to discover that two people share a name.
 *
 * `current_snapshot_id` is what the public page renders. It is nullable and stays NULL
 * until a human approves something: there is no state in which a publication exists and
 * silently serves unreviewed content.
 */
const PUBLICATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS career_publications (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     enrollment_id UUID NOT NULL,
     slug VARCHAR(80) NOT NULL,
     status VARCHAR(24) NOT NULL DEFAULT 'draft',
     current_snapshot_id UUID,
     talent_network_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  // One publication per learner. Two rows would make "which portfolio is theirs?"
  // depend on read order.
  `CREATE UNIQUE INDEX IF NOT EXISTS career_publications_enrollment_unique
     ON career_publications (enrollment_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS career_publications_slug_unique
     ON career_publications (slug)`,
  // The public reader looks up by slug AND status; a published-only partial index keeps
  // that path from scanning suspended/draft rows.
  `CREATE INDEX IF NOT EXISTS career_publications_published_slug
     ON career_publications (slug) WHERE status = 'published'`,
];

/**
 * APPEND-ONLY. There is no UPDATE or DELETE path to this table anywhere in the codebase
 * — the same contract `student_skill_evidence` holds for CAPE evidence.
 *
 * `content_hash` is a sha256 of the payload. It gives the idempotency the build plan
 * asks for in §61 ("same publication retry → one version"): resubmitting a portfolio
 * that has not changed since the last pending request is recognised as the same
 * submission rather than queuing a reviewer a second identical thing to read.
 */
const SNAPSHOTS: string[] = [
  `CREATE TABLE IF NOT EXISTS career_publication_snapshots (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     publication_id UUID NOT NULL,
     version INTEGER NOT NULL,
     payload JSONB NOT NULL,
     content_hash VARCHAR(64) NOT NULL,
     requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  // Version numbers are per publication and dense: v1, v2, v3 as an employer would
  // expect to see them, not global ids.
  `CREATE UNIQUE INDEX IF NOT EXISTS career_publication_snapshots_version_unique
     ON career_publication_snapshots (publication_id, version)`,
  `CREATE INDEX IF NOT EXISTS career_publication_snapshots_publication
     ON career_publication_snapshots (publication_id, version DESC)`,
];

/**
 * One decision per snapshot, enforced by a unique index rather than by the service
 * remembering to check. A reviewer double-clicking "Approve" is a real thing (plan §63
 * lists it explicitly as a failure to test), and the second insert must lose cleanly.
 *
 * A rejected or changes-requested snapshot is never revised: the learner keeps working
 * and submits a NEW snapshot, so the record of what was reviewed and what was decided
 * stays exactly as it was.
 */
const APPROVALS: string[] = [
  `CREATE TABLE IF NOT EXISTS career_publication_approvals (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     snapshot_id UUID NOT NULL,
     publication_id UUID NOT NULL,
     decision VARCHAR(24) NOT NULL,
     reviewer_id VARCHAR(255) NOT NULL,
     reviewer_email VARCHAR(255),
     reviewer_notes TEXT,
     decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS career_publication_approvals_snapshot_unique
     ON career_publication_approvals (snapshot_id)`,
  `CREATE INDEX IF NOT EXISTS career_publication_approvals_publication
     ON career_publication_approvals (publication_id, decided_at DESC)`,
];

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

const STATEMENTS: string[] = [...PUBLICATIONS, ...SNAPSHOTS, ...APPROVALS, ...MENTOR_SCOPES];

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
