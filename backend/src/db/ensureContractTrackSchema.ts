/**
 * ensureContractTrackSchema — the AI Project Factory's two-track contract model, additive.
 *
 * A contract project's parent is an existing `delivery_projects` row (Ali's decision, the
 * domain already built for government/commercial contracts). This adds only NEW tables that
 * FK to `delivery_projects` (and, for the solution-build link, to `projects`). No existing
 * table is altered; new tables are as safe as new nullable columns.
 *
 *   contract_tracks            — the Proposal and Solution-build workstreams of a contract
 *   contract_requirements      — the compliance matrix (canonical requirement ids, evidence state)
 *   requirement_proposal_sections  — requirement ↔ proposal section (traceability)
 *   requirement_solution_stories   — requirement ↔ student build story (traceability)
 *   contract_process_documents — the versioned decomposition document (processes/roles/
 *                                assignments/edges as JSONB) + content hash + approval state,
 *                                mirroring how build_plans stores plan_json + version + sha256
 *
 * Every CREATE is `IF NOT EXISTS`; the loop is warn-only and a post-condition assert names any
 * table that failed to appear, exactly like ensureProjectApprovalSchema.
 */
import { sequelize } from '../config/database';

export const REQUIRED_TABLES: ReadonlyArray<string> = [
  'contract_tracks',
  'contract_requirements',
  'requirement_proposal_sections',
  'requirement_solution_stories',
  'contract_process_documents',
];

/**
 * Every DDL statement, hoisted so a test can assert the whole set is additive (only
 * CREATE ... IF NOT EXISTS; never ALTER or DROP an existing table) and that FKs point only at
 * existing tables (delivery_projects, projects), never re-shaping them.
 */
export const CONTRACT_TRACK_STATEMENTS: ReadonlyArray<string> = [
    // The two workstreams. A solution_build track points at the intern's student build via
    // solution_student_project_id (the projects.id reached through DeliveryProjectSourceLink).
    `CREATE TABLE IF NOT EXISTS contract_tracks (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       delivery_project_id UUID NOT NULL REFERENCES delivery_projects(id) ON DELETE CASCADE,
       track_type TEXT NOT NULL,
       status TEXT,
       owner_identity_id TEXT,
       solution_student_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_contract_tracks_delivery ON contract_tracks (delivery_project_id)`,

    // The compliance matrix. canonical_req_id is the id shared across both tracks; it is the
    // traceability spine. evidence_state carries "never present planned as delivered".
    `CREATE TABLE IF NOT EXISTS contract_requirements (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       delivery_project_id UUID NOT NULL REFERENCES delivery_projects(id) ON DELETE CASCADE,
       canonical_req_id TEXT NOT NULL,
       statement TEXT,
       kind TEXT,
       priority TEXT,
       tracks JSONB,
       source_document TEXT,
       amendment_version TEXT,
       section TEXT,
       extracted_text TEXT,
       interpretation TEXT,
       human_confirmed BOOLEAN,
       evidence_state TEXT,
       source_evidence JSONB,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_req_canonical
       ON contract_requirements (delivery_project_id, canonical_req_id)`,

    // Requirement ↔ proposal section.
    `CREATE TABLE IF NOT EXISTS requirement_proposal_sections (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       delivery_project_id UUID NOT NULL REFERENCES delivery_projects(id) ON DELETE CASCADE,
       canonical_req_id TEXT NOT NULL,
       proposal_section_ref TEXT NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_req_prop_sections_req
       ON requirement_proposal_sections (delivery_project_id, canonical_req_id)`,

    // Requirement ↔ solution build story (the STORY-NNN on the student build).
    `CREATE TABLE IF NOT EXISTS requirement_solution_stories (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       delivery_project_id UUID NOT NULL REFERENCES delivery_projects(id) ON DELETE CASCADE,
       canonical_req_id TEXT NOT NULL,
       student_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
       student_task_story_id TEXT NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_req_sol_stories_req
       ON requirement_solution_stories (delivery_project_id, canonical_req_id)`,

    // The decomposition document: processes/roles/assignments/edges/allocation/role_map as a
    // JSONB blob, versioned and content-hashed like build_plans. Approval columns live here so
    // the whole document is approved as a transaction (see factoryApproval / T6). Immutable per
    // (delivery_project_id, track_type, version): a regeneration is a new version, never an
    // overwrite.
    `CREATE TABLE IF NOT EXISTS contract_process_documents (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       delivery_project_id UUID NOT NULL REFERENCES delivery_projects(id) ON DELETE CASCADE,
       track_type TEXT NOT NULL,
       version INTEGER NOT NULL DEFAULT 1,
       doc_json JSONB NOT NULL,
       content_sha256 VARCHAR(64),
       status TEXT NOT NULL DEFAULT 'draft',
       approval_level TEXT,
       enrichment_status TEXT,
       superseded_by_id UUID,
       approved_at TIMESTAMPTZ,
       approved_by TEXT,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_proc_doc_version
       ON contract_process_documents (delivery_project_id, track_type, version)`,
];

export async function ensureContractTrackSchema(): Promise<void> {
  for (const sql of CONTRACT_TRACK_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] contract track schema stmt skipped:', err?.message);
    }
  }
  await assertContractTrackSchema();
}

/**
 * Post-condition. If a table the factory reads is missing but the code shipped, factory reads
 * 500; say so loudly at boot rather than discovering it from a user.
 */
export async function assertContractTrackSchema(): Promise<boolean> {
  const problems: string[] = [];
  try {
    // Aggregate existence per table in SQL and read ONE row back. MEASURED in production
    // 2026-09-21: this app's sequelize returns a single-column SELECT (e.g. `SELECT table_name`)
    // as RAW ARRAYS, not `{ table_name }` objects (the row keys were `["0"]`), so both a
    // `= ANY($names)` bind AND a JS-side membership filter reported all five tables missing
    // while they demonstrably existed — logging a bogus "contract reads will fail" error every
    // boot. A one-row `bool_or` result is an object keyed by the aliases and sidesteps the
    // array-vs-object quirk. REQUIRED_TABLES are fixed constants, so the interpolation is not
    // injectable.
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
    console.log('[DB] contract track schema ensured');
    return true;
  }
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend',
    event: 'contract_track_schema_invariant_violated', outcome: 'failure',
    error_class: 'SchemaInvariantViolation',
    context: { problems, impact: 'AI Project Factory contract reads will fail.', remedy: 'Run the CREATE TABLE statements in ensureContractTrackSchema.' },
  }));
  return false;
}
