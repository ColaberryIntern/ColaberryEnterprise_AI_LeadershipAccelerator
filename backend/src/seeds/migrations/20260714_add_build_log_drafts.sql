BEGIN;

-- Build-log -> social drafter (BC #9985689786), per TRAINING_INTEGRATION_PLAN
-- §3.7: weekly AI-drafted "building in public" content per completed Tier-A
-- build week — 4 independently-generated, independently-approved sections
-- (linkedin_post, video_script, architecture_update, demo_summary), all held
-- in draft_content. Draft-only — no auto-post; a human approves/posts each
-- section manually (Trust control per the ticket). One row per (project,
-- week), idempotent; per-section status/posted_at live inside draft_content
-- (see BuildLogSectionType in buildLogDraftService.ts), not as flat columns.
CREATE TABLE IF NOT EXISTS build_log_drafts (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  week_number        INTEGER      NOT NULL,
  source_artifact_id UUID         REFERENCES artifacts(id) ON DELETE SET NULL,
  draft_content      JSONB,
  generated_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_build_log_drafts_project_week UNIQUE (project_id, week_number)
);

CREATE INDEX IF NOT EXISTS idx_build_log_drafts_project_id ON build_log_drafts (project_id);

COMMIT;
