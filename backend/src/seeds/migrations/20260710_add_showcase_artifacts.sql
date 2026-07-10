BEGIN;

-- Tier-B showcase-artifact slots (BC #9985689928). Flexible, non-week-bound
-- artifacts per student project — the system scaffolds one row per type, AI
-- drafts each. Distinct from Tier-A's week-bound ArtifactDefinition/
-- ProjectArtifact grading system (blocked separately, see BC #9985689899);
-- this hangs directly off the real `projects` table.
CREATE TABLE IF NOT EXISTS showcase_artifacts (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  artifact_type  VARCHAR(30)  NOT NULL,
  status         VARCHAR(20)  NOT NULL DEFAULT 'scaffolded',
  draft_content  JSONB,
  portfolio_slot VARCHAR(100),
  generated_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_showcase_artifacts_type CHECK (artifact_type IN ('demo_video', 'explainer_podcast', 'one_pager_infographic', 'ppt')),
  CONSTRAINT ck_showcase_artifacts_status CHECK (status IN ('scaffolded', 'drafted', 'reviewed', 'published')),
  CONSTRAINT uq_showcase_artifacts_project_type UNIQUE (project_id, artifact_type)
);

CREATE INDEX IF NOT EXISTS idx_showcase_artifacts_project_id ON showcase_artifacts (project_id);

COMMIT;
