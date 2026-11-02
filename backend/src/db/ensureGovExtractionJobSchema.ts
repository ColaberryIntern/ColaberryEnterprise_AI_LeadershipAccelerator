import { sequelize } from '../config/database';

// Gov extraction jobs (the background requirements-extraction queue for large solicitation ZIPs) — ensured via
// idempotent raw SQL, same pattern as ensureGovSourceBundleSchema.ts (the large prod model graph makes
// sync({alter:true}) hit pre-existing index conflicts). Every statement is CREATE ... IF NOT EXISTS in its own
// try/catch, so a partial DB self-heals and re-running boot is a no-op.
//
// Additive only: creates 1 new table, never alters or drops anything existing. Columns must match
// backend/src/models/GovExtractionJob.ts EXACTLY.
//
// status is a plain VARCHAR (not a PG enum) so the ensure stays a pure CREATE-IF-NOT-EXISTS with no enum-type
// migration. The (tenant_id, qualification_key) index backs both the in-flight dedup lookup and the scoped
// status read; tenant_id is a plain UUID (no FK) to match how the other gov tables carry tenant_id.
export async function ensureGovExtractionJobSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS gov_extraction_jobs (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       tenant_id UUID NOT NULL,
       qualification_key VARCHAR(80) NOT NULL,
       source_bundle_id UUID NOT NULL,
       sha256 VARCHAR(64) NOT NULL,
       status VARCHAR(16) NOT NULL DEFAULT 'queued',
       result_json JSONB,
       error_message TEXT,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       completed_at TIMESTAMPTZ
     )`,
    `CREATE INDEX IF NOT EXISTS idx_gov_extraction_jobs_key ON gov_extraction_jobs (tenant_id, qualification_key)`,
    `CREATE INDEX IF NOT EXISTS idx_gov_extraction_jobs_status ON gov_extraction_jobs (status)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] gov_extraction_jobs schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Gov extraction job schema ensured');
}
