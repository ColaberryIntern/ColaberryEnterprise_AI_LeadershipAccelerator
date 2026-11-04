import { sequelize } from '../config/database';

/**
 * Gov build artifacts (Proposal Studio P4): screenshots captured from the VERIFIED build demo, tagged with the
 * requirement rows they prove, so they can be inserted into a proposal document as numbered figures. Our
 * discriminator is that the proof is a working software demo, not a stock image.
 *
 * - gov_build_artifacts: one row per captured screenshot. Idempotent per (story, commit) — a re-sync over the same
 *   verified commit never captures twice. file_path points at the PNG on the persistent uploads volume.
 * - gov_build_demo: the per-project demo URL (admin-set, https + host-allowlisted at the API) the capture navigates,
 *   plus optional per-story capture paths. One row per project.
 *
 * Idempotent, additive raw SQL; new tables FK to delivery_projects; no existing table altered.
 */
export async function ensureGovBuildArtifactSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS gov_build_artifacts (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       delivery_project_id UUID NOT NULL REFERENCES delivery_projects(id) ON DELETE CASCADE,
       story_id VARCHAR(120) NOT NULL,
       requirement_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
       commit_sha VARCHAR(64),
       file_path TEXT,
       sha256 VARCHAR(64),
       caption TEXT,
       status VARCHAR(16) NOT NULL DEFAULT 'captured',
       captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    // Idempotent per (story, commit): the capture enqueued on a verified transition never duplicates on a re-sync.
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_gov_build_artifacts_story_commit ON gov_build_artifacts (story_id, commit_sha)`,
    `CREATE INDEX IF NOT EXISTS idx_gov_build_artifacts_project ON gov_build_artifacts (delivery_project_id)`,
    `CREATE TABLE IF NOT EXISTS gov_build_demo (
       delivery_project_id UUID PRIMARY KEY REFERENCES delivery_projects(id) ON DELETE CASCADE,
       demo_url TEXT,
       capture_root TEXT,
       story_capture_paths JSONB NOT NULL DEFAULT '{}'::jsonb,
       updated_by_identity_id UUID,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] gov_build_artifact schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Gov build artifact schema ensured');
}
