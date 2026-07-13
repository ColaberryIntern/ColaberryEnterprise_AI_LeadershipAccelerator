BEGIN;

-- Unified Artifact model (STUDENT_PLATFORM_BUILD_SPEC.md §7), hung off the
-- real `projects` table. Tier-A build-artifact slots (BC #9985689899, week-
-- bound, gradeable) land here now. Tier-B showcase artifacts (BC #9985689928)
-- remain on the separate `showcase_artifacts` table for now (shipped 2026-07-10,
-- before this decision) — folding them into this table is a deliberate,
-- separately-tracked follow-up, not silently expanded scope on this ticket.
CREATE TABLE IF NOT EXISTS artifacts (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type           VARCHAR(20)  NOT NULL,
  week_number    INTEGER,
  url            VARCHAR(2048),
  status         VARCHAR(20)  NOT NULL DEFAULT 'not_started',
  portfolio_slot VARCHAR(100),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_artifacts_type CHECK (type IN ('build', 'showcase')),
  CONSTRAINT ck_artifacts_status CHECK (status IN ('not_started', 'in_progress', 'submitted', 'reviewed')),
  CONSTRAINT ck_artifacts_build_week CHECK (type <> 'build' OR (week_number BETWEEN 1 AND 12))
);

CREATE INDEX IF NOT EXISTS idx_artifacts_project_id ON artifacts (project_id);

-- Idempotency key for scaffolding: one row per (project, week) for build-type
-- artifacts. Partial index because showcase-type rows (week_number IS NULL)
-- don't participate in this uniqueness rule.
CREATE UNIQUE INDEX IF NOT EXISTS uq_artifacts_project_week_build
  ON artifacts (project_id, week_number)
  WHERE type = 'build';

COMMIT;
