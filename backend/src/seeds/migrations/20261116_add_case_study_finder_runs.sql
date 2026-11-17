-- Case Study Finder storage (Services Upgrade CF1, 2026-11-16).
--
-- WHY THIS TABLE EXISTS. The Finder proposes which case study to build next: it reads our proof gaps and the business
-- processes in this repo and the connected repos, skips what an existing case study covers, and stores each run's
-- proposals (with before/after evidence scores) so the page can show the last good result while a new run works.
--   case_study_finder_runs: one row per run, result as JSONB; at most ONE running run per tenant.
--
-- ADDITIVE ONLY. One new table; nothing existing is altered or dropped. A run never changes a service, a link or a
-- case study. Idempotent: every statement is IF NOT EXISTS. The backend also ensures it at boot
-- (ensureCaseStudyFinderSchema), so this file is the reviewed record, not a deploy prerequisite.

CREATE TABLE IF NOT EXISTS case_study_finder_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  stage TEXT,
  result JSONB,
  last_error TEXT,
  started_by TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS case_study_finder_runs_one_running_idx
  ON case_study_finder_runs (tenant_id) WHERE status = 'running';

CREATE INDEX IF NOT EXISTS case_study_finder_runs_latest_idx
  ON case_study_finder_runs (tenant_id, started_at DESC);

-- ROLLBACK (manual): DROP TABLE IF EXISTS case_study_finder_runs;
