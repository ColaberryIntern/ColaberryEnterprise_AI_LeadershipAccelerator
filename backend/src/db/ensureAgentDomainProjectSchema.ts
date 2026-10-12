/**
 * Agent Domain project schema — the ONE join table that says which domain a project belongs to,
 * plus the authorization store for builds inside one.
 *
 * Run `20261007-school-agent-factory` (T08), session CC-20261006-a4k7.
 *
 * TWO TABLES, ZERO `ALTER` STATEMENTS. That is the whole contribution.
 * Everything else the ten AI-domain projects need already exists and is reused:
 *   - a project is a `projects` row; a release is a `student_task_lists` row; a story is a
 *     `student_tasks` row (`internshipProjectGeneration.ts:28-29`)
 *   - readiness is `project_lifecycle_states` (shipped, mounted, and never yet used)
 *   - AI_AGENT-ness is expressed by CHILD ROWS, never a `projects.project_type` column. The repo
 *     settled that once already: `docs/factory/PHASE_6_MIGRATION.md:17-20` says contract-ness "is
 *     structural, not a column". Applying that to the student `projects` table is an inference from
 *     that decision rather than a quotation of it, and is recorded as such.
 *
 * WHY A SECOND AUTHORIZATION TABLE RATHER THAN A COLUMN ON `build_authorizations`
 * The original design added a nullable `student_project_id` to the existing gov table so one gate
 * could scope both. That is structurally impossible: `ensureGovQualificationSchema.ts:76` declares
 * `delivery_project_id UUID NOT NULL REFERENCES delivery_projects(id)`, there is exactly one DDL
 * site, and nothing relaxes it. An AI-domain row could never have been inserted, because it has no
 * `delivery_projects` parent and must not be given one. Dropping that `NOT NULL` would have
 * *weakened* the gov gate — today every build authorization provably names a delivery project.
 *
 * So the REFUSAL is reused instead of the table. `factory/buildAuthorization.ts:37`
 * `assertBuildAuthorized` is a pure function over a four-field shape, with its database access in a
 * separate loader at `:46`. One gate, two storage locations — and a test asserts both paths call
 * the same function object, so a future change to the refusal cannot apply to one and not the
 * other.
 *
 * `ROLLBACK_STATEMENTS` IS NET-NEW AND SAYS SO.
 * `REQUIRED_TABLES`/`REQUIRED_COLUMNS`/`REQUIRED_INDEXES` follow a real convention — nine files in
 * this directory export `REQUIRED_TABLES`, e.g. `ensureProjectLifecycleSchema.ts:56`. `ROLLBACK`
 * appears in **0** files here. The export is kept because it is useful and testable, but it is an
 * addition, not a pattern, and an earlier draft wrongly cited `ensureProjectArchiveSchema.ts` as
 * precedent for it.
 */

import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

export const REQUIRED_TABLES: ReadonlyArray<string> = [
  'agent_domain_projects',
  'agent_domain_build_authorizations',
];

export const REQUIRED_COLUMNS: ReadonlyArray<{ table: string; column: string }> = [
  { table: 'agent_domain_projects', column: 'id' },
  { table: 'agent_domain_projects', column: 'tenant_id' },
  { table: 'agent_domain_projects', column: 'student_project_id' },
  { table: 'agent_domain_projects', column: 'domain_key' },
  { table: 'agent_domain_projects', column: 'agent_id' },
  { table: 'agent_domain_projects', column: 'manager_identity_id' },
  { table: 'agent_domain_projects', column: 'manager_can_reach' },
  { table: 'agent_domain_projects', column: 'intended_builder' },
  { table: 'agent_domain_projects', column: 'intended_builder_state' },
  { table: 'agent_domain_projects', column: 'provisioned_by' },
  { table: 'agent_domain_build_authorizations', column: 'agent_domain_project_id' },
  { table: 'agent_domain_build_authorizations', column: 'approver_identity_id' },
  { table: 'agent_domain_build_authorizations', column: 'scope' },
  { table: 'agent_domain_build_authorizations', column: 'resource_limit' },
  { table: 'agent_domain_build_authorizations', column: 'revoked_at' },
];

export const REQUIRED_INDEXES: ReadonlyArray<string> = [
  'uq_agent_domain_project',
  'uq_agent_domain_key',
  'idx_agent_domain_build_auth',
];

/** The ten canonical domain keys, encoded as a database invariant. Set-compared against the
 *  registry's exported keys in both directions, so the two cannot disagree. */
export const AGENT_DOMAIN_CHECK_KEYS: ReadonlyArray<string> = [
  'learner_success', 'curriculum', 'marketing', 'product_experience', 'admissions',
  'sales', 'internship', 'website', 'platform', 'executive',
];

const CHECK_LIST = AGENT_DOMAIN_CHECK_KEYS.map((k) => `'${k}'`).join(',');

/**
 * Hoisted so a test can assert the shape of every statement without executing any of them.
 * Additive only: `CREATE TABLE IF NOT EXISTS` and `CREATE [UNIQUE] INDEX IF NOT EXISTS`, nothing
 * else. `ensureProjectLifecycleSchema.test.ts`'s `isAdditive` predicate rejects every `ALTER`, and
 * this file would correctly fail it if one were added.
 */
export const STATEMENTS: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS agent_domain_projects (
     id                     UUID PRIMARY KEY,
     tenant_id              UUID NOT NULL REFERENCES tenants(id)   ON DELETE CASCADE,
     student_project_id     UUID NOT NULL REFERENCES projects(id)  ON DELETE CASCADE,
     domain_key             TEXT NOT NULL,
     agent_id               UUID REFERENCES ai_agents(id)          ON DELETE SET NULL,
     manager_identity_id    TEXT,
     manager_can_reach      BOOLEAN,
     manager_blocker        TEXT,
     intended_builder       TEXT,
     intended_builder_state TEXT,
     provisioned_by         TEXT NOT NULL,
     created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
     CONSTRAINT ck_agent_domain_key CHECK (domain_key IN (${CHECK_LIST})),
     CONSTRAINT ck_agent_domain_builder_state CHECK (
       intended_builder_state IS NULL
       OR intended_builder_state IN ('verified_active','onboarding_pending','unassigned'))
   )`,

  `CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_domain_project
     ON agent_domain_projects (student_project_id)`,

  `CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_domain_key
     ON agent_domain_projects (tenant_id, domain_key)`,

  `CREATE TABLE IF NOT EXISTS agent_domain_build_authorizations (
     id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     agent_domain_project_id UUID NOT NULL REFERENCES agent_domain_projects(id) ON DELETE CASCADE,
     approver_identity_id    TEXT NOT NULL,
     scope                   TEXT NOT NULL,
     rationale               TEXT,
     resource_limit          TEXT NOT NULL,
     revoked_at              TIMESTAMPTZ,
     created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,

  `CREATE INDEX IF NOT EXISTS idx_agent_domain_build_auth
     ON agent_domain_build_authorizations (agent_domain_project_id)`,
];

/**
 * Net-new; no precedent in this directory. Note the ORDER and the caveat: once the ten production
 * rows exist, the real rollback is a row-level delete, not this drop. The ADR is explicit —
 * "Additive migrations are not blindly reversed when new data exists; forward-fix instead"
 * (`architecture.md:180`). These statements are for a pre-provisioning abort.
 */
export const ROLLBACK_STATEMENTS: ReadonlyArray<string> = [
  'DROP TABLE IF EXISTS agent_domain_build_authorizations',
  'DROP TABLE IF EXISTS agent_domain_projects',
];

export async function ensureAgentDomainProjectSchema(): Promise<void> {
  for (const statement of STATEMENTS) {
    try {
      await sequelize.query(statement);
    } catch (err: any) {
      // Warn-only by convention, which is exactly why the assert below is NOT optional: a failed
      // migration otherwise leaves the schema wrong without crashing boot (`architecture.md:156`).
      console.warn(
        JSON.stringify({
          level: 'warn',
          service: 'backend',
          event: 'agent_domain_schema_statement_failed',
          error_class: err?.name ?? 'Error',
          message: err?.message ?? String(err),
        }),
      );
    }
  }
  await assertAgentDomainProjectSchema();
}

/**
 * Post-condition. Two independent ways this could lie, both handled:
 *
 *  1. `sequelize.query` returns single-column selects as RAW ARRAYS rather than `{col}` objects, so
 *     a naive `rows.includes(name)` falsely reports every table missing
 *     (`architecture.md:154`, documented at `ensureContractTrackSchema.ts:158-165`). `readNames`
 *     below accepts both shapes.
 *  2. This database has THREE schemas — `public`, `snap_quincy_20260819`,
 *     `snap_quincy_20260819_after` — and three of the baseline tables exist in more than one
 *     (`student_tasks` in all three). An unqualified existence check can therefore report a table
 *     present because a 2026-08-19 snapshot has one. Every query here is filtered to `public`.
 */
export async function assertAgentDomainProjectSchema(): Promise<void> {
  const problems: string[] = [];

  const tables = await readNames(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($names)`,
    REQUIRED_TABLES,
  );
  for (const t of REQUIRED_TABLES) {
    if (!tables.includes(t)) problems.push(`missing table public.${t}`);
  }

  const indexes = await readNames(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($names)`,
    REQUIRED_INDEXES,
  );
  for (const i of REQUIRED_INDEXES) {
    if (!indexes.includes(i)) problems.push(`missing index public.${i}`);
  }

  if (problems.length > 0) {
    console.error(
      JSON.stringify({
        level: 'error',
        service: 'backend',
        event: 'SchemaInvariantViolation',
        error_class: 'SchemaInvariantViolation',
        context: { schema: 'agent_domain_project' },
        problems,
        impact:
          'The ten AI employee domain projects cannot be provisioned, and the uniqueness that stops '
          + 'an eleventh project or a duplicate domain is absent. A provisioning run would create '
          + 'rows with no structural guard.',
        remedy:
          'Re-run ensureAgentDomainProjectSchema() against a reachable database and read the '
          + 'agent_domain_schema_statement_failed warnings above for the first DDL error.',
      }),
    );
    throw new Error(`SchemaInvariantViolation: ${problems.join('; ')}`);
  }
}

/**
 * Reads a single-column result into a string array, tolerating BOTH shapes this app's driver
 * returns. Exported so a test can feed it each shape and require the same verdict — the naive
 * version of this function is the documented way the assert lies.
 */
export function normalizeNameRows(rows: unknown): string[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => {
      if (typeof r === 'string') return r;
      if (r && typeof r === 'object') {
        const v = Object.values(r as Record<string, unknown>)[0];
        return typeof v === 'string' ? v : null;
      }
      return null;
    })
    .filter((v): v is string => typeof v === 'string');
}

/**
 * Reads one column of names.
 *
 * ## The destructure that made this assert lie
 *
 * This function used to read `const [rows] = await sequelize.query(sql, ...)`, taking the first
 * element of Sequelize's `[results, metadata]` tuple. For a SINGLE-COLUMN select this driver
 * returns each row as a RAW ARRAY (`architecture.md:154`), so the whole result is
 * `[["agent_domain_build_authorizations"], ["agent_domain_projects"]]` -- and the destructure took
 * `["agent_domain_build_authorizations"]`, which is the FIRST ROW, not the rows array.
 *
 * So the assert saw exactly one name however many came back, and reported every required table
 * after the first as missing. Measured against real Postgres with both tables present and both
 * indexes created: `SchemaInvariantViolation: missing table public.agent_domain_projects`.
 *
 * This is the precise failure `normalizeNameRows` was written to prevent, one layer above where it
 * was looking: the row SHAPE was handled and the RESULT shape was not. It survived because
 * `normalizeNameRows` was only ever tested against a rows array handed to it directly, and the
 * assert itself had never been executed against a database -- which is why the integration suite
 * now runs it for real rather than reading the source with a regex.
 *
 * `QueryTypes.SELECT` returns the rows array with no tuple to destructure, which removes the
 * ambiguity rather than compensating for it.
 */
async function readNames(sql: string, names: ReadonlyArray<string>): Promise<string[]> {
  const rows = await sequelize.query(sql, {
    bind: { names: names as string[] },
    type: QueryTypes.SELECT,
  } as any);
  return normalizeNameRows(rows);
}

export default ensureAgentDomainProjectSchema;
