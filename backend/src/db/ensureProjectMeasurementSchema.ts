import { sequelize } from '../config/database';

/**
 * Approved measurement definitions and the outcomes recorded against them —
 * `project_measurement_definitions` and `project_measurement_outcomes`.
 *
 * ── THE GAP THIS CLOSES ────────────────────────────────────────────────────
 *
 * `caseStudyFoundation.computeMaturity` can only ever return `story_hypothesis`,
 * `build_record` or `capability_demonstration`. The publish gate's `ruleMaturity`
 * refuses anything below `operational_result`. So no case study linked to a student
 * project has ever been publishable, and the database shows it: every live
 * publication is an unlinked `repo_collection`, and the one project-sourced record
 * created before this is still a draft.
 *
 * The foundation said why in one line of its own source:
 *
 *   "No approved measurement definitions exist, so nothing measured in use can be
 *    recorded as an outcome yet."
 *
 * These two tables are that missing thing.
 *
 * ── WHY THIS IS NOT BUILT ON `event.measurementEvents` ─────────────────────
 *
 * The obvious design is to merge the measurement events stories already report.
 * Measured 2026-11-03, that design would merge nothing: across all 15 projects
 * carrying enrichments, the total number of measurement events ever reported is
 * ZERO. The contract has the field, and `enrichmentPromptBlock` ships it to the
 * agent as a bare `measurementEvents: []` with no worked example while every
 * other field has one, so nothing has ever populated it.
 *
 * An outcome measured in real use generally is not visible to the build agent
 * anyway — it lives in the running system's own records, weeks after the story
 * that built it. So an outcome is RECORDED here by a person, against a definition
 * approved in advance, with a pointer to where the number came from. Story-reported
 * events remain welcome and can be merged into a definition later; they are not the
 * foundation of this, because they do not exist.
 *
 * ── TWO TABLES, AND WHY NOT ONE ────────────────────────────────────────────
 *
 * The definition is the promise: what will be measured, how, and which direction
 * counts as better. The outcome is the reading. Keeping them apart is what stops
 * "we measured whatever makes us look good after the fact" — the definition is
 * approved BEFORE a value is attached to it, and a reading cites the definition it
 * answers. One table would let both be written in the same breath by the same hand.
 *
 * ── NOBODY CONFIRMS THEIR OWN NUMBER ───────────────────────────────────────
 *
 * `confirmed_by` must differ from `recorded_by`, and a definition's `approved_by`
 * must differ from its `created_by`. This is the same rule `promoteMetric` already
 * enforces when it refuses `verification_method = 'self'`: the party making a claim
 * does not get to be the party that establishes it. The database holds both as CHECK
 * constraints, because a rule enforced only in a service is a rule until someone
 * writes a second caller.
 *
 * ── POST-CONDITION ASSERTION ───────────────────────────────────────────────
 *
 * Every statement is best-effort and only warns, as its siblings do, so "it did not
 * throw" is NOT evidence the schema landed. `CREATE TABLE IF NOT EXISTS` is a no-op
 * against an existing table, which makes the assertion below the only thing that can
 * tell you a column added later is actually there.
 */

export async function ensureProjectMeasurementSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS project_measurement_definitions (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       project_id UUID NOT NULL,
       measurement_key VARCHAR(80) NOT NULL,
       name VARCHAR(200) NOT NULL,
       question TEXT NOT NULL,
       method TEXT NOT NULL,
       unit VARCHAR(40),
       direction VARCHAR(16) NOT NULL DEFAULT 'lower_is_better',
       baseline_display VARCHAR(120),
       status VARCHAR(16) NOT NULL DEFAULT 'proposed',
       created_by VARCHAR(255) NOT NULL,
       approved_by VARCHAR(255),
       approved_at TIMESTAMPTZ,
       retired_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       CONSTRAINT project_measurement_definitions_direction_ck
         CHECK (direction IN ('lower_is_better', 'higher_is_better', 'target')),
       CONSTRAINT project_measurement_definitions_status_ck
         CHECK (status IN ('proposed', 'approved', 'retired')),
       -- Approval is somebody else's signature, enforced here and not only in the
       -- service. An approved row with no approver, or one approved by its own
       -- author, is the failure this whole pair of tables exists to prevent.
       CONSTRAINT project_measurement_definitions_approval_ck
         CHECK (
           status <> 'approved'
           OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND LOWER(approved_by) <> LOWER(created_by))
         )
     )`,

    // One definition per key per project. The merge from a story-reported event, if
    // one ever arrives, matches on this key, and two rows sharing it would make the
    // match depend on scan order.
    `CREATE UNIQUE INDEX IF NOT EXISTS project_measurement_definitions_key_unique
       ON project_measurement_definitions (project_id, LOWER(measurement_key))`,

    `CREATE INDEX IF NOT EXISTS idx_project_measurement_definitions_project
       ON project_measurement_definitions (project_id, status)`,

    `CREATE TABLE IF NOT EXISTS project_measurement_outcomes (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       definition_id UUID NOT NULL REFERENCES project_measurement_definitions(id) ON DELETE CASCADE,
       project_id UUID NOT NULL,
       value_display VARCHAR(120) NOT NULL,
       numeric_value DOUBLE PRECISION,
       unit VARCHAR(40),
       baseline_display VARCHAR(120),
       sample TEXT,
       observed_from DATE,
       observed_to DATE,
       evidence TEXT NOT NULL,
       evidence_url TEXT,
       note TEXT,
       status VARCHAR(16) NOT NULL DEFAULT 'recorded',
       recorded_by VARCHAR(255) NOT NULL,
       confirmed_by VARCHAR(255),
       confirmed_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       CONSTRAINT project_measurement_outcomes_status_ck
         CHECK (status IN ('recorded', 'confirmed', 'withdrawn')),
       -- Same rule as the definition, for the same reason: the person who read the
       -- number is not the person who establishes it.
       CONSTRAINT project_measurement_outcomes_confirmation_ck
         CHECK (
           status <> 'confirmed'
           OR (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL AND LOWER(confirmed_by) <> LOWER(recorded_by))
         )
     )`,

    `CREATE INDEX IF NOT EXISTS idx_project_measurement_outcomes_project
       ON project_measurement_outcomes (project_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_project_measurement_outcomes_definition
       ON project_measurement_outcomes (definition_id)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] project measurement schema stmt skipped:', err?.message);
    }
  }

  await assertProjectMeasurementSchema();
}

/** What ensureProjectMeasurementSchema must have produced. Checked, not assumed. */
export const REQUIRED_TABLES = [
  'project_measurement_definitions',
  'project_measurement_outcomes',
] as const;

export const REQUIRED_UNIQUE_INDEXES = [
  'project_measurement_definitions_key_unique',
] as const;

/**
 * The CHECK constraints that carry the rules. Named explicitly because a table
 * created without them satisfies every table-and-column check while permitting
 * exactly the self-approval this design refuses.
 */
export const REQUIRED_CONSTRAINTS = [
  'project_measurement_definitions_approval_ck',
  'project_measurement_outcomes_confirmation_ck',
] as const;

export const REQUIRED_COLUMNS = [
  'project_measurement_definitions.project_id',
  'project_measurement_definitions.measurement_key',
  'project_measurement_definitions.question',
  'project_measurement_definitions.method',
  'project_measurement_definitions.direction',
  'project_measurement_definitions.status',
  'project_measurement_definitions.created_by',
  'project_measurement_definitions.approved_by',
  'project_measurement_definitions.approved_at',
  'project_measurement_outcomes.definition_id',
  'project_measurement_outcomes.project_id',
  'project_measurement_outcomes.value_display',
  'project_measurement_outcomes.evidence',
  'project_measurement_outcomes.status',
  'project_measurement_outcomes.recorded_by',
  'project_measurement_outcomes.confirmed_by',
  'project_measurement_outcomes.confirmed_at',
] as const;

/**
 * Verify the post-condition against the catalog and report loudly if it is not met.
 * Exported so a test can prove the assertion fires against an un-migrated database —
 * an assertion nobody has watched fail is not an assertion.
 */
export async function assertProjectMeasurementSchema(): Promise<{ ok: boolean; missing: string[] }> {
  const missing: string[] = [];
  try {
    const [tableRows]: any = await sequelize.query(
      `SELECT array_agg(table_name) AS tables FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ANY($tables)`,
      { bind: { tables: [...REQUIRED_TABLES] } },
    );
    const foundTables: string[] = tableRows?.[0]?.tables ?? [];
    for (const t of REQUIRED_TABLES) if (!foundTables.includes(t)) missing.push(`table:${t}`);

    // pg_index.indisunique, not pg_indexes.indexname. The name proves somebody once
    // ran a CREATE; indisunique proves the database refuses the second row.
    const [idxRows]: any = await sequelize.query(
      `SELECT c.relname AS indexname, i.indisunique AS is_unique
         FROM pg_index i
         JOIN pg_class c ON c.oid = i.indexrelid
         JOIN pg_class t ON t.oid = i.indrelid
        WHERE t.relname = ANY($tables)`,
      { bind: { tables: [...REQUIRED_TABLES] } },
    );
    const uniqueByName = new Map<string, boolean>(
      (idxRows ?? []).map((r: any) => [String(r.indexname), Boolean(r.is_unique)]),
    );
    for (const idx of REQUIRED_UNIQUE_INDEXES) {
      if (!uniqueByName.has(idx)) missing.push(`index:${idx}`);
      else if (!uniqueByName.get(idx)) missing.push(`index-not-unique:${idx}`);
    }

    const [conRows]: any = await sequelize.query(
      `SELECT conname FROM pg_constraint WHERE conname = ANY($names)`,
      { bind: { names: [...REQUIRED_CONSTRAINTS] } },
    );
    const foundCons = new Set<string>((conRows ?? []).map((r: any) => String(r.conname)));
    for (const c of REQUIRED_CONSTRAINTS) if (!foundCons.has(c)) missing.push(`constraint:${c}`);

    // Filtered on table_schema. Without it `information_schema.columns` judges an
    // arbitrary one of the same-named tables when more than one schema holds it.
    const [colRows]: any = await sequelize.query(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($tables)`,
      { bind: { tables: [...REQUIRED_TABLES] } },
    );
    const found = new Set<string>((colRows ?? []).map((r: any) => `${r.table_name}.${r.column_name}`));
    for (const c of REQUIRED_COLUMNS) if (!found.has(c)) missing.push(`column:${c}`);
  } catch (err: any) {
    missing.push(`check-failed:${err?.message ?? 'unknown'}`);
  }

  if (missing.length) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event: 'project_measurement_schema_incomplete',
      outcome: 'failure',
      error_class: 'SchemaPostConditionUnmet',
      context: { missing },
    }));
  }
  return { ok: missing.length === 0, missing };
}
