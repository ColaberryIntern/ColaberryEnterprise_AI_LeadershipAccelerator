import { sequelize } from '../config/database';

/**
 * ensurePlatformBuildSchema - the two tables behind the platform-built Command Center and Demo.
 *
 * L13.1. The platform, not the student's repo, now owns the Command Center and the Connected
 * Demo: a runner builds them right after a plan is published, the platform stores every built
 * version, and serves the active one. Two tables, both NEW, nothing existing is altered:
 *
 *   platform_build_runs       one row per build attempt. The state machine the runner moves
 *                             through (queued -> dispatched -> building -> uploaded | failed).
 *   platform_build_artifacts  one row per built version of one kind (command_center | demo).
 *                             Exactly one ACTIVE row per (project, kind), enforced by a partial
 *                             unique index rather than by application code, so two concurrent
 *                             uploads can never both win. Versions are never deleted: L13.2's
 *                             Restore makes a new version, it does not rewrite an old one.
 *
 * ## Idempotency
 *
 * `uq_platform_build_runs_live` allows at most ONE in-flight-or-done run per project. A second
 * publish of the same project inserts nothing (`ON CONFLICT DO NOTHING` in the run store), so a
 * republish, a retried publish or two tabs pressing Publish never start two paid agent runs.
 * A FAILED run is outside the index, which is what lets the next publish try again.
 *
 * Every statement is IF NOT EXISTS, and like ensureConnectedDemoSchema this REJECTS on failure
 * so the boot log carries the cause, not a silent half-applied schema.
 */

export const PLATFORM_BUILD_TABLES: ReadonlyArray<string> = [
  'platform_build_runs',
  'platform_build_artifacts',
];

const STATEMENTS: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS platform_build_runs (
     id UUID PRIMARY KEY,
     project_id UUID NOT NULL,
     enrollment_id UUID,
     plan_version INTEGER NOT NULL,
     plan_sha256 TEXT NOT NULL,
     status TEXT NOT NULL CHECK (status IN ('queued','dispatched','building','uploaded','failed')),
     error_class TEXT,
     error_detail TEXT,
     cost_usd NUMERIC(10,4),
     correlation_id TEXT,
     dispatched_at TIMESTAMPTZ,
     started_at TIMESTAMPTZ,
     completed_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS ix_platform_build_runs_project ON platform_build_runs (project_id, created_at DESC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_build_runs_live
     ON platform_build_runs (project_id) WHERE status <> 'failed'`,
  `CREATE TABLE IF NOT EXISTS platform_build_artifacts (
     id UUID PRIMARY KEY,
     project_id UUID NOT NULL,
     kind TEXT NOT NULL CHECK (kind IN ('command_center','demo')),
     version INTEGER NOT NULL,
     run_id UUID,
     plan_version INTEGER,
     files JSONB NOT NULL,
     bytes INTEGER NOT NULL,
     status TEXT NOT NULL CHECK (status IN ('active','superseded')),
     created_by TEXT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_build_artifacts_version
     ON platform_build_artifacts (project_id, kind, version)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_build_artifacts_active
     ON platform_build_artifacts (project_id, kind) WHERE status = 'active'`,
];

export class PlatformBuildSchemaError extends Error {
  readonly name = 'PlatformBuildSchemaError';

  readonly error_class = 'PlatformBuildSchemaUnavailable';
}

/** The tables that are missing. Empty when the schema is complete. */
export async function assertPlatformBuildSchema(): Promise<string[]> {
  const selects = PLATFORM_BUILD_TABLES
    .map((t, i) => `bool_or(table_name = '${t}') AS t${i}`)
    .join(', ');
  const [rows] = await sequelize.query(
    `SELECT ${selects} FROM information_schema.tables WHERE table_schema = 'public'`,
  );
  const row = (((rows as unknown[]) || [])[0] || {}) as Record<string, boolean>;
  return PLATFORM_BUILD_TABLES.filter((_, i) => !row[`t${i}`]);
}

export async function ensurePlatformBuildSchema(): Promise<void> {
  for (const sql of STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new PlatformBuildSchemaError(`platform build schema statement failed: ${message}`);
    }
  }
  const missing = await assertPlatformBuildSchema();
  if (missing.length) {
    throw new PlatformBuildSchemaError(`platform build schema incomplete after apply: ${missing.join(', ')} missing`);
  }
}
