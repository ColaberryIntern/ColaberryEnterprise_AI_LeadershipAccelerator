import { sequelize } from '../config/database';

// Gov AI vetting (the saved result of the automatic checks on one solicitation ZIP): idempotent raw SQL, the same
// pattern as ensureGovExtractionJobSchema.ts. Every statement is IF NOT EXISTS in its own try/catch, so a partial DB
// self-heals and re-running boot is a no-op.
//
// Additive only: creates 1 new table, never alters or drops anything existing. Columns must match
// backend/src/models/GovAiVetting.ts EXACTLY. status and verdict are plain VARCHARs, so no enum migration is needed.
export const GOV_AI_VETTING_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS gov_ai_vettings (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL,
     qualification_key VARCHAR(80) NOT NULL,
     sha256 VARCHAR(64) NOT NULL,
     status VARCHAR(16) NOT NULL DEFAULT 'queued',
     attempts INTEGER NOT NULL DEFAULT 0,
     verdict VARCHAR(16),
     reason TEXT,
     reason_quote TEXT,
     coverage_pct INTEGER,
     fit_json JSONB,
     summary_json JSONB,
     questions_json JSONB,
     opportunity_json JSONB,
     error_class VARCHAR(60),
     last_uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     completed_at TIMESTAMPTZ
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_gov_ai_vettings_zip ON gov_ai_vettings (tenant_id, qualification_key, sha256)`,
  `CREATE INDEX IF NOT EXISTS idx_gov_ai_vettings_status ON gov_ai_vettings (status)`,
];

export async function ensureGovAiVettingSchema(): Promise<void> {
  for (const sql of GOV_AI_VETTING_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] gov_ai_vettings schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Gov AI vetting schema ensured');
}
