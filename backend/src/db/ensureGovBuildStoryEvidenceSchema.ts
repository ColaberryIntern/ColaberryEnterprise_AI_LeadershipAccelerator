import { sequelize } from '../config/database';

// Gov build-story evidence (the student's completion hand-in for a Build story) — ensured via idempotent raw SQL,
// same pattern as ensureGovSourceBundleSchema.ts. Each statement is CREATE ... IF NOT EXISTS in its own try/catch,
// so a partial DB self-heals and re-running boot is a no-op.
//
// Additive only: creates/extends 1 table, never drops anything existing. Columns must match
// backend/src/models/GovBuildStoryEvidence.ts EXACTLY. The `ADD COLUMN IF NOT EXISTS` statements are the
// gov-build-cockpit extension (a commit in the build repo that cites a story's requirement key files a `github_push`
// evidence row); they self-heal an older table on boot, same as the column-add in ensureGovProposalResponseSchema.ts.
//
// `status` defaults to 'submitted': a hand-in (or a matched commit) is a CLAIM, never a self-verification. Only a
// reviewer holding evidence.verify (which an associate_builder does not) moves it to verified/rejected — enforced at
// the route layer, with the default here as the backstop.
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
    // Gov build cockpit: where a hand-in came from, and the commit it matched (null for a manual student hand-in).
    `ALTER TABLE gov_build_story_evidence ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'student'`,
    `ALTER TABLE gov_build_story_evidence ADD COLUMN IF NOT EXISTS commit_sha VARCHAR(64)`,
    // One evidence row per (story, commit): a redelivered push (GitHub retries) must never double-file. Partial so
    // the many NULL commit_sha of manual hand-ins never collide (mirrors github_connections_unique_project).
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_gov_build_evidence_story_commit ON gov_build_story_evidence (story_id, commit_sha) WHERE commit_sha IS NOT NULL`,
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
