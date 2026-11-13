/**
 * ensureProjectArchiveAuditSchema - who archived a project, and why. Additive.
 *
 * `projects.archived_at` already exists (ensureProjectArchiveSchema) and carries WHEN. That was
 * enough while archiving was student-only: the owner archived their own build and the enrollment
 * answered "who". It stops being enough the moment an admin can archive somebody else's project,
 * because then "this project vanished" has no answer at all, and a removal nobody can explain six
 * weeks later is indistinguishable from data loss.
 *
 * AN ALTER, NOT A COLUMN IN A CREATE BLOCK. `CREATE TABLE IF NOT EXISTS` is a no-op against a
 * table that already exists, so a column added to ensureProjectArchiveSchema's create block would
 * ship green, resolve identically, and be absent in every environment that already has `projects`
 * - which is all of them. The same warning is written at ensureCaseStudyStoryAssets.ts:25,
 * ensureCaseStudySchema.ts:140 and ensureAgentToolGrantSchema.ts:87. It is in its own file for
 * exactly that reason.
 *
 * NO DEFAULT on either column, deliberately. A default would stamp every project that was ever
 * archived before this shipped with a value nobody recorded, and an invented audit trail is worse
 * than an absent one. NULL here means "archived before this column existed, or archived by the
 * student themselves", and both are true things to be able to say.
 */
import { sequelize } from '../config/database';

export const REQUIRED_COLUMNS: ReadonlyArray<string> = ['archived_by', 'archived_reason'];

export const PROJECT_ARCHIVE_AUDIT_STATEMENTS: ReadonlyArray<string> = [
  // 160 chars: long enough for "admin:ali@colaberry.com", short enough that nobody writes prose.
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_by VARCHAR(160)`,
  // 200 chars. A reason is a sentence, not a report; the report belongs on the ticket.
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_reason VARCHAR(200)`,
];

export async function ensureProjectArchiveAuditSchema(): Promise<void> {
  for (const sql of PROJECT_ARCHIVE_AUDIT_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] project archive audit stmt skipped:', err?.message);
    }
  }
  await assertProjectArchiveAuditSchema();
}

/**
 * Post-condition. Every statement above is swallowed into a console.warn, so this is the only
 * thing that proves the columns landed - the lesson recorded against ensureSbpSchema, where a
 * loop that warned on each failure resolved identically on total success and total failure.
 */
export async function assertProjectArchiveAuditSchema(): Promise<boolean> {
  const problems: string[] = [];
  try {
    const selects = REQUIRED_COLUMNS.map((c, i) => `bool_or(column_name = '${c}') AS c${i}`).join(', ');
    const [rows] = await sequelize.query(
      `SELECT ${selects} FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'projects'`,
    );
    const row = (((rows as any[]) || [])[0] || {}) as Record<string, boolean>;
    REQUIRED_COLUMNS.forEach((c, i) => { if (!row[`c${i}`]) problems.push(`projects.${c} missing`); });
  } catch (err: any) {
    problems.push(`schema introspection failed: ${err?.message}`);
  }

  if (problems.length === 0) {
    console.log('[DB] project archive audit schema ensured');
    return true;
  }
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    service: 'backend',
    event: 'schema_invariant_violation',
    outcome: 'failure',
    error_class: 'SchemaInvariantViolation',
    context: { schema: 'projects.archived_by/archived_reason', problems },
  }));
  return false;
}
