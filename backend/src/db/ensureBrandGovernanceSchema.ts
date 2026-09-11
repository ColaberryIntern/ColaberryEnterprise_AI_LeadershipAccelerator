import { sequelize } from '../config/database';

/**
 * brand_governance_rules — versioned governance per brand, as rows.
 *
 * WHY ROWS AND NOT A COLUMN ON brands. Rules are versioned: an approval was given under
 * version 3, and if the brand owner tightens the rules to version 4 the next day, the record
 * of what version 3 said must survive so the approval can still be understood. One JSONB
 * column on the brand would overwrite that. One row per version does not, and "current" is
 * simply the highest version for the brand.
 *
 * WHY JSONB FOR THE RULES THEMSELVES. The rule shape (see brandGovernance.ts) has eight
 * sections and will grow. Normalising each into its own table would mean a migration per new
 * rule type; the shape is validated by Zod at the write boundary and typed at the read
 * boundary, which is the contract, and the column is only ever read whole.
 *
 * Additive and idempotent, like every ensure* in this workstream, with a post-condition.
 */

export const BRAND_GOVERNANCE_SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS brand_governance_rules (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL,
     brand_id UUID NOT NULL REFERENCES brands(id),
     version INTEGER NOT NULL,
     rules JSONB NOT NULL,
     published_by VARCHAR(255),
     note TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  // One row per (brand, version). A duplicate version is a write bug, and the index makes it
  // a loud one rather than two rows that disagree about what version 4 says.
  `CREATE UNIQUE INDEX IF NOT EXISTS brand_governance_rules_brand_version_unique
     ON brand_governance_rules (brand_id, version)`,
  `CREATE INDEX IF NOT EXISTS idx_brand_governance_rules_tenant ON brand_governance_rules (tenant_id)`,
  // Brand-local time for the calendar and the composer's confirmation surface (T023/T025).
  // NULLABLE with the default applied in code (America/Chicago, the codebase convention),
  // never `NOT NULL DEFAULT` on the live brands table - the additive-DDL guard in this
  // workstream's parity suites forbids that form on purpose. IANA Area/Location only;
  // validated at the write boundary.
  `ALTER TABLE brands ADD COLUMN IF NOT EXISTS timezone VARCHAR(64)`,
];

const REQUIRED_COLUMNS = ['id', 'tenant_id', 'brand_id', 'version', 'rules', 'published_by', 'note', 'created_at'];

export interface BrandGovernanceSchemaResult {
  ok: boolean;
  missing: string[];
}

export async function ensureBrandGovernanceSchema(): Promise<BrandGovernanceSchemaResult> {
  for (const sql of BRAND_GOVERNANCE_SCHEMA_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] brand governance schema stmt skipped:', err?.message?.split('\n')[0]);
    }
  }

  let missing: string[] = [];
  try {
    const [rows]: any = await sequelize.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'brand_governance_rules'`,
    );
    const present = new Set((rows || []).map((r: any) => r.column_name));
    missing = REQUIRED_COLUMNS.filter((c) => !present.has(c));
    if (missing.length > 0) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error', service: 'backend', event: 'SchemaInvariantViolation',
        outcome: 'failure', error_class: 'SchemaInvariantViolation',
        context: {
          table: 'brand_governance_rules',
          missing_columns: missing,
          impact: 'brand governance rules cannot be stored or read; content checks will run with no rules and pass everything',
        },
      }));
    }
  } catch (err: any) {
    console.warn('[DB] brand governance schema verification failed:', err?.message);
  }

  console.log('[DB] Brand governance schema ensured');
  return { ok: missing.length === 0, missing };
}
