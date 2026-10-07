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
 * MUST BE CALLED AFTER `ensureMultiTenantSchema()`. Every table here carries
 * `tenant_id ... REFERENCES tenants(id)`, and two more reference `projects` / `delivery_projects`.
 * The order holds today by position alone - `server.ts:2555` calls ensureMultiTenantSchema()
 * before `:2744` calls this - and nothing states the requirement, so a boot-loop reordering
 * would silently produce NOTHING on a fresh database: the loop below is warn-only, so all
 * statements would be skipped with a console warning and no failure. Measured directly against
 * Postgres 15.16 on 2026-10-02: on an empty database every statement warn-skips, cascading from
 * `relation "tenants" does not exist`. `ensureGrowthJourneySchema.ts:22-24` records the same
 * requirement for the same reason; this note exists so the ordering is a stated contract rather
 * than an accident that currently works.
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
  'blueprint_role_map',
  'blueprint_design_decisions',
  'blueprint_visual_contracts',
];

/**
 * Indexes that are not optimisations — they are the correctness guarantees.
 *
 * CHECKING TABLES IS NOT ENOUGH, and this list exists because of a measured result. The LC-13
 * concurrency suite proved against a real Postgres that with `uq_blueprint_approval_revision`
 * DROPPED, two concurrent approvals of the same revision write TWO rows; with it present, one.
 * The application-level CAS is a read-then-compare and does not close the race on its own.
 *
 * So a schema assert that confirms the tables exist while an index is missing would report a
 * healthy schema over a reopened production incident. Every name here is load-bearing:
 *
 *   uq_lifecycle_student_project / _delivery_project
 *       One lifecycle per project. Without these, registration is not idempotent and a duplicate
 *       request creates a second lifecycle for the same project.
 *   uq_blueprint_manifest_revision_student / _delivery
 *       One manifest per (tenant, project, revision) — the backstop behind the approval CAS.
 *   uq_blueprint_approval_revision
 *       One approval per manifest revision. This is the one the concurrency proof drops.
 *   uq_role_map_manifest_function
 *       One role-map row per (manifest, previous_function). Without it the same displaced
 *       function can appear twice under different new roles and the old->new mapping stops
 *       being a mapping. Two answers to "what happened to this job" is worse than none,
 *       because a reviewer reads whichever row the query happened to return first.
 *   uq_design_decision_approved_tier (P4-T6)
 *       At most one APPROVED design decision per (tenant, manifest, tier). PARTIAL, on
 *       `status = 'approved'`, which is the whole point: `deliveryDesignLoop` is built on
 *       "supersession, never silent overwrite", so many rows per tier over time is correct
 *       and many APPROVED rows is not. A full unique index would forbid supersession; no
 *       index at all would let two rows both claim to be what was agreed at that tier.
 *   uq_visual_contract_decision_revision (P4-T6)
 *       One visual contract per (tenant, decision, revision). 4.5 requires the approval
 *       record to reference a visual-contract revision, and a reference is only a reference
 *       if the revision resolves to one row. Two rows at revision 3 means Gate 9 compares an
 *       implementation against whichever one came back first.
 */
export const REQUIRED_INDEXES: ReadonlyArray<string> = [
  'uq_lifecycle_student_project',
  'uq_lifecycle_delivery_project',
  'uq_blueprint_manifest_revision_student',
  'uq_blueprint_manifest_revision_delivery',
  'uq_blueprint_approval_revision',
  'uq_role_map_manifest_function',
  'uq_design_decision_approved_tier',
  'uq_visual_contract_decision_revision',
];

/**
 * CHECK constraints that make "the two identity tables are not merged" a database invariant
 * rather than a convention someone can forget.
 *
 * ## What P4-T6 deliberately does NOT constrain here
 *
 * No CHECK on `tier` or `status`. Both are closed unions in
 * `services/delivery/deliveryDesignLoop.ts` (`DesignTier`, `DesignDecisionStatus`), and an
 * `IN (...)` list in DDL would be a SECOND definition of the same vocabulary — the thing this
 * phase keeps removing rather than adding. Same reason there is no upper bound on
 * `variant_count`: `MAX_VARIANTS` lives in one place and duplicating it in a constraint would
 * mean a future change to the rule silently disagrees with the database.
 *
 * The three new constraints are domain SHAPES rather than policy: a JSONB column that must
 * hold an array, and a variance that must be a fraction. A fraction outside 0..1 cannot
 * gate anything — it passes every screen or fails every screen depending on which default
 * someone picked, which is exactly what `validateVisualContract` refuses in memory. Having it
 * in both places is defence in depth for a value whose corruption is silent, not a duplicated
 * rule someone can change.
 */
export const REQUIRED_CONSTRAINTS: ReadonlyArray<string> = [
  'ck_lifecycle_exactly_one_project',
  'ck_manifest_exactly_one_project',
  'ck_role_map_retained_is_array',
  'ck_design_decision_dna_is_array',
  'ck_visual_contract_regions_is_array',
  'ck_visual_contract_variance_fraction',
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

  // THE OLD->NEW ROLE MAP (P3-T3). What a displaced function became: which part the AI now
  // contributes, which new role carries it, and what the person retains. Kept as its own table
  // rather than a JSONB column on the manifest, because a role map is read and reviewed per row
  // - "what happened to MY job" is a row lookup - and because a durable fact in a JSONB blob is
  // how unrelated keys get erased by the next whole-object write.
  //
  // retained_responsibilities is JSONB rather than TEXT[]: the manifest's refs_json and
  // measures_json are already JSONB, and a CHECK keeps it an ARRAY so a bare string cannot be
  // stored where a list is read.
  `CREATE TABLE IF NOT EXISTS blueprint_role_map (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     manifest_id UUID NOT NULL REFERENCES operating_blueprint_manifests(id) ON DELETE CASCADE,
     previous_function TEXT NOT NULL,
     ai_contribution TEXT NOT NULL,
     new_role_id TEXT NOT NULL,
     retained_responsibilities JSONB NOT NULL DEFAULT '[]'::jsonb,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     CONSTRAINT ck_role_map_retained_is_array CHECK (
       jsonb_typeof(retained_responsibilities) = 'array'
     )
   )`,
  // One row per (manifest, previous_function). See REQUIRED_INDEXES: two answers to "what
  // happened to this job" is worse than none, because a reviewer reads whichever row came back
  // first. Scoped by tenant for the same reason every other index here is.
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_role_map_manifest_function
     ON blueprint_role_map (tenant_id, manifest_id, previous_function)`,

  // ─── P4-T6. One governed design decision, bound to the blueprint revision it was taken
  // against. `DesignDecisionLike` in `deliveryDesignLoop` was written for exactly this shape
  // and had nowhere to live; `blueprint_role_map` is already in the carried-forward register
  // as open because a table with no model has no reader, so these two ship with models.
  //
  // `manifest_content_hash` is RECORDED, not acted on. The hash is computed today at
  // `blueprintApproval.ts:104-116`, but nothing in production writes `manifest.refs_json` and
  // no material-vs-cosmetic classifier exists anywhere in `backend/src` — so the rule "a
  // design change invalidates the right approvals" cannot be implemented here and is deferred
  // with its three parts named in the register. Storing the hash is what makes the later
  // classifier possible without a backfill; claiming the invalidation works would be the
  // third assertion of a dependency that does not exist.
  `CREATE TABLE IF NOT EXISTS blueprint_design_decisions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     manifest_id UUID NOT NULL REFERENCES operating_blueprint_manifests(id) ON DELETE CASCADE,
     manifest_content_hash TEXT NOT NULL,
     tier TEXT NOT NULL,
     title TEXT,
     status TEXT NOT NULL,
     variant_count INTEGER NOT NULL DEFAULT 0,
     approved_variant_id TEXT,
     selected_design_ref TEXT,
     rationale TEXT,
     approved_by_identity_id TEXT,
     supersedes_decision_id UUID REFERENCES blueprint_design_decisions(id) ON DELETE SET NULL,
     dna_facets JSONB NOT NULL DEFAULT '[]'::jsonb,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     CONSTRAINT ck_design_decision_dna_is_array CHECK (
       jsonb_typeof(dna_facets) = 'array'
     )
   )`,
  // PARTIAL on purpose — see REQUIRED_INDEXES. Supersession means many rows per tier over
  // time; only one of them may be the approved one.
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_design_decision_approved_tier
     ON blueprint_design_decisions (tenant_id, manifest_id, tier)
     WHERE status = 'approved'`,

  // NOTE on `ck_visual_contract_variance_fraction` below: there is no
  // `acceptable_variance IS NULL OR` disjunct, and the absence is deliberate. A Postgres CHECK
  // whose expression evaluates to NULL is SATISFIED, so a NULL variance passes without being
  // named. A verifier removed that disjunct and the suite stayed at 12/12 — an operand that
  // could not change an answer, which Amendment 4 of this run classifies as category 2:
  // remove it rather than write a test that cannot fail. Nullable remains deliberate (a
  // contract can exist before its threshold is agreed) and `validateVisualContract` is what
  // refuses to let a null one gate anything.
  // The Visual Contract a decision was approved against. 4.5 requires the approval record to
  // reference the selected variant AND the contract revision, which is why `revision` is a
  // column here and why it is half of the unique index: a reference that can resolve to two
  // rows is not a reference.
  `CREATE TABLE IF NOT EXISTS blueprint_visual_contracts (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     decision_id UUID NOT NULL REFERENCES blueprint_design_decisions(id) ON DELETE CASCADE,
     revision INTEGER NOT NULL,
     required_regions JSONB NOT NULL DEFAULT '[]'::jsonb,
     required_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
     hierarchy TEXT,
     responsive_rules JSONB,
     accessibility_rules JSONB,
     reference_snapshot_ref TEXT,
     acceptable_variance NUMERIC,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     CONSTRAINT ck_visual_contract_regions_is_array CHECK (
       jsonb_typeof(required_regions) = 'array' AND jsonb_typeof(required_actions) = 'array'
     ),
     CONSTRAINT ck_visual_contract_variance_fraction CHECK (
       acceptable_variance >= 0 AND acceptable_variance <= 1
     )
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_visual_contract_decision_revision
     ON blueprint_visual_contracts (tenant_id, decision_id, revision)`,
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

    // THE INDEXES, for the reason spelled out on REQUIRED_INDEXES: a table-only assert would
    // report a healthy schema while the backstop behind the approval CAS was gone. Same
    // bool_or-aliased single-row form, for the same raw-array quirk.
    const idxSelects = REQUIRED_INDEXES.map((n, i) => `bool_or(indexname = '${n}') AS i${i}`).join(', ');
    const [idxRows] = await sequelize.query(
      `SELECT ${idxSelects} FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const idxRow = (((idxRows as any[]) || [])[0] || {}) as Record<string, boolean>;
    REQUIRED_INDEXES.forEach((n, i) => {
      if (!idxRow[`i${i}`]) problems.push(`index ${n} missing (a correctness guarantee, not an optimisation)`);
    });

    // The CHECK constraints keeping the two identity tables unmerged.
    const ckSelects = REQUIRED_CONSTRAINTS.map((n, i) => `bool_or(constraint_name = '${n}') AS c${i}`).join(', ');
    const [ckRows] = await sequelize.query(
      `SELECT ${ckSelects} FROM information_schema.table_constraints WHERE table_schema = 'public'`,
    );
    const ckRow = (((ckRows as any[]) || [])[0] || {}) as Record<string, boolean>;
    REQUIRED_CONSTRAINTS.forEach((n, i) => {
      if (!ckRow[`c${i}`]) problems.push(`check constraint ${n} missing`);
    });
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
