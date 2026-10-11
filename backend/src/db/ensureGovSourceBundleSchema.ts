import { sequelize } from '../config/database';

// Gov source bundles (the private solicitation-ZIP evidence of record) — ensured via idempotent raw SQL, same
// pattern as ensureAgentAttachmentSchema.ts (the large prod model graph makes sync({alter:true}) hit pre-existing
// index conflicts). Every statement is CREATE ... IF NOT EXISTS in its own try/catch, so a partial DB self-heals
// and re-running boot is a no-op.
//
// Additive only: creates 1 new table, never alters or drops anything existing. Columns must match
// backend/src/models/GovSourceBundle.ts EXACTLY.
//
// The unique index on (tenant_id, qualification_key, sha256) is what makes re-attesting idempotent: attesting the
// same solicitation ZIP twice returns the SAME bundle row instead of writing a second file. Scoped by tenant so
// one tenant's bundle can never resolve to another's. tenant_id is a plain UUID (no FK) to match how the gov
// qualification tables carry tenant_id — additive and resilient if the tenants table name ever differs by env.
export async function ensureGovSourceBundleSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS gov_source_bundles (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       tenant_id UUID NOT NULL,
       qualification_key VARCHAR(80) NOT NULL,
       sha256 VARCHAR(64) NOT NULL,
       mime VARCHAR(100) NOT NULL,
       byte_size INTEGER NOT NULL,
       filename VARCHAR(255) NOT NULL,
       stored_name VARCHAR(255) NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_gov_source_bundles_key_hash ON gov_source_bundles (tenant_id, qualification_key, sha256)`,
    `CREATE INDEX IF NOT EXISTS idx_gov_source_bundles_key ON gov_source_bundles (tenant_id, qualification_key)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] gov_source_bundles schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Gov source bundle schema ensured');
}
