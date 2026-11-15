/**
 * ensureServiceGapSchema - storage for the AI Service Gap Detector (Services Upgrade GD1), additive only.
 *
 *   service_gap_analyses      one row per (tenant, case study, case fingerprint, catalog fingerprint, prompt version).
 *                             That UNIQUE key IS the idempotency key and the cache: the same case study against the
 *                             same catalog is analyzed once, however many times the button or the batch runs, and a
 *                             changed case study or catalog makes a NEW row (the old one becomes "stale" history).
 *                             The row also carries the human review (accepted / dismissed, who, when, note).
 *   service_gap_runs          one row per batch "Analyze unlinked case studies" run, with counters for progress.
 *                             A partial UNIQUE index allows at most ONE running run per tenant, decided by Postgres,
 *                             so two admins clicking at once cannot start two batches.
 *
 * Nothing here is read by any existing feature, and analysis rows never mutate services or links: running this
 * changes no current behaviour. ON DELETE CASCADE from case_studies, matching case_study_service_links.
 * Mirrored for production by `seeds/migrations/20261115_add_service_gap_tables.sql` (run BEFORE the deploy; this
 * boot-time ensure self-heals if it is forgotten). Must run AFTER ensureCaseStudySchema (FK parent).
 */
import { sequelize } from '../config/database';

export const SERVICE_GAP_TABLES: ReadonlyArray<string> = ['service_gap_analyses', 'service_gap_runs'];

export const SERVICE_GAP_STATEMENTS: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS service_gap_analyses (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL,
     case_study_id UUID NOT NULL REFERENCES case_studies(id) ON DELETE CASCADE,
     case_study_fingerprint VARCHAR(64) NOT NULL,
     catalog_fingerprint VARCHAR(64) NOT NULL,
     prompt_version TEXT NOT NULL,
     model_version TEXT NOT NULL,
     status TEXT NOT NULL,
     decision TEXT,
     result JSONB,
     error_class TEXT,
     error_message TEXT,
     analyzed_by TEXT,
     analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     review_state TEXT NOT NULL DEFAULT 'open',
     review_note TEXT,
     reviewed_by TEXT,
     reviewed_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS service_gap_analyses_key_idx
     ON service_gap_analyses (tenant_id, case_study_id, case_study_fingerprint, catalog_fingerprint, prompt_version)`,
  `CREATE INDEX IF NOT EXISTS service_gap_analyses_latest_idx
     ON service_gap_analyses (tenant_id, case_study_id, analyzed_at DESC)`,
  `CREATE TABLE IF NOT EXISTS service_gap_runs (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL,
     status TEXT NOT NULL DEFAULT 'running',
     total INTEGER NOT NULL DEFAULT 0,
     analyzed INTEGER NOT NULL DEFAULT 0,
     reused INTEGER NOT NULL DEFAULT 0,
     failed INTEGER NOT NULL DEFAULT 0,
     last_error TEXT,
     started_by TEXT,
     started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     finished_at TIMESTAMPTZ
   )`,
  // At most one running batch per tenant, enforced by the database rather than a read-then-insert check.
  `CREATE UNIQUE INDEX IF NOT EXISTS service_gap_runs_one_running_idx
     ON service_gap_runs (tenant_id) WHERE status = 'running'`,
];

export const SERVICE_GAP_ROLLBACK: ReadonlyArray<string> = [
  'DROP TABLE IF EXISTS service_gap_runs',
  'DROP TABLE IF EXISTS service_gap_analyses',
];

/** Thrown, not swallowed: without the unique key a re-run would duplicate analyses and batches could overlap. */
export async function ensureServiceGapSchema(): Promise<void> {
  for (const statement of SERVICE_GAP_STATEMENTS) {
    await sequelize.query(statement);
  }
}

export default ensureServiceGapSchema;
