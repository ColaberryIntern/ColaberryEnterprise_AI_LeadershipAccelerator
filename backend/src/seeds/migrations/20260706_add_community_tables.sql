BEGIN;

-- Epic 4 — Community + Gamification data model (BC #10036783688 / todo 9985689666).
-- Scoped per-cohort (community_events, and transitively posts/members via
-- enrollment → cohort) so one cohort's community never leaks into another's.

-- ── 1. community_members ─────────────────────────────────────────────────────
-- One row per enrollment. Denormalized display fields so the feed/profile/
-- leaderboard don't join back to enrollments on every read.
CREATE TABLE IF NOT EXISTS community_members (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id    UUID         NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  display_name     VARCHAR(255) NOT NULL,
  avatar_url       VARCHAR(500),
  bio              TEXT,
  level            INTEGER      NOT NULL DEFAULT 1,
  points           INTEGER      NOT NULL DEFAULT 0,
  presence_status  VARCHAR(20)  NOT NULL DEFAULT 'offline',
  last_active_at   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_community_members_enrollment UNIQUE (enrollment_id),
  CONSTRAINT ck_community_members_presence CHECK (presence_status IN ('online', 'away', 'offline'))
);

CREATE INDEX IF NOT EXISTS idx_community_members_points ON community_members (points);

-- ── 2. community_posts ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_posts (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id      UUID         NOT NULL REFERENCES community_members(id) ON DELETE CASCADE,
  cohort_id      UUID         NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  body           TEXT         NOT NULL,
  media_urls     JSONB        NOT NULL DEFAULT '[]',
  category       VARCHAR(100),
  pinned         BOOLEAN      NOT NULL DEFAULT false,
  like_count     INTEGER      NOT NULL DEFAULT 0,
  comment_count  INTEGER      NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_posts_cohort_id ON community_posts (cohort_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_member_id ON community_posts (member_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_category ON community_posts (category);
CREATE INDEX IF NOT EXISTS idx_community_posts_pinned ON community_posts (pinned);

-- ── 3. community_comments ────────────────────────────────────────────────────
-- parent_comment_id is one level deep (comment → reply), matching spec §7's
-- "Comment → Reply". Deeper nesting is not modeled for v1.
CREATE TABLE IF NOT EXISTS community_comments (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id            UUID         NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  member_id          UUID         NOT NULL REFERENCES community_members(id) ON DELETE CASCADE,
  parent_comment_id  UUID         REFERENCES community_comments(id) ON DELETE CASCADE,
  body               TEXT         NOT NULL,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_comments_post_id ON community_comments (post_id);
CREATE INDEX IF NOT EXISTS idx_community_comments_member_id ON community_comments (member_id);
CREATE INDEX IF NOT EXISTS idx_community_comments_parent_id ON community_comments (parent_comment_id);

-- ── 4. community_likes ───────────────────────────────────────────────────────
-- Polymorphic like target (post or comment). The unique constraint on
-- (member_id, likeable_type, likeable_id) IS the idempotency mechanism — a
-- member liking the same target twice is a no-op at the DB layer
-- (INSERT ... ON CONFLICT DO NOTHING at the app layer), per root CLAUDE.md's
-- idempotency rule. 1 like = 1 point (spec §6.A).
CREATE TABLE IF NOT EXISTS community_likes (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id      UUID         NOT NULL REFERENCES community_members(id) ON DELETE CASCADE,
  likeable_type  VARCHAR(20)  NOT NULL,
  likeable_id    UUID         NOT NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_community_likes_type CHECK (likeable_type IN ('post', 'comment')),
  CONSTRAINT uq_community_likes_member_target UNIQUE (member_id, likeable_type, likeable_id)
);

CREATE INDEX IF NOT EXISTS idx_community_likes_target ON community_likes (likeable_type, likeable_id);

-- ── 5. community_leaderboard_entries ─────────────────────────────────────────
-- One row per (member, period). Recomputed/upserted on a schedule — the
-- unique constraint makes re-running that computation idempotent.
CREATE TABLE IF NOT EXISTS community_leaderboard_entries (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id      UUID         NOT NULL REFERENCES community_members(id) ON DELETE CASCADE,
  period         VARCHAR(10)  NOT NULL,
  points         INTEGER      NOT NULL DEFAULT 0,
  rank_snapshot  INTEGER,
  computed_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_community_leaderboard_period CHECK (period IN ('7d', '30d', 'all_time')),
  CONSTRAINT uq_community_leaderboard_member_period UNIQUE (member_id, period)
);

CREATE INDEX IF NOT EXISTS idx_community_leaderboard_period_points ON community_leaderboard_entries (period, points);

-- ── 6. community_events ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_events (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id      UUID         NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  title          VARCHAR(255) NOT NULL,
  description    TEXT,
  event_type     VARCHAR(20)  NOT NULL DEFAULT 'session',
  starts_at      TIMESTAMPTZ  NOT NULL,
  ends_at        TIMESTAMPTZ,
  location_url   VARCHAR(500),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_community_events_type CHECK (event_type IN ('session', 'open_house', 'office_hours', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_community_events_cohort_id ON community_events (cohort_id);
CREATE INDEX IF NOT EXISTS idx_community_events_starts_at ON community_events (starts_at);

COMMIT;
