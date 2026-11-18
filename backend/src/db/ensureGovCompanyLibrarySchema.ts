import { sequelize } from '../config/database';

/**
 * Gov company library (Proposal Studio P5): the tenant's reusable, HUMAN-APPROVED facts, references and key
 * personnel. Answering a proposal question saves to the library (after human confirmation) so the same question is
 * never asked twice, and the grounding builder feeds ONLY approved rows to the drafter — never an unapproved guess.
 *
 * Tenant-scoped (tenant_id on every row). Idempotent, additive raw SQL: new tables and `ADD COLUMN IF NOT EXISTS`
 * only, never a destructive alter.
 */
export async function ensureGovCompanyLibrarySchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS gov_company_facts (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       tenant_id UUID NOT NULL,
       key TEXT NOT NULL,
       value TEXT NOT NULL,
       source TEXT,
       approved BOOLEAN NOT NULL DEFAULT FALSE,
       approved_by_identity_id UUID,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_gov_company_facts_tenant ON gov_company_facts (tenant_id)`,
    // Dossier portal (Phase 2): an optional category so the fill-UI can group facts by the proposal's demand
    // buckets (registrations, reps_certs, socioeconomic, financials, quality_certs, pricing, general). Additive and
    // nullable; the grounder still reads only key/value, so existing facts are unaffected.
    `ALTER TABLE gov_company_facts ADD COLUMN IF NOT EXISTS category TEXT`,
    `CREATE TABLE IF NOT EXISTS gov_company_references (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       tenant_id UUID NOT NULL,
       client TEXT NOT NULL,
       contact TEXT,
       phone TEXT,
       email TEXT,
       contract_value TEXT,
       dates TEXT,
       scope TEXT,
       approved BOOLEAN NOT NULL DEFAULT FALSE,
       approved_by_identity_id UUID,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_gov_company_references_tenant ON gov_company_references (tenant_id)`,
    `CREATE TABLE IF NOT EXISTS gov_company_personnel (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       tenant_id UUID NOT NULL,
       name TEXT NOT NULL,
       role TEXT,
       resume_html TEXT,
       approved BOOLEAN NOT NULL DEFAULT FALSE,
       approved_by_identity_id UUID,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_gov_company_personnel_tenant ON gov_company_personnel (tenant_id)`,
    // Subject axis (CC-20261117-q8k3): what a record is ABOUT (reporting, recruiting, data work, ...), so a
    // reference is cited only for a matching-subject requirement and never interchanged. Additive, nullable; an
    // untagged row stays universally eligible (filterReferencesBySubject is default-open), so nothing regresses.
    `ALTER TABLE gov_company_references ADD COLUMN IF NOT EXISTS subject TEXT`,
    `ALTER TABLE gov_company_personnel ADD COLUMN IF NOT EXISTS subject TEXT`,
    `ALTER TABLE gov_company_facts ADD COLUMN IF NOT EXISTS subject TEXT`,
    // Growable requirement taxonomy (CC-20261117-q8k3): the built-in groups live in code (needGrouping.GROUP_DEFS);
    // this table holds categories the AI classifier PROPOSES or an admin ADDS when a new kind of demand shows up, so
    // the taxonomy grows instead of dumping everything new into "General". Pending rows never reach the drafter until
    // an admin activates them. Tenant-scoped, one row per slug per tenant.
    `CREATE TABLE IF NOT EXISTS gov_requirement_categories (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       tenant_id UUID NOT NULL,
       slug TEXT NOT NULL,
       label TEXT NOT NULL,
       kind TEXT NOT NULL DEFAULT 'fact',
       subject TEXT,
       status TEXT NOT NULL DEFAULT 'pending',
       source TEXT NOT NULL DEFAULT 'ai',
       confidence DOUBLE PRECISION,
       example_ask TEXT,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_gov_requirement_categories_tenant_slug ON gov_requirement_categories (tenant_id, slug)`,
    `CREATE INDEX IF NOT EXISTS idx_gov_requirement_categories_tenant_status ON gov_requirement_categories (tenant_id, status)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] gov_company_library schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Gov company library schema ensured');
}
