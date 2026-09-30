BEGIN;

-- Epic 4 — Community feed @mentions (BC #10036783688 / todo 9985689693).
-- The composer resolves @-autocomplete to member ids client-side; the backend
-- just validates + stores them. No free-text mention parsing server-side.
ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS mentioned_member_ids JSONB NOT NULL DEFAULT '[]';

COMMIT;
