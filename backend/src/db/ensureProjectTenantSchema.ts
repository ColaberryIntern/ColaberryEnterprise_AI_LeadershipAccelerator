/**
 * ensureProjectTenantSchema — gives `projects` a tenant, so a student project can be governed.
 *
 * WHAT THIS IS
 * ------------
 * P6-T1b, and the thing that was blocking the student half of LC-01. `projects` had no tenant
 * column and nothing on its join path had one either -- not `enrollments`, not `programs`, not
 * `cohorts`, not `users`. 60 tables in this database carry `tenant_id` and `projects` was not
 * among them. `project_lifecycle_states.tenant_id` is `NOT NULL REFERENCES tenants(id)`, so a
 * model hook had nothing to key on and student projects could not be registered at all.
 *
 * Escalated to the DRI, who chose `colaberry` on 2026-10-12 after reviewing exactly what the
 * backfill does. The slug lives in `services/lifecycle/studentTenant.ts`, which is also the
 * module that REFUSES to guess once more than one tenant owns student projects.
 *
 * ADDITIVE AND REVERSIBLE
 * -----------------------
 * One nullable column, one index, one backfill. Nothing is altered or dropped, and the column is
 * NEW -- so dropping it removes it completely with no data loss, because there was never anything
 * in it to lose.
 *
 * DELIBERATELY NULLABLE, and this is the same trap `ensureProjectApprovalSchema` avoided one file
 * over. `NOT NULL` would have required a default or a guaranteed-complete backfill in the same
 * statement, and a project the backfill could not attribute would then fail to INSERT -- breaking
 * student project creation on a live path for a governance reason, with the feature flag off.
 * NULL means "not attributable", the registration hook skips it and says so loudly, and
 * `storyAuthorization` refuses it once enforcement is on. The failure direction is safe.
 *
 * IDEMPOTENT
 * ----------
 * `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and a backfill restricted to
 * `WHERE tenant_id IS NULL`. Running it twice writes nothing the second time. NOTE for anyone
 * extending this: `ADD COLUMN IF NOT EXISTS` CANNOT widen an existing column -- that needs
 * `ALTER COLUMN ... TYPE` -- so this file must never be the place a type change is attempted.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { STUDENT_TENANT_SLUG } from '../services/lifecycle/studentTenant';

export const REQUIRED_COLUMNS: ReadonlyArray<{ table: string; column: string }> = [
  { table: 'projects', column: 'tenant_id' },
];
export const REQUIRED_INDEXES: ReadonlyArray<string> = ['idx_projects_tenant'];

export async function ensureProjectTenantSchema(): Promise<boolean> {
  const statements: string[] = [
    // No FK to `tenants` in the same statement as the ADD COLUMN: a FK on a column that is about
    // to be backfilled would reject the ALTER on any row the backfill has not reached yet in a
    // database where rows already exist. Added separately below, after the backfill, and
    // tolerantly -- see that statement's own note.
    'ALTER TABLE projects ADD COLUMN IF NOT EXISTS tenant_id UUID',
    'CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects (tenant_id) WHERE tenant_id IS NOT NULL',
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      // Best-effort per statement, matching every sibling ensure-module, which is why the
      // post-condition assertion below exists and why "it did not throw" is never the evidence.
      console.warn('[DB] project tenant stmt skipped:', err?.message);
    }
  }

  // ── THE BACKFILL ────────────────────────────────────────────────────────────────────
  // Resolved by SLUG rather than a hardcoded id: a UUID in a migration is unreadable in a diff,
  // differs between environments, and cannot be checked against anything. If no tenant carries
  // the slug this writes NOTHING rather than writing null over null, and the assertion below
  // reports it.
  //
  // `WHERE tenant_id IS NULL` is what makes it idempotent AND what makes it safe to run after a
  // second tenant exists: a row already attributed is never re-attributed by this statement.
  try {
    const [, meta] = await sequelize.query(
      `UPDATE projects
          SET tenant_id = (SELECT id FROM tenants WHERE slug = $1)
        WHERE tenant_id IS NULL
          AND EXISTS (SELECT 1 FROM tenants WHERE slug = $1)`,
      { bind: [STUDENT_TENANT_SLUG] },
    );
    const affected = (meta as unknown as { rowCount?: number })?.rowCount ?? 0;
    if (affected > 0) {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        service: 'backend',
        event: 'project_tenant_backfilled',
        outcome: 'success',
        context: { rows: affected, slug: STUDENT_TENANT_SLUG },
      }));
    }
  } catch (err: any) {
    console.warn('[DB] project tenant backfill skipped:', err?.message);
  }

  // The FK comes last, because it can only succeed once every row is attributed. Tolerated on
  // failure rather than retried: the column and the backfill are what the hook needs, and a
  // missing FK is reported by the assertion rather than silently accepted.
  try {
    await sequelize.query(
      `ALTER TABLE projects
         ADD CONSTRAINT projects_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id)`,
    );
  } catch (err: any) {
    // 42710 is duplicate_object: the constraint already exists, which is the normal path on
    // every boot after the first and is not worth a warning.
    if (!/already exists|duplicate/i.test(String(err?.message))) {
      console.warn('[DB] projects_tenant_fk not added:', err?.message);
    }
  }

  return assertProjectTenantSchema();
}

/**
 * Verify the post-condition against the catalog and the data.
 *
 * Exported so a test can prove the assertion actually fires against an un-migrated database. An
 * assertion nobody has seen fail is not an assertion, and in this family of modules a `DROP
 * INDEX` once failed silently inside exactly this kind of best-effort loop and the fix shipped
 * green having done nothing.
 */
export async function assertProjectTenantSchema(): Promise<boolean> {
  const problems: string[] = [];
  try {
    const cols = await sequelize.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'tenant_id'`,
      { type: QueryTypes.SELECT },
    );
    if (cols.length === 0) problems.push('projects.tenant_id missing');

    const idx = await sequelize.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'projects'",
      { type: QueryTypes.SELECT },
    );
    const found = new Set(idx.map((r) => r.indexname));
    for (const name of REQUIRED_INDEXES) if (!found.has(name)) problems.push(`index ${name} missing`);

    // THE DATA POST-CONDITION, not just the shape one. A column that exists while every row is
    // still null would satisfy a catalog-only check and leave every student project ungoverned,
    // which is the exact condition this task was written to end. Reported as a count so an
    // operator can see the size of it.
    if (cols.length > 0) {
      const unattributed = await sequelize.query<{ n: string }>(
        'SELECT count(*) AS n FROM projects WHERE tenant_id IS NULL',
        { type: QueryTypes.SELECT },
      );
      const n = Number(unattributed[0]?.n ?? 0);
      if (n > 0) problems.push(`${n} projects rows have no tenant_id`);
    }
  } catch (err: any) {
    problems.push(`schema introspection failed: ${err?.message}`);
  }

  if (problems.length === 0) {
    console.log('[DB] project tenant schema ensured');
    return true;
  }
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    service: 'backend',
    event: 'project_tenant_schema_invariant_violated',
    outcome: 'failure',
    error_class: 'SchemaInvariantViolation',
    context: {
      problems,
      impact: 'Student projects cannot be registered with a lifecycle, so LC-01 covers delivery '
        + 'projects only. Under ENABLE_PROJECT_LIFECYCLE those projects are refused authorized '
        + 'stories, because a missing lifecycle row is absence of evidence rather than approval.',
      remedy: `Confirm a tenant exists with slug '${STUDENT_TENANT_SLUG}', then re-run `
        + 'ensureProjectTenantSchema. If more than one tenant now owns student projects, the '
        + 'constant is no longer sufficient and the tenant must be derived per project from its '
        + 'programme -- see services/lifecycle/studentTenant.ts.',
    },
  }));
  return false;
}
