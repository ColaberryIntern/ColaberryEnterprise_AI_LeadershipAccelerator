-- Epic 4 — Calendar/events + notifications (in-app/email) + digest
-- (BC #9985689758 / REQ-C6).
BEGIN;

CREATE TABLE IF NOT EXISTS community_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES community_members(id) ON DELETE CASCADE,
  actor_member_id UUID REFERENCES community_members(id) ON DELETE SET NULL,
  notification_type VARCHAR(20) NOT NULL,
  source_type VARCHAR(20) NOT NULL,
  source_id UUID NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_community_notifications_type CHECK (notification_type IN ('mention', 'reply'))
);

CREATE INDEX IF NOT EXISTS idx_community_notifications_member_created
  ON community_notifications (member_id, created_at DESC);

-- One digest per member per calendar date — the idempotency mechanism that
-- makes re-running the daily digest job safe (find-or-create this row BEFORE
-- sending; an existing row means today's digest already went out).
CREATE TABLE IF NOT EXISTS community_digest_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES community_members(id) ON DELETE CASCADE,
  digest_date DATE NOT NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_community_digest_logs_member_date UNIQUE (member_id, digest_date)
);

COMMIT;
