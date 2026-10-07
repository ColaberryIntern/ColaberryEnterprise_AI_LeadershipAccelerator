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
// The ensure path finishes by ASSERTING, which is the only reason a failed statement does
// not pass silently. Split out in P5-T1.3; this import is what keeps that call reachable.
import { assertProjectLifecycleSchema } from './projectLifecycleSchemaContract';

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
  // THE IDEMPOTENCY KEY’S STORAGE, added by P5-T1.3.
  //
  // Separate from `content_sha256` on purpose. That column is LC-10’s "exact version/hash"
  // binding — `manifestContentHash` covers tenant + project + REVISION + refs, and
  // `approveBlueprint` writes it into `blueprint_approvals.content_sha256`. Parking a
  // revision-INDEPENDENT hash there would silently weaken that binding, because such a hash
  // cannot bind an approval to an exact version. Two hashes answer two questions: one binds
  // the approval, one identifies the write.
  //
  // ALTER rather than a column in the CREATE above, because `CREATE TABLE IF NOT EXISTS`
  // cannot add a column to a table that already exists — production has this table from
  // Phase 2, so a column declared only in the CREATE would never arrive. `ADD COLUMN IF NOT
  // EXISTS` is the repo-wide convention for this (53 non-test files under src/db/, 91 with
  // tests; an earlier version of this comment said 52, measured before this very ALTER was
  // added) and is both
  // additive and idempotent.
  `ALTER TABLE operating_blueprint_manifests
     ADD COLUMN IF NOT EXISTS refs_sha256 VARCHAR(64)`,

  // WHY UNIQUE, AND WHY IT BLOCKS A REVERT ON PURPOSE. This is what makes a concurrent
  // replay impossible rather than merely unlikely: the writer is read-then-insert in
  // application code, so without the index two simultaneous writes of identical refs both
  // see "no existing row" and both insert. It also refuses a later revision whose refs are
  // byte-identical to an earlier one — correct, because identical refs mean there is nothing
  // new to record. What it COSTS is revert-and-supersede: a project reverting to an earlier
  // blueprint gets the old row back, at a revision below head, which the approval CAS then
  // refuses. It fails loudly rather than corrupting. An earlier version of this comment said
  // a revert and a replay are "indistinguishable by construction" — they are not, a later
  // revision exists — and that sentence outlived its retraction in `manifestWriter.ts`.
  //
  // Two partial indexes because exactly one project FK is ever set, matching the revision
  // backstop below. NULL refs_sha256 is excluded so the Phase 2 rows, written before this
  // column existed, do not all collide on NULL.
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_blueprint_manifest_refs_student
     ON operating_blueprint_manifests (tenant_id, student_project_id, refs_sha256)
     WHERE student_project_id IS NOT NULL AND refs_sha256 IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_blueprint_manifest_refs_delivery
     ON operating_blueprint_manifests (tenant_id, delivery_project_id, refs_sha256)
     WHERE delivery_project_id IS NOT NULL AND refs_sha256 IS NOT NULL`,

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
