import { sequelize } from '../config/database';

/**
 * Re-key workspace repos from enrollments to PROJECTS (SBP-GH-v1 §4.1, FR-037).
 *
 * Decided by Ali 2026-08-09: one repo per project, not one per student.
 * Multi-project is a platform capability, and several plans sharing one `docs/`
 * folder would collide on REQUIREMENTS.md the moment a student starts a second
 * build.
 *
 * The blocker is in the schema: `github_connections.enrollment_id` is UNIQUE,
 * which structurally forbids a second repo for the same student. That uniqueness
 * drops to a plain index (still needed to scope access by owner) and
 * `UNIQUE (project_id)` takes its place.
 *
 * WHY BOTH DROP CONSTRAINT AND DROP INDEX: verified against both live databases
 * on 2026-08-10, `github_connections_enrollment_id_key` is a CONSTRAINT
 * (pg_constraint.contype = 'u') backed by an index of the same name. Postgres
 * refuses `DROP INDEX` on a constraint-backed index — that exact mistake shipped
 * earlier in this workstream, failed silently inside a warn-only loop, and the
 * "fix" did nothing. Dropping the constraint removes its index too; the bare
 * `DROP INDEX` is for any database where it exists without a constraint.
 *
 * Migration is clean: production holds 11 rows and ZERO are real
 * platform-provisioned workspace repos (none match ColaberryIntern/
 * student-workspace-%), so no row needs a project_id backfilled.
 */
export async function ensureWorkspaceRepoSchema(): Promise<void> {
  const statements: string[] = [
    `ALTER TABLE github_connections ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id)`,

    // Order matters: the constraint owns the index, so this must come first.
    `ALTER TABLE github_connections DROP CONSTRAINT IF EXISTS github_connections_enrollment_id_key`,
    `DROP INDEX IF EXISTS github_connections_enrollment_id_key`,

    // enrollment_id is still how access is scoped to an owner — keep it indexed,
    // just not unique.
    `CREATE INDEX IF NOT EXISTS idx_github_connections_enrollment ON github_connections (enrollment_id)`,

    // Partial: existing rows carry a NULL project_id until they are re-keyed or
    // retired, and several NULLs must not collide.
    `CREATE UNIQUE INDEX IF NOT EXISTS github_connections_unique_project
       ON github_connections (project_id) WHERE project_id IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_github_connections_project ON github_connections (project_id)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] workspace-repo schema stmt skipped:', err?.message);
    }
  }

  await assertWorkspaceRepoSchema();
}

export interface SchemaAssertion {
  ok: boolean;
  /** Human-readable list of what is wrong, empty when ok. */
  problems: string[];
}

/**
 * Verify the post-condition against the catalog. Exported so a test can prove it
 * FIRES — an assertion nobody has watched fail is not an assertion, which is the
 * lesson from the silent DROP INDEX.
 */
export async function assertWorkspaceRepoSchema(): Promise<SchemaAssertion> {
  const problems: string[] = [];
  try {
    const [rows]: any = await sequelize.query(
      `SELECT
         (SELECT count(*) FROM information_schema.columns
           WHERE table_name = 'github_connections' AND column_name = 'project_id') AS has_project_col,
         (SELECT count(*) FROM pg_constraint
           WHERE conrelid = 'github_connections'::regclass
             AND contype = 'u'
             AND conname = 'github_connections_enrollment_id_key') AS old_constraint,
         (SELECT count(*) FROM pg_indexes
           WHERE tablename = 'github_connections'
             AND indexname = 'github_connections_enrollment_id_key') AS old_index,
         (SELECT count(*) FROM pg_indexes
           WHERE tablename = 'github_connections'
             AND indexname = 'github_connections_unique_project') AS new_unique`,
    );
    const r = rows?.[0] ?? {};
    if (Number(r.has_project_col ?? 0) === 0) problems.push('project_id column is missing');
    if (Number(r.old_constraint ?? 0) > 0) problems.push('UNIQUE constraint on enrollment_id still present — a student cannot own two project repos');
    if (Number(r.old_index ?? 0) > 0) problems.push('unique index on enrollment_id still present');
    if (Number(r.new_unique ?? 0) === 0) problems.push('unique index on project_id is missing — two repos could claim one project');
  } catch (err: any) {
    console.warn('[DB] workspace-repo schema post-check could not run:', err?.message);
    return { ok: false, problems: ['post-check-failed'] };
  }

  if (problems.length > 0) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event: 'workspace_repo_schema_incomplete',
      outcome: 'failure',
      error_class: 'SchemaInvariantViolation',
      context: {
        problems,
        impact: 'one-repo-per-project cannot be enforced; provisioning a second project repo will fail or collide',
        remedy: "ALTER TABLE github_connections DROP CONSTRAINT IF EXISTS github_connections_enrollment_id_key",
      },
    }));
    return { ok: false, problems };
  }

  console.log('[DB] workspace repo schema ensured (project-keyed)');
  return { ok: true, problems: [] };
}
