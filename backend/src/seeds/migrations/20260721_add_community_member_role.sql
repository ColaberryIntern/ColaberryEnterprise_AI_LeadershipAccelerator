-- Community member role (student | mentor | staff) for the People directory.
-- Admin-assigned, default 'student'. The directory surfaces + filters by it.
-- Idempotent: ADD COLUMN IF NOT EXISTS + a guarded CHECK. Also applied at boot by
-- ensureCommunityMemberRoleSchema() in server.ts, so a deploy self-heals without
-- a manual step; this file is the record + a belt-and-suspenders manual apply.
BEGIN;
ALTER TABLE community_members ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'student';
ALTER TABLE community_members DROP CONSTRAINT IF EXISTS ck_community_members_role;
ALTER TABLE community_members
  ADD CONSTRAINT ck_community_members_role
  CHECK (role IN ('student', 'mentor', 'staff'));
COMMIT;
