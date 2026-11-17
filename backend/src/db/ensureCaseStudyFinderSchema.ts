/**
 * ensureCaseStudyFinderSchema - storage for the Case Study Finder (Services Upgrade CF1), additive only.
 *
 *   case_study_finder_builds one row per "Build this case study" (CF2), unique per proposal.
 *   case_study_finder_runs   one row per Finder run: status, the stage shown while it runs, and the whole result as
 *                            JSONB (proposals, exclusions, repos read). A partial UNIQUE index allows at most ONE
 *                            running run per tenant, decided by Postgres, so two clicks cannot start two runs.
 *
 * Nothing existing reads this table and a run never mutates services, links or case studies.
 * Mirrored for production by `seeds/migrations/20261116_add_case_study_finder_runs.sql`.
 */
import { sequelize } from '../config/database';

export const CASE_STUDY_FINDER_STATEMENTS: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS case_study_finder_runs (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL,
     status TEXT NOT NULL DEFAULT 'running',
     stage TEXT,
     result JSONB,
     last_error TEXT,
     started_by TEXT,
     started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     finished_at TIMESTAMPTZ
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS case_study_finder_runs_one_running_idx
     ON case_study_finder_runs (tenant_id) WHERE status = 'running'`,
  `CREATE INDEX IF NOT EXISTS case_study_finder_runs_latest_idx
     ON case_study_finder_runs (tenant_id, started_at DESC)`,
  // CF2: one row per "Build this case study". UNIQUE (tenant, proposal) is the idempotency key: a second click returns
  // the draft already made, never a duplicate. case_study_id has no FK on purpose: archiving a draft keeps the record.
  `CREATE TABLE IF NOT EXISTS case_study_finder_builds (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL,
     proposal_id VARCHAR(32) NOT NULL,
     case_study_id UUID NOT NULL,
     title TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'prepared',
     sync_status TEXT NOT NULL DEFAULT 'running',
     sync_note TEXT,
     scope JSONB,
     command TEXT NOT NULL,
     ticket_url TEXT,
     ticket_error TEXT,
     created_by TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS case_study_finder_builds_proposal_idx
     ON case_study_finder_builds (tenant_id, proposal_id)`,
];

export const CASE_STUDY_FINDER_ROLLBACK: ReadonlyArray<string> = [
  'DROP TABLE IF EXISTS case_study_finder_builds',
  'DROP TABLE IF EXISTS case_study_finder_runs',
];

/**
 * Thrown, not swallowed: without the one-running index two runs could overlap. Every statement is IF NOT EXISTS
 * and has no replacements, so it cannot fail on a healthy database the way a parameterized boot check can.
 */
export async function ensureCaseStudyFinderSchema(): Promise<void> {
  for (const statement of CASE_STUDY_FINDER_STATEMENTS) {
    await sequelize.query(statement);
  }
}

export default ensureCaseStudyFinderSchema;
