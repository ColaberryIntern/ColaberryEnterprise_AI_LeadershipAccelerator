import { sequelize } from '../config/database';

// Gov build-story evidence (the student's completion hand-in for a Build story) — ensured via idempotent raw SQL,
// same pattern as ensureGovSourceBundleSchema.ts. Each statement is CREATE ... IF NOT EXISTS in its own try/catch,
// so a partial DB self-heals and re-running boot is a no-op.
//
// Additive only: creates 1 new table, never alters or drops anything existing. Columns must match
// backend/src/models/GovBuildStoryEvidence.ts EXACTLY.
//
// `status` defaults to 'submitted': a hand-in is the student's CLAIM, never a self-verification. Only a reviewer
// holding evidence.verify (which an associate_builder does not) moves it to verified/rejected — enforced at the
// route layer, with the default here as the backstop.
export async function ensureGovBuildStoryEvidenceSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS gov_build_story_evidence (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       delivery_project_id UUID NOT NULL REFERENCES delivery_projects(id) ON DELETE CASCADE,
       story_id VARCHAR(120) NOT NULL,
       canonical_req_id VARCHAR(120) NOT NULL,
       description TEXT NOT NULL,
       artifact_ref TEXT,
       status VARCHAR(20) NOT NULL DEFAULT 'submitted',
       submitted_by_identity_id UUID NOT NULL,
       submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       reviewed_by_identity_id UUID,
       reviewed_at TIMESTAMPTZ
     )`,
    `CREATE INDEX IF NOT EXISTS idx_gov_build_evidence_project_story ON gov_build_story_evidence (delivery_project_id, story_id)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] gov_build_story_evidence schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Gov build-story evidence schema ensured');
}
