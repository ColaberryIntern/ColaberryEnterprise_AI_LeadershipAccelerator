import { sequelize } from '../config/database';

// Gov proposal response (the authored answer to one established requirement) — ensured via idempotent raw SQL,
// same pattern as ensureGovBuildStoryAssignmentSchema.ts. Each statement is CREATE ... IF NOT EXISTS in its own
// try/catch, so a partial DB self-heals and re-running boot is a no-op.
//
// Additive only: creates 1 new table, never alters or drops anything existing. Columns must match
// backend/src/models/GovProposalResponse.ts EXACTLY.
//
// `status` defaults to 'draft' (authored, not yet reviewed). The review lifecycle (draft -> reviewed -> approved,
// with revision_required as the kickback) is advanced only by explicit human review; a material amendment to the
// requirement also flips an affected reviewed/approved response back to revision_required. The UNIQUE
// (delivery_project_id, requirement_id) is the idempotency key: one response per requirement, re-save upserts.
export async function ensureGovProposalResponseSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS gov_proposal_response (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       delivery_project_id UUID NOT NULL REFERENCES delivery_projects(id) ON DELETE CASCADE,
       requirement_id VARCHAR(120) NOT NULL,
       content TEXT NOT NULL DEFAULT '',
       status VARCHAR(20) NOT NULL DEFAULT 'draft',
       figures JSONB NOT NULL DEFAULT '[]'::jsonb,
       authored_by_identity_id UUID,
       reviewed_by_identity_id UUID,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_gov_proposal_response_project_req ON gov_proposal_response (delivery_project_id, requirement_id)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] gov_proposal_response schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Gov proposal response schema ensured');
}
