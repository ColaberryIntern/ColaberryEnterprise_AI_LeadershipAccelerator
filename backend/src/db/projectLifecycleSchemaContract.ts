/**
 * WHAT THE PROJECT-LIFECYCLE SCHEMA MUST CONTAIN, and the assert that proves it does.
 *
 * Split out of `ensureProjectLifecycleSchema.ts` at the seam
 * `docs/project-lifecycle/carried-forward-obligations.md` prescribed: the assertion lists and
 * the assert on one side, the DDL statement list on the other. That file was 433 lines against
 * CLAUDE.md's 500-line hard ceiling, and the register's instruction was that the next change to
 * it split before adding. P5-T1.3 is that change.
 *
 * WHY THE LISTS ARE SEPARATE FROM THE DDL AT ALL. The DDL says what we TRY to create; these
 * lists say what must be TRUE afterwards. `ensureProjectLifecycleSchema` logs a warning and
 * carries on when a statement fails, so a failed migration leaves a deploy looking entirely
 * normal — which is exactly the failure `phase4-handoff.md` makes a post-deploy run of
 * `verifyProjectLifecycleSchema.ts` mandatory for. Keeping the two apart is the point: a
 * contract that lived in the same list as the statements would be checking that we ran what we
 * ran.
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
  'uq_blueprint_manifest_refs_student',
  'uq_blueprint_manifest_refs_delivery',
  'uq_blueprint_manifest_revision_student',
  'uq_blueprint_manifest_revision_delivery',
  'uq_blueprint_approval_revision',
  'uq_role_map_manifest_function',
  'uq_design_decision_approved_tier',
  'uq_visual_contract_decision_revision',
];

/**
 * COLUMNS that must exist, as `table.column`.
 *
 * A NEW CATEGORY, added by P5-T1.3, and the reason it is needed is specific:
 * `ensureProjectLifecycleSchema` logs a warning and carries on when a statement fails, so a
 * column whose `ALTER` silently did not run leaves a deploy looking entirely normal and the
 * writer failing at runtime. A table-and-index assert cannot see that, because the table and
 * the index both already exist.
 *
 * Deliberately NOT every column. These are the ones whose absence is silent and load-bearing
 * — i.e. added by `ALTER` after the table shipped. A column inside a `CREATE TABLE` cannot be
 * missing while its table is present, so listing it would be asserting that Postgres works.
 */
export const REQUIRED_COLUMNS: ReadonlyArray<string> = [
  'operating_blueprint_manifests.refs_sha256',
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

    // THE COLUMNS. A column added by ALTER after its table shipped is the one schema failure
    // a table-and-index assert cannot see: the table exists, the index exists, and the write
    // fails at runtime. Same bool_or-aliased single-row form as above.
    const colSelects = REQUIRED_COLUMNS.map((q, i) => {
      const [t, c] = q.split('.');
      return `bool_or(table_name = '${t}' AND column_name = '${c}') AS k${i}`;
    }).join(', ');
    const [colRows] = await sequelize.query(
      `SELECT ${colSelects} FROM information_schema.columns WHERE table_schema = 'public'`,
    );
    const colRow = (((colRows as any[]) || [])[0] || {}) as Record<string, boolean>;
    REQUIRED_COLUMNS.forEach((q, i) => {
      if (!colRow[`k${i}`]) problems.push(`column ${q} missing (its ALTER did not run)`);
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
