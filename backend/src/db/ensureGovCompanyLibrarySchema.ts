import { sequelize } from '../config/database';

/**
 * Gov company library (Proposal Studio P5): the tenant's reusable, HUMAN-APPROVED facts, references and key
 * personnel. Answering a proposal question saves to the library (after human confirmation) so the same question is
 * never asked twice, and the grounding builder feeds ONLY approved rows to the drafter — never an unapproved guess.
 *
 * Tenant-scoped (tenant_id on every row). Idempotent, additive raw SQL; new tables; no existing table altered.
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
