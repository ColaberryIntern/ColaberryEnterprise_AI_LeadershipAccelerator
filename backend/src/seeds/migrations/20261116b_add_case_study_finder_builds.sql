-- Case Study Finder builds (Services Upgrade CF2, 2026-11-16).
--
-- One row per "Build this case study": the private draft the server created (skill steps 0-2), the approved path
-- scope, the exact /build-case-study command, the Basecamp build ticket and the sync outcome.
-- UNIQUE (tenant_id, proposal_id) is the idempotency key: a second click returns the existing draft.
-- ADDITIVE ONLY, idempotent (IF NOT EXISTS). The backend also ensures it at boot (ensureCaseStudyFinderSchema).

CREATE TABLE IF NOT EXISTS case_study_finder_builds (
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
);

CREATE UNIQUE INDEX IF NOT EXISTS case_study_finder_builds_proposal_idx
  ON case_study_finder_builds (tenant_id, proposal_id);

-- ROLLBACK (manual): DROP TABLE IF EXISTS case_study_finder_builds;
