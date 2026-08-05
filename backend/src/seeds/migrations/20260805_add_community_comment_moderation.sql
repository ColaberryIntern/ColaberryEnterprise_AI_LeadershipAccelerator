-- Comment moderation (Community Organizer role, Ali 2026-08-05). Mirrors the
-- existing community_posts soft-delete (20260713_add_community_moderation.sql):
-- a removed comment stays in the DB for audit but drops out of the thread.
-- Idempotent: ADD COLUMN IF NOT EXISTS + a guarded CHECK. Also applied at boot
-- by ensureCommunityCommentModerationSchema() in server.ts, so a deploy
-- self-heals without a manual step; this file is the record + a
-- belt-and-suspenders manual apply.
BEGIN;

ALTER TABLE community_comments ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'visible';
ALTER TABLE community_comments ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;
ALTER TABLE community_comments ADD COLUMN IF NOT EXISTS removed_by UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_community_comments_status') THEN
    ALTER TABLE community_comments ADD CONSTRAINT ck_community_comments_status CHECK (status IN ('visible', 'removed'));
  END IF;
END $$;

COMMIT;
