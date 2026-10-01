/**
 * ensureProjectLifecycleSchema — the unified project lifecycle, additive.
 *
 * One governed lifecycle every new project passes through, so that no project reaches an
 * authorized implementation plan without an approved, versioned operating blueprint. See
 * `docs/project-lifecycle/architecture.md` for the decision record this implements.
 *
 *   project_lifecycle_states       — the (stage, condition) of one project, tenant-bound
 *   operating_blueprint_manifests  — the versioned, immutable manifest + content hash
 *   blueprint_approvals            — immutable approval records bound to an exact revision
 *   lifecycle_stage_failures       — dead-letter for stage commands that exhausted their retries
 *
 * FOUR THINGS WORTH KNOWING BEFORE EDITING THIS FILE.
 *
 * 1. Two project tables, deliberately not merged. `projects` (student/portal) and
 *    `delivery_projects` (client/delivery) are separate domain models and the request forbids
 *    collapsing them. A lifecycle row therefore carries TWO nullable FKs and a CHECK that
 *    exactly one is set. That keeps real referential integrity, which a polymorphic
 *    (kind, id) pair with no FK would throw away.
 *
 * 2. `condition` is NOT a stage. blocked / failed / awaiting_input / needs_reapproval are
 *    recorded alongside the stage so the stage to resume FROM is never lost. A provider failure
 *    at `process_ready` leaves ('process_ready', 'failed'), not 'failed'. This is the whole
 *    reason recovery is possible.
 *
 * 3. The manifest hash binds tenant + project + revision. `factoryApproval.contentHash()`
 *    covers only revisionId + doc_json — no tenant, and not the actor — and the request
 *    requires that "all citations must resolve within the correct project/tenant and revision".
 *    `uq_blueprint_manifest_revision` is the DB backstop the approval CAS actually depends on.
 *
 * 4. `proposed_by` exists from day one, on purpose. Separation of duty cannot be enforced
 *    without a proposer to compare the approver against: `contract_process_documents` records
 *    only `approved_by`, which is why the equivalent check could not simply be ported onto it
 *    (it would have short-circuited on a null and passed silently on every existing row — a
 *    ceremonial check, which is worse than none).
 *
 * Every CREATE is `IF NOT EXISTS`; no existing table is altered; the loop is warn-only and a
 * post-condition assert names anything that failed to appear — the same shape as
 * ensureContractTrackSchema. The warn-only loop is why the assert is not optional: without it a
 * failed migration is silent, and the code that depends on these tables would 500 in production
 * instead of saying so at boot.
 */
import { sequelize } from '../config/database';

export const REQUIRED_TABLES: ReadonlyArray<string> = [
  'project_lifecycle_states',
  'operating_blueprint_manifests',
  'blueprint_approvals',
  'lifecycle_stage_failures',
];

/**
 * Every DDL statement, hoisted so a test can assert the whole set is additive — only
 * CREATE ... IF NOT EXISTS, never an ALTER or DROP of an existing table — and that FKs point
 * only at tables that already exist (tenants, projects, delivery_projects).
 */
export const PROJECT_LIFECYCLE_STATEMENTS: ReadonlyArray<string> = [
  // The lifecycle position of one project. Exactly one of the two project FKs is set; the CHECK
  // makes the "two identity tables, not merged" decision a database invariant rather than a
  // convention someone can forget. `condition` is nullable because most of a project's life has
  // no condition at all.
  `CREATE TABLE IF NOT EXISTS project_lifecycle_states (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     student_project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
     delivery_project_id UUID REFERENCES delivery_projects(id) ON DELETE CASCADE,
     stage TEXT NOT NULL DEFAULT 'discovery',
     condition TEXT,
     condition_reason TEXT,
     entry_point TEXT,
     next_actor_role TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     CONSTRAINT ck_lifecycle_exactly_one_project CHECK (
       (student_project_id IS NOT NULL AND delivery_project_id IS NULL)
       OR (student_project_id IS NULL AND delivery_project_id IS NOT NULL)
     )
   )`,
  // One lifecycle row per project, per identity table. This is what makes registration
  // idempotent: a duplicate registration conflicts instead of creating a second lifecycle.
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_lifecycle_student_project
     ON project_lifecycle_states (student_project_id) WHERE student_project_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_lifecycle_delivery_project
     ON project_lifecycle_states (delivery_project_id) WHERE delivery_project_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_lifecycle_tenant_stage
     ON project_lifecycle_states (tenant_id, stage)`,

  // The operating blueprint manifest: an immutable record REFERENCING revisions of existing
  // normalized records, not a second copy of all project data (request 4.2 — "avoid duplicating
  // all data into a second mutable truth store"). refs_json holds the pinned revision pointers;
  // measures_json holds effort/allocation measures with their basis and coverage.
  //
  // An approved revision is never edited. A change forks a new revision and stamps the old one
  // superseded — the fork-on-edit shape factoryApproval already uses.
  `CREATE TABLE IF NOT EXISTS operating_blueprint_manifests (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     student_project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
     delivery_project_id UUID REFERENCES delivery_projects(id) ON DELETE CASCADE,
     schema_version INTEGER NOT NULL DEFAULT 1,
     revision INTEGER NOT NULL DEFAULT 1,
     content_sha256 VARCHAR(64),
     status TEXT NOT NULL DEFAULT 'draft',
     refs_json JSONB NOT NULL,
     measures_json JSONB,
     prior_revision_id UUID,
     superseded_by_id UUID,
     proposed_by TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     CONSTRAINT ck_manifest_exactly_one_project CHECK (
       (student_project_id IS NOT NULL AND delivery_project_id IS NULL)
       OR (student_project_id IS NULL AND delivery_project_id IS NOT NULL)
     )
   )`,
  // THE BACKSTOP. The approval CAS is a read-then-compare in application code; this index is
  // what actually makes a concurrent double-approval impossible, by rejecting the second insert
  // at the same revision. Two partial indexes because exactly one project FK is ever set.
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_blueprint_manifest_revision_student
     ON operating_blueprint_manifests (tenant_id, student_project_id, revision)
     WHERE student_project_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_blueprint_manifest_revision_delivery
     ON operating_blueprint_manifests (tenant_id, delivery_project_id, revision)
     WHERE delivery_project_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_blueprint_manifest_status
     ON operating_blueprint_manifests (tenant_id, status)`,

  // Immutable approval records. An approval binds the actor AND the role that authorized them,
  // the tenant, the subject manifest, the exact revision and content hash, the scope, and a
  // rationale. approved_by is written from the authenticated session, never from a request body.
  //
  // scope mirrors the Factory's ApprovalLevel vocabulary ('documented' | 'full') rather than
  // inventing a parallel one.
  `CREATE TABLE IF NOT EXISTS blueprint_approvals (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     manifest_id UUID NOT NULL REFERENCES operating_blueprint_manifests(id) ON DELETE CASCADE,
     revision INTEGER NOT NULL,
     content_sha256 VARCHAR(64) NOT NULL,
     scope TEXT NOT NULL DEFAULT 'documented',
     approved_by TEXT NOT NULL,
     approved_by_role TEXT,
     rationale TEXT,
     selected_design_ref TEXT,
     approved_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  // An approval of a given manifest revision happens at most once. This is what makes a retried
  // approval return the ORIGINAL approver and timestamp rather than quietly re-stamping who
  // approved what, and when.
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_blueprint_approval_revision
     ON blueprint_approvals (manifest_id, revision)`,

  // Dead-letter for stage commands that exhausted their capped retries. Carries full context for
  // manual triage, because a retry cap without somewhere for the failure to land is just silent
  // loss.
  `CREATE TABLE IF NOT EXISTS lifecycle_stage_failures (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     lifecycle_state_id UUID REFERENCES project_lifecycle_states(id) ON DELETE CASCADE,
     attempted_stage TEXT NOT NULL,
     attempts INTEGER NOT NULL,
     error_class TEXT,
     error_message TEXT,
     correlation_id TEXT,
     context_json JSONB,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_lifecycle_failures_state
     ON lifecycle_stage_failures (lifecycle_state_id)`,
];

export async function ensureProjectLifecycleSchema(): Promise<void> {
  for (const sql of PROJECT_LIFECYCLE_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] project lifecycle schema stmt skipped:', err?.message);
    }
  }
  await assertProjectLifecycleSchema();
}

/**
 * Post-condition. The loop above is warn-only, so without this a failed migration is invisible
 * until a lifecycle read 500s in production. Say it loudly at boot instead.
 */
export async function assertProjectLifecycleSchema(): Promise<boolean> {
  const problems: string[] = [];
  try {
    // Aggregate existence per table in SQL and read ONE row back. This app's sequelize returns a
    // single-column SELECT as RAW ARRAYS, not `{ table_name }` objects, so a membership filter
    // reports every table missing while they demonstrably exist — the bug documented at
    // ensureContractTrackSchema.ts:158-165, which logged a bogus invariant violation every boot.
    // A one-row `bool_or` result is keyed by the aliases and sidesteps it. REQUIRED_TABLES are
    // fixed constants, so the interpolation is not injectable.
    const selects = REQUIRED_TABLES.map((t, i) => `bool_or(table_name = '${t}') AS t${i}`).join(', ');
    const [rows] = await sequelize.query(
      `SELECT ${selects} FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const row = (((rows as any[]) || [])[0] || {}) as Record<string, boolean>;
    REQUIRED_TABLES.forEach((t, i) => { if (!row[`t${i}`]) problems.push(`table ${t} missing`); });
  } catch (err: any) {
    problems.push(`schema introspection failed: ${err?.message}`);
  }

  if (problems.length === 0) {
    console.log('[DB] project lifecycle schema ensured');
    return true;
  }
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend',
    event: 'project_lifecycle_schema_invariant_violated', outcome: 'failure',
    error_class: 'SchemaInvariantViolation',
    context: {
      problems,
      impact: 'Project lifecycle registration and blueprint approval will fail; new projects would not be governed.',
      remedy: 'Run the CREATE TABLE statements in ensureProjectLifecycleSchema.',
    },
  }));
  return false;
}
