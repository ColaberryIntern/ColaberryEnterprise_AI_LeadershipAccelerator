-- Allow 'like' community notifications (Ali feedback 2026-07-20).
-- notification_type is VARCHAR(20) + a CHECK constraint (not a PG enum), so we
-- swap the CHECK to add 'like'. Idempotent: DROP IF EXISTS + re-ADD.
BEGIN;
ALTER TABLE community_notifications DROP CONSTRAINT IF EXISTS ck_community_notifications_type;
ALTER TABLE community_notifications
  ADD CONSTRAINT ck_community_notifications_type
  CHECK (notification_type IN ('mention', 'reply', 'like'));
COMMIT;
