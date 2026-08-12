import { sequelize } from '../config/database';

/**
 * Student Build Pipeline (SBP) schema — `build_intake` and `build_plans`.
 *
 * Ensured via idempotent raw SQL rather than `sequelize.sync({ alter: true })`,
 * matching ensureWorkLedgerSchema/ensureInboxCaseSchema. Additive only: two new
 * tables, nothing existing is altered or dropped.
 *
 * `build_intake` (SBP-REQ-v1 FR-001) stores the student's answers BEFORE any
 * generation runs, so a failed or interrupted generation is replayable and a
 * provisioning failure can park the project in `awaiting_repo` without losing
 * the idea. Today the wizard discards all of this client-side.
 *
 * `build_plans` (FR-013 / plan task T4) stores a generated plan keyed on
 * (project_id, version). It exists so the plan a human REVIEWS is byte-identical
 * to the plan that gets persisted — currently the dry run and the commit each
 * call the model independently, which is how a reviewed 6/3/1/1/1 plan shipped
 * as 8/1/1/1/1.
 *
 * POST-CONDITION ASSERTION (see below): every statement here is best-effort and
 * only warns on failure, so "it didn't throw" is NOT evidence the schema landed.
 * Earlier in this workstream a `DROP INDEX` failed silently against a
 * constraint-backed index inside exactly this kind of loop and the fix shipped
 * green having done nothing. This function verifies its own outcome against the
 * catalog and logs a structured SchemaInvariantViolation if it did not.
 */
export async function ensureSbpSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS build_intake (
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
     )`,
    // One live intake per project: re-submitting the wizard updates rather than
    // stacking rows, so the "same intake twice returns the same build" guarantee
    // (FR-001 idempotency) has something to key on.
    // The adaptive interview's Q&A. Added after the fixed users/data_sources/
    // done_definition columns, which only ever fit the three hardcoded questions
    // the wizard used to ask; those stay for older clients and existing rows.
    `ALTER TABLE build_intake ADD COLUMN IF NOT EXISTS answers JSONB`,
    `CREATE UNIQUE INDEX IF NOT EXISTS build_intake_unique_project ON build_intake (project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_build_intake_enrollment ON build_intake (enrollment_id)`,
    `CREATE INDEX IF NOT EXISTS idx_build_intake_status ON build_intake (status)`,

    `CREATE TABLE IF NOT EXISTS build_plans (
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
     )`,
    // Versions are immutable once written (FR-004): a regeneration is a new
    // version, never an overwrite.
    `CREATE UNIQUE INDEX IF NOT EXISTS build_plans_unique_project_version ON build_plans (project_id, version)`,
    `CREATE INDEX IF NOT EXISTS idx_build_plans_project ON build_plans (project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_build_plans_status ON build_plans (status)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] sbp schema stmt skipped:', err?.message);
    }
  }

  await assertSbpSchema();
}

/** What ensureSbpSchema must have produced. Checked, not assumed. */
const REQUIRED_TABLES = ['build_intake', 'build_plans'] as const;
const REQUIRED_INDEXES = [
  'build_intake_unique_project',
  'build_plans_unique_project_version',
] as const;

/**
 * Verify the post-condition against the catalog and report loudly if it is not
 * met. Exported so a test can prove the assertion actually fires against an
 * un-migrated database — an assertion nobody has seen fail is not an assertion.
 */
export async function assertSbpSchema(): Promise<{ ok: boolean; missing: string[] }> {
  const missing: string[] = [];
  try {
    const [rows]: any = await sequelize.query(
      `SELECT
         (SELECT array_agg(table_name) FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = ANY($tables)) AS tables,
         (SELECT array_agg(indexname) FROM pg_indexes
           WHERE schemaname = 'public' AND indexname = ANY($indexes)) AS indexes`,
      { bind: { tables: [...REQUIRED_TABLES], indexes: [...REQUIRED_INDEXES] } },
    );
    const foundTables: string[] = rows?.[0]?.tables ?? [];
    const foundIndexes: string[] = rows?.[0]?.indexes ?? [];
    for (const t of REQUIRED_TABLES) if (!foundTables.includes(t)) missing.push(`table:${t}`);
    for (const i of REQUIRED_INDEXES) if (!foundIndexes.includes(i)) missing.push(`index:${i}`);
  } catch (err: any) {
    console.warn('[DB] sbp schema post-check could not run:', err?.message);
    return { ok: false, missing: ['post-check-failed'] };
  }

  if (missing.length > 0) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event: 'sbp_schema_incomplete',
      outcome: 'failure',
      error_class: 'SchemaInvariantViolation',
      context: {
        missing,
        impact: 'build intake cannot be persisted, so a failed generation is not replayable and the reviewed plan is not the plan that ships',
        remedy: 'inspect the [DB] sbp schema stmt skipped warnings above; the CREATE statements are idempotent and safe to re-run',
      },
    }));
    return { ok: false, missing };
  }

  console.log('[DB] SBP schema ensured (build_intake, build_plans)');
  return { ok: true, missing: [] };
}
