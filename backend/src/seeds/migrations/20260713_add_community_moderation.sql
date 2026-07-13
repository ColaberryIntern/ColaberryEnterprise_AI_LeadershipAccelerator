BEGIN;

-- Moderation hardening (REQ-C9, BC #10077100017). Staff can review a
-- reported post and remove it; a report is its own row (not a boolean flag)
-- so a post can accumulate multiple reports, and re-reporting the same post
-- by the same member is a no-op via the unique constraint (idempotent).
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'visible';
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS removed_by UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_community_posts_status') THEN
    ALTER TABLE community_posts ADD CONSTRAINT ck_community_posts_status CHECK (status IN ('visible', 'removed'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS community_post_reports (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id            UUID         NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  reporter_member_id UUID         NOT NULL REFERENCES community_members(id) ON DELETE CASCADE,
  reason             TEXT,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_community_post_reports_post_reporter UNIQUE (post_id, reporter_member_id)
);

CREATE INDEX IF NOT EXISTS idx_community_post_reports_post_id ON community_post_reports (post_id);

COMMIT;
