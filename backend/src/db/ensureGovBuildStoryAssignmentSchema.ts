import { sequelize } from '../config/database';

// Gov build-story assignment (the operator's assignment of a Build story to a student builder) — ensured via
// idempotent raw SQL, same pattern as ensureGovBuildStoryEvidenceSchema.ts. Each statement is CREATE ... IF NOT
// EXISTS in its own try/catch, so a partial DB self-heals and re-running boot is a no-op.
//
// Additive only: creates 1 new table, never alters or drops anything existing. Columns must match
// backend/src/models/GovBuildStoryAssignment.ts EXACTLY.
//
// The UNIQUE (delivery_project_id, story_id) is the idempotency key: exactly one assignment per story, so a
// re-assign upserts the same row rather than stacking duplicates. Assignment NEVER confers a built/verified state —
// evidence + reviewer verification remain separate, gated acts.
export async function ensureGovBuildStoryAssignmentSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS gov_build_story_assignment (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       delivery_project_id UUID NOT NULL REFERENCES delivery_projects(id) ON DELETE CASCADE,
       story_id VARCHAR(120) NOT NULL,
       canonical_req_id VARCHAR(120) NOT NULL,
       assignee_identity_id UUID NOT NULL,
       assigned_by_identity_id UUID,
       assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_gov_build_assignment_project_story ON gov_build_story_assignment (delivery_project_id, story_id)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] gov_build_story_assignment schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Gov build-story assignment schema ensured');
}
