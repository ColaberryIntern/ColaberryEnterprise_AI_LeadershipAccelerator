BEGIN;

-- Public shareable portfolio (BC #9985689951). share_token is a stable,
-- opaque token generated once when a student opts in to sharing;
-- share_enabled lets them revoke access without losing/regenerating the link.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS share_token VARCHAR(64);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS share_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_share_token ON projects (share_token);

COMMIT;
