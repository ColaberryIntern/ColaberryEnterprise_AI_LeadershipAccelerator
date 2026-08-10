-- ============================================================================
-- Student Build Pipeline — production migration
-- Session CC-20260809-b7k2 · 2026-08-10 · PR #1315
--
-- Applies two changes:
--   1. NEW  build_intake + build_plans        (SBP-REQ-v1 FR-001, FR-004/013)
--   2. ALTER github_connections               (SBP-GH-v1 §4.1, FR-037)
--
-- ADDITIVE AND WIDENING ONLY. No table is dropped, no column is dropped, no row
-- is modified. The one removal is a UNIQUE constraint, which only ever permits
-- more than it did before — nothing that was valid becomes invalid.
--
-- The application also applies all of this at boot via ensureSbpSchema() and
-- ensureWorkspaceRepoSchema(), both idempotent. Running this by hand first is
-- for operators who want the change visible and verified before the deploy,
-- rather than discovered in a boot log.
-- ============================================================================

-- ── PRECONDITIONS — run first, read the output, do not proceed on a surprise ──
--
--   Expected on production as of 2026-08-10:
--     build_intake / build_plans .................. absent (0)
--     github_connections.project_id ............... absent (0)
--     github_connections_enrollment_id_key ........ present as a CONSTRAINT (1)
--     github_connections rows ..................... 11
--     ...of which real workspace repos ............ 0   <-- must be 0
--
--   That last line is the one that matters. It is why no project_id backfill is
--   needed. If it is NOT 0, STOP: some connection is a real student repo and
--   must be assigned a project before the unique index goes on.
--
-- SELECT
--   (SELECT count(*) FROM information_schema.tables
--     WHERE table_schema='public' AND table_name IN ('build_intake','build_plans')) AS new_tables,
--   (SELECT count(*) FROM information_schema.columns
--     WHERE table_name='github_connections' AND column_name='project_id') AS has_project_col,
--   (SELECT count(*) FROM pg_constraint
--     WHERE conrelid='github_connections'::regclass AND contype='u'
--       AND conname='github_connections_enrollment_id_key') AS old_unique_constraint,
--   (SELECT count(*) FROM github_connections) AS connection_rows,
--   (SELECT count(*) FROM github_connections
--     WHERE repo_owner='ColaberryIntern' AND repo_name LIKE 'student-workspace-%') AS real_workspace_repos;

BEGIN;

-- ── 1. build_intake — the wizard's answers, kept before generation runs ──────
CREATE TABLE IF NOT EXISTS build_intake (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  enrollment_id UUID REFERENCES enrollments(id),
  idea TEXT NOT NULL,
  name VARCHAR(200),
  size VARCHAR(30) NOT NULL DEFAULT 'project',
  users TEXT,
  data_sources TEXT,
  done_definition TEXT,
  target_weeks INTEGER,
  correlation_id UUID,
  status VARCHAR(30) NOT NULL DEFAULT 'captured',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS build_intake_unique_project ON build_intake (project_id);
CREATE INDEX IF NOT EXISTS idx_build_intake_enrollment ON build_intake (enrollment_id);
CREATE INDEX IF NOT EXISTS idx_build_intake_status ON build_intake (status);

-- ── 2. build_plans — so the reviewed plan is the plan that ships ─────────────
CREATE TABLE IF NOT EXISTS build_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  version INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  plan_json JSONB NOT NULL,
  plan_sha256 VARCHAR(64) NOT NULL,
  gate_ok BOOLEAN NOT NULL DEFAULT FALSE,
  gate_violations JSONB,
  model VARCHAR(80),
  attempts INTEGER,
  correlation_id UUID,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS build_plans_unique_project_version ON build_plans (project_id, version);
CREATE INDEX IF NOT EXISTS idx_build_plans_project ON build_plans (project_id);
CREATE INDEX IF NOT EXISTS idx_build_plans_status ON build_plans (status);

-- ── 3. github_connections — one repo per PROJECT, not per student ────────────
ALTER TABLE github_connections ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);

-- ORDER MATTERS. `github_connections_enrollment_id_key` is a CONSTRAINT backed
-- by an index of the same name (verified on prod and dev1, 2026-08-10). Postgres
-- refuses DROP INDEX on a constraint-backed index — that exact mistake shipped
-- earlier in this workstream, failed inside a warn-only loop, and the fix did
-- nothing. Dropping the constraint removes its index too; the bare DROP INDEX
-- below is only for a database where it exists without a constraint.
ALTER TABLE github_connections DROP CONSTRAINT IF EXISTS github_connections_enrollment_id_key;
DROP INDEX IF EXISTS github_connections_enrollment_id_key;

-- enrollment_id is still how access is scoped to an owner — indexed, not unique.
CREATE INDEX IF NOT EXISTS idx_github_connections_enrollment ON github_connections (enrollment_id);

-- Partial: existing rows carry a NULL project_id and several NULLs must not collide.
CREATE UNIQUE INDEX IF NOT EXISTS github_connections_unique_project
  ON github_connections (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_github_connections_project ON github_connections (project_id);

COMMIT;

-- ── POST-CONDITION — run after, and read it. Do not trust a clean exit. ──────
--
--   Expected: new_tables=2, has_project_col=1, old_unique_constraint=0, new_unique=1
--
-- SELECT
--   (SELECT count(*) FROM information_schema.tables
--     WHERE table_schema='public' AND table_name IN ('build_intake','build_plans')) AS new_tables,
--   (SELECT count(*) FROM information_schema.columns
--     WHERE table_name='github_connections' AND column_name='project_id') AS has_project_col,
--   (SELECT count(*) FROM pg_constraint
--     WHERE conrelid='github_connections'::regclass AND contype='u'
--       AND conname='github_connections_enrollment_id_key') AS old_unique_constraint,
--   (SELECT count(*) FROM pg_indexes
--     WHERE tablename='github_connections' AND indexname='github_connections_unique_project') AS new_unique;
