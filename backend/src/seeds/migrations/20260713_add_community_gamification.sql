-- Epic 4 — Gamification: points -> levels -> leaderboards -> level-gated
-- unlocks (BC #9985689739 / REQ-C4). Adds an append-only points event log
-- (needed to compute 7d/30d rolling leaderboard windows — CommunityMember.points
-- is only a running total with no history) and a min_level gate on posts.
BEGIN;

ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS min_level INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS community_points_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES community_members(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_points_events_member_created
  ON community_points_events (member_id, created_at);

COMMIT;
