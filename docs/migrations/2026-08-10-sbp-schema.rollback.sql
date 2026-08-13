-- ============================================================================
-- ROLLBACK for 2026-08-10-sbp-schema.sql
-- Session CC-20260809-b7k2
--
-- Restores the catalog to its pre-migration state. Rehearsed against a scratch
-- database before the migration was proposed — see docs/migrations/REHEARSAL.md.
--
-- SAFE TO RUN ONLY WHILE THESE HOLD:
--   * No enrollment owns TWO workspace repos. Re-adding UNIQUE (enrollment_id)
--     fails if any does. Check first — the query is below.
--   * You accept losing build_intake and build_plans contents. They are
--     regenerable (intake is re-enterable, plans are re-derivable), but they are
--     NOT backed up by this script.
--
-- If the application is still running the new code, it will simply re-apply the
-- migration at next boot via ensureSbpSchema()/ensureWorkspaceRepoSchema().
-- Roll the CODE back first, or the schema comes straight back.
-- ============================================================================

-- ── PRECONDITION — must return 0 rows, or the rollback will fail ─────────────
--
-- SELECT enrollment_id, count(*)
--   FROM github_connections
--  GROUP BY enrollment_id
--  HAVING count(*) > 1;

BEGIN;

-- ── 1. github_connections back to enrollment-keyed ───────────────────────────
DROP INDEX IF EXISTS github_connections_unique_project;
DROP INDEX IF EXISTS idx_github_connections_project;
DROP INDEX IF EXISTS idx_github_connections_enrollment;

-- Restores the original constraint (which brings its backing index with it).
-- Fails loudly if a duplicate enrollment_id exists — that is correct: it means
-- the one-repo-per-project feature is genuinely in use and rolling back would
-- lose data. Resolve the duplicates first, deliberately.
ALTER TABLE github_connections
  ADD CONSTRAINT github_connections_enrollment_id_key UNIQUE (enrollment_id);

-- The column is left in place on purpose. Dropping it would discard the
-- project↔repo mapping for any repo already provisioned under the new model,
-- and a nullable unused column costs nothing. Uncomment ONLY if you are certain
-- no repo was provisioned while the migration was live:
-- ALTER TABLE github_connections DROP COLUMN IF EXISTS project_id;

-- ── 2. drop the new tables ───────────────────────────────────────────────────
-- Order matters only in that both are leaves; nothing references them.
DROP TABLE IF EXISTS build_plans;
DROP TABLE IF EXISTS build_intake;

COMMIT;

-- ── POST-CONDITION — the catalog should match its pre-migration shape ────────
--
--   Expected: new_tables=0, old_unique_constraint=1, new_unique=0
--
-- SELECT
--   (SELECT count(*) FROM information_schema.tables
--     WHERE table_schema='public' AND table_name IN ('build_intake','build_plans')) AS new_tables,
--   (SELECT count(*) FROM pg_constraint
--     WHERE conrelid='github_connections'::regclass AND contype='u'
--       AND conname='github_connections_enrollment_id_key') AS old_unique_constraint,
--   (SELECT count(*) FROM pg_indexes
--     WHERE tablename='github_connections' AND indexname='github_connections_unique_project') AS new_unique;
