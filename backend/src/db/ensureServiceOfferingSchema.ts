/**
 * ensureServiceOfferingSchema — Colaberry's own service catalog, additive.
 *
 * The set of services/capabilities the company offers, so a government opportunity can later be matched against
 * them (the matcher is a separate, advisory feature; this table is just the store). Tenant-scoped and owned by
 * Enterprise. A service is RETIRED (status flip), never hard-deleted, so history and any past match references
 * stay intact. Every CREATE is `IF NOT EXISTS`; the table FKs to nothing and alters no existing table — as safe
 * as a new nullable column.
 *
 *   service_offerings — one row per offering: name/description/category, keywords + NAICS + PSC codes (JSONB string
 *                       arrays used by the deterministic matcher), free-text past_performance, an internal owner,
 *                       and status (active|retired).
 */
import { sequelize } from '../config/database';

export const REQUIRED_TABLES: ReadonlyArray<string> = ['service_offerings'];

/** Every DDL statement, hoisted so a test can assert the whole set is additive (CREATE ... IF NOT EXISTS only). */
export const SERVICE_OFFERING_STATEMENTS: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS service_offerings (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL,
     organization_id UUID,
     name TEXT NOT NULL,
     description TEXT,
     category TEXT,
     keywords_json JSONB,
     naics_codes_json JSONB,
     psc_codes_json JSONB,
     past_performance TEXT,
     owner TEXT,
     status TEXT NOT NULL DEFAULT 'active',
     created_by TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  // The catalog is read by (tenant, status) — "the active services for this team" is the hot path (the matcher
  // and the list screen both use it), so index exactly that.
  `CREATE INDEX IF NOT EXISTS idx_service_offering_tenant_status
     ON service_offerings (tenant_id, status)`,
];

export async function ensureServiceOfferingSchema(): Promise<void> {
  for (const sql of SERVICE_OFFERING_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] service offering schema stmt skipped:', err?.message);
    }
  }
  await assertServiceOfferingSchema();
}

/** Post-condition: name the table if it failed to appear (bool_or introspection — see ensureGovQualificationSchema). */
export async function assertServiceOfferingSchema(): Promise<boolean> {
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
    console.log('[DB] service offering schema ensured');
    return true;
  }
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend',
    event: 'service_offering_schema_invariant_violated', outcome: 'failure',
    error_class: 'SchemaInvariantViolation',
    context: { problems, impact: 'Service catalog reads/writes will fail.', remedy: 'Run the CREATE statements in ensureServiceOfferingSchema.' },
  }));
  return false;
}
