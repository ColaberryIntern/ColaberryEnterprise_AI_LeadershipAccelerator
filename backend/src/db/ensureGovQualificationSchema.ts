/**
 * ensureGovQualificationSchema — the Enterprise-owned government qualification model (Phase 2), additive.
 *
 * Enterprise (not Opportunity Pulse) owns the qualification decision, the bidding entity, the immutable source
 * snapshot the decision was made against, the separate build authorization, and the canonical-id -> existing
 * gov project alias. Every CREATE is `IF NOT EXISTS`; FKs point only at existing tables (delivery_projects) and
 * the new tables created earlier in this same statement list. No existing table is altered — new tables are as
 * safe as new nullable columns. Immutability + race-safe approval come from a UNIQUE(canonical, version) index
 * plus fork-on-edit (mirrors contract_process_documents / factoryApproval), NOT a status PATCH.
 *
 *   gov_qualifications       — the Enterprise qualification record: decision, reviewer, rationale, evidence,
 *                              effort cap, reassessment conditions, the evaluated requirements, and the IMMUTABLE
 *                              OP source snapshot + version the decision was bound to. Versioned + content-hashed.
 *   build_authorizations     — a SEPARATE authorization (named approver + scope + rationale + resource limit)
 *                              required before any solution-build work. Distinct from the qualification reviewer.
 *   gov_opportunity_aliases  — canonicalOpportunityId (op:gov:<hex>) -> an existing gov-<uuid> delivery project,
 *                              recorded as its own fact so the project is never renamed or auto-qualified.
 */
import { sequelize } from '../config/database';

export const REQUIRED_TABLES: ReadonlyArray<string> = [
  'gov_qualifications',
  'build_authorizations',
  'gov_opportunity_aliases',
];

/**
 * Every DDL statement, hoisted so a test can assert the whole set is additive (only CREATE ... IF NOT EXISTS;
 * never ALTER/DROP an existing table) and that FKs point only at existing/earlier tables.
 */
export const GOV_QUALIFICATION_STATEMENTS: ReadonlyArray<string> = [
    // The Enterprise-owned qualification record. Spine table: it carries its own tenant_id/organization_id
    // because it is listed and authorized directly (not only reachable through a delivery_projects join).
    // delivery_project_id is NULLABLE: an opportunity can be qualified before (or without) an existing gov
    // project is aliased to it. The immutable OP source snapshot + version the decision was bound to lives here.
    `CREATE TABLE IF NOT EXISTS gov_qualifications (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       tenant_id UUID NOT NULL,
       organization_id UUID,
       bidding_entity TEXT NOT NULL,
       canonical_opportunity_id TEXT NOT NULL,
       delivery_project_id UUID REFERENCES delivery_projects(id) ON DELETE SET NULL,
       reviewer_identity_id TEXT,
       decision TEXT NOT NULL DEFAULT 'pending_review',
       rationale TEXT,
       evidence_json JSONB,
       effort_cap TEXT,
       reassessment_conditions TEXT,
       requirements_json JSONB,
       source_snapshot JSONB,
       source_snapshot_version INTEGER,
       source_available BOOLEAN,
       status TEXT NOT NULL DEFAULT 'active',
       version INTEGER NOT NULL DEFAULT 1,
       content_sha256 VARCHAR(64),
       superseded_by_id UUID,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
    // Race-safe approval + separate-entity pursuits: the qualification "thread" is (canonical opportunity,
    // bidding entity), so two bidding entities (e.g. Colaberry vs AI Flotation) may each qualify the SAME
    // canonical opportunity as distinct records, while two racers on ONE thread both trying to write version
    // N+1 are rejected by this unique index (the guard contract_process_documents uses). bidding_entity is
    // NOT NULL precisely so it can be part of this key.
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_gov_qual_thread_version
       ON gov_qualifications (canonical_opportunity_id, bidding_entity, version)`,
    `CREATE INDEX IF NOT EXISTS idx_gov_qual_tenant ON gov_qualifications (tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_gov_qual_delivery ON gov_qualifications (delivery_project_id)`,

    // Build authorization: SEPARATE from pursuit approval. A pursuit approval permits only the approved
    // proposal/RFI effort; a named approver + scope + resource limit is required here before any solution-build
    // work. approver_identity_id is distinct from the qualification reviewer.
    `CREATE TABLE IF NOT EXISTS build_authorizations (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       gov_qualification_id UUID REFERENCES gov_qualifications(id) ON DELETE SET NULL,
       delivery_project_id UUID NOT NULL REFERENCES delivery_projects(id) ON DELETE CASCADE,
       approver_identity_id TEXT NOT NULL,
       scope TEXT NOT NULL,
       rationale TEXT,
       resource_limit TEXT NOT NULL,
       revoked_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_build_auth_delivery ON build_authorizations (delivery_project_id)`,

    // canonicalOpportunityId -> existing gov delivery project. Recorded as its own fact (mirrors
    // delivery_project_source_links): the project is NEVER renamed or auto-qualified by this link. UNIQUE on the
    // canonical id so one opportunity maps to one project.
    `CREATE TABLE IF NOT EXISTS gov_opportunity_aliases (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       delivery_project_id UUID NOT NULL REFERENCES delivery_projects(id) ON DELETE CASCADE,
       canonical_opportunity_id TEXT NOT NULL,
       linked_by_identity_id TEXT,
       link_reason TEXT NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_gov_opp_alias_canonical
       ON gov_opportunity_aliases (canonical_opportunity_id)`,
    `CREATE INDEX IF NOT EXISTS idx_gov_opp_alias_delivery
       ON gov_opportunity_aliases (delivery_project_id)`,
];

export async function ensureGovQualificationSchema(): Promise<void> {
  for (const sql of GOV_QUALIFICATION_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] gov qualification schema stmt skipped:', err?.message);
    }
  }
  await assertGovQualificationSchema();
}

/** Post-condition: name any table that failed to appear (bool_or introspection — see ensureContractTrackSchema). */
export async function assertGovQualificationSchema(): Promise<boolean> {
  const problems: string[] = [];
  try {
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
    console.log('[DB] gov qualification schema ensured');
    return true;
  }
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend',
    event: 'gov_qualification_schema_invariant_violated', outcome: 'failure',
    error_class: 'SchemaInvariantViolation',
    context: { problems, impact: 'Gov qualification reads/writes will fail.', remedy: 'Run the CREATE TABLE statements in ensureGovQualificationSchema.' },
  }));
  return false;
}
