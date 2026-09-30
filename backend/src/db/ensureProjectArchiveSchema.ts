/**
 * ensureProjectArchiveSchema — adds the soft-delete column that lets a student
 * remove their own project without destroying it.
 *
 * WHY ARCHIVE AND NOT DELETE
 * --------------------------
 * `student_task_lists.project_id` and `student_tasks.project_id` are both
 * `ON DELETE CASCADE` (see `seeds/seedStudentTasks.ts:13,33`). A hard
 * `DELETE FROM projects` therefore takes the student's task tree with it —
 * including tasks carrying `verified_at`, which is the latch the platform's XP
 * award is keyed against. `evidence_records` rows survive (they are
 * enrollment-scoped and have no `project_id`), but the ONLY path from an
 * evidence row back to the story that earned it runs through
 * `student_tasks.story_id` + `verified_ref` — see
 * `projectReadService.verifiedStoryXp`. Cascade away the tasks and the award
 * rows are still in the table but no longer reachable: the points stop being
 * attributable to anything.
 *
 * A soft delete keeps every row exactly where it is and changes one timestamp.
 * Nothing cascades, nothing is orphaned, and restore is a second UPDATE.
 *
 * Additive only: one nullable column and two indexes. No column is altered or
 * dropped, and there is deliberately NO DEFAULT — a default would stamp every
 * existing project as archived at the moment of deploy, which is the one
 * mistake in this file that would be catastrophic and silent.
 */
import { sequelize } from '../config/database';

export const REQUIRED_COLUMNS: ReadonlyArray<{ table: string; column: string }> = [
  { table: 'projects', column: 'archived_at' },
];

export const REQUIRED_INDEXES: ReadonlyArray<string> = [
  'idx_projects_enrollment_live',
  'idx_projects_archived_at',
];

export async function ensureProjectArchiveSchema(): Promise<void> {
  const statements: string[] = [
    // Nullable, no default. NULL means "live"; a timestamp means "archived, at
    // this moment". A boolean would have told us the state but never the when,
    // and "when did this leave my list" is the first question on a restore.
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`,

    // The hot path is "the live projects on this enrollment", which every
    // listing and every active-project fallback runs. A partial index keeps the
    // archived rows out of it entirely.
    `CREATE INDEX IF NOT EXISTS idx_projects_enrollment_live
       ON projects (enrollment_id) WHERE archived_at IS NULL`,

    // For the reverse question — "what has this student archived" — which the
    // restore surface asks.
    `CREATE INDEX IF NOT EXISTS idx_projects_archived_at
       ON projects (archived_at) WHERE archived_at IS NOT NULL`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] project archive schema stmt skipped:', err?.message);
    }
  }
  await assertProjectArchiveSchema();
}

/**
 * Post-condition check, because the loop above is warn-only.
 *
 * This exists for one specific failure: if `archived_at` is missing but the code
 * that filters on it has shipped, every query in `projectService` that says
 * `archived_at IS NULL` throws, and the student's Projects page returns 500 —
 * a total outage of the surface, from a silently skipped ALTER. Better to say so
 * loudly at boot than to discover it from a student.
 */
export async function assertProjectArchiveSchema(): Promise<boolean> {
  const problems: string[] = [];
  try {
    const [cols] = await sequelize.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'projects' AND column_name = 'archived_at'`,
    );
    if ((cols as unknown[]).length === 0) problems.push('projects.archived_at missing');

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
    console.log('[DB] project archive schema ensured');
    return true;
  }
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    service: 'backend',
    event: 'project_archive_schema_invariant_violated',
    outcome: 'failure',
    error_class: 'SchemaInvariantViolation',
    context: {
      problems,
      impact: 'Student project listing and archive/restore will fail; archived projects may reappear.',
      remedy: 'Run ALTER TABLE projects ADD COLUMN archived_at TIMESTAMPTZ and recreate the two indexes.',
    },
  }));
  return false;
}
