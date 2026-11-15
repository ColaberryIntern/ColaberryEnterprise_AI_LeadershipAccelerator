-- AI Service Gap Detector storage (Services Upgrade GD1, 2026-11-15).
--
-- WHY THESE TABLES EXIST. The detector recommends, per unlinked case study, whether it matches an existing service,
-- should widen one, belongs to a Growth service, justifies a new service, or lacks the evidence to say.
--   service_gap_analyses: one row per (tenant, case study, case fingerprint, catalog fingerprint, prompt version).
--     That UNIQUE key is the idempotency key and the cache. It also holds the human review of the recommendation.
--   service_gap_runs: one row per batch run, with progress counters; at most ONE running run per tenant.
--
-- ADDITIVE ONLY. Two new tables; no existing table, column, constraint or index is altered or dropped. Analysis rows
-- never change a service or a link, so running this changes no current behaviour.
--
-- Idempotent: every statement is IF NOT EXISTS. Safe to run twice; the second run is a no-op.
-- The backend also self-heals this at boot (`db/ensureServiceGapSchema.ts` runs the identical statements).
--
-- Rollback: DROP TABLE IF EXISTS service_gap_runs; DROP TABLE IF EXISTS service_gap_analyses;
--   (advisory data only; no service, link or case study depends on it.)
--
-- Run on prod BEFORE the deploy:
--   docker exec -i accelerator-db psql -U accelerator accelerator_prod \
--     < backend/src/seeds/migrations/20261115_add_service_gap_tables.sql

BEGIN;

CREATE TABLE IF NOT EXISTS service_gap_analyses (
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
);

CREATE UNIQUE INDEX IF NOT EXISTS service_gap_analyses_key_idx
  ON service_gap_analyses (tenant_id, case_study_id, case_study_fingerprint, catalog_fingerprint, prompt_version);

CREATE INDEX IF NOT EXISTS service_gap_analyses_latest_idx
  ON service_gap_analyses (tenant_id, case_study_id, analyzed_at DESC);

CREATE TABLE IF NOT EXISTS service_gap_runs (
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
);

CREATE UNIQUE INDEX IF NOT EXISTS service_gap_runs_one_running_idx
  ON service_gap_runs (tenant_id) WHERE status = 'running';

COMMIT;
