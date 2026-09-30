/**
 * ensureProjectApprovalSchema — adds the columns behind "review your project,
 * then approve it".
 *
 * WHAT THIS IS
 * ------------
 * A newly built project can be held in a `pending_approval` state so the student
 * reviews the whole build (what it does, the Command Center, the releases and
 * stories, the requirements) and either APPROVES it or asks for changes before
 * the build workspace unlocks. These columns carry that state.
 *
 * Additive only: four nullable columns and one partial index. No column is
 * altered or dropped, and there is deliberately NO DEFAULT on `approval_state`.
 * A default of 'pending_approval' would stamp every existing project as
 * un-approved at the moment of deploy and gate every current student out of
 * their own in-flight work — the one mistake in this file that would be
 * catastrophic and silent. NULL means "legacy / never gated", and the whole
 * feature treats NULL exactly as it treats 'approved': not gated. A project only
 * ever becomes 'pending_approval' by a publish that ran while the gate was
 * switched on for that enrollment (see projectApprovalService.markProjectPendingApproval).
 */
import { sequelize } from '../config/database';

export const REQUIRED_COLUMNS: ReadonlyArray<{ table: string; column: string }> = [
  { table: 'projects', column: 'approval_state' },
  { table: 'projects', column: 'approved_at' },
  { table: 'projects', column: 'approved_by' },
  { table: 'projects', column: 'approval_notes' },
  { table: 'projects', column: 'approval_updated_at' },
];

export const REQUIRED_INDEXES: ReadonlyArray<string> = [
  'idx_projects_pending_approval',
];

export async function ensureProjectApprovalSchema(): Promise<void> {
  const statements: string[] = [
    // The state itself. TEXT not a Postgres ENUM on purpose: the value set is
    // small and may grow (a future 'auto_approved'), and adding a value to a PG
    // enum is a migration of its own, whereas TEXT + an app-level union is not.
    // No default (see the header) — NULL is "never gated".
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS approval_state TEXT`,
    // When the student approved, and which enrollment did it (it is their own
    // project, so this is the student themselves; recorded for the audit trail).
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS approved_by TEXT`,
    // What the student said was wrong when they asked for changes. Free text,
    // shown back to whoever revises the build.
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS approval_notes TEXT`,
    // When the approval state last changed, for ordering an admin "awaiting
    // approval" view and for telling a stale 'pending' from a fresh one.
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS approval_updated_at TIMESTAMPTZ`,

    // The only query that scans BY this column is "which of my projects are
    // waiting on me" (and, later, an admin roll-up). A partial index keeps it to
    // the few rows actually pending rather than the whole table.
    `CREATE INDEX IF NOT EXISTS idx_projects_pending_approval
       ON projects (enrollment_id) WHERE approval_state = 'pending_approval'`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] project approval schema stmt skipped:', err?.message);
    }
  }
  await assertProjectApprovalSchema();
}

/**
 * Post-condition check, because the loop above is warn-only.
 *
 * If `approval_state` is missing but the code that reads it has shipped, the
 * project tree DTO would throw and 500 the student's project page. Better to say
 * so loudly at boot than to discover it from a student.
 */
export async function assertProjectApprovalSchema(): Promise<boolean> {
  const problems: string[] = [];
  try {
    const [cols] = await sequelize.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'projects'
          AND column_name = ANY($names)`,
      { bind: { names: REQUIRED_COLUMNS.map((c) => c.column) } },
    );
    const have = new Set((cols as { column_name: string }[]).map((r) => r.column_name));
    for (const { column } of REQUIRED_COLUMNS) if (!have.has(column)) problems.push(`projects.${column} missing`);

    const [idx] = await sequelize.query(
      `SELECT indexname FROM pg_indexes
        WHERE tablename = 'projects' AND indexname = ANY($names)`,
      { bind: { names: [...REQUIRED_INDEXES] } },
    );
    const found = new Set((idx as { indexname: string }[]).map((r) => r.indexname));
    for (const name of REQUIRED_INDEXES) if (!found.has(name)) problems.push(`index ${name} missing`);
  } catch (err: any) {
    problems.push(`schema introspection failed: ${err?.message}`);
  }

  if (problems.length === 0) {
    console.log('[DB] project approval schema ensured');
    return true;
  }
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    service: 'backend',
    event: 'project_approval_schema_invariant_violated',
    outcome: 'failure',
    error_class: 'SchemaInvariantViolation',
    context: {
      problems,
      impact: 'Student project review/approve will fail; project tree reads may 500.',
      remedy: 'Run the ALTER TABLE projects ADD COLUMN statements in ensureProjectApprovalSchema and recreate the index.',
    },
  }));
  return false;
}
