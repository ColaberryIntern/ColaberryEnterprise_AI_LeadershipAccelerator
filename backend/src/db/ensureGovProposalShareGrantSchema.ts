import { sequelize } from '../config/database';

// Gov proposal share grant (P5 Team & access) - ensured via idempotent raw SQL, same pattern as
// ensureGovProposalResponseSchema.ts. Additive only: creates 1 table, never alters/drops anything existing.
// Columns must match backend/src/models/GovProposalShareGrant.ts EXACTLY. The UNIQUE (delivery_project_id,
// member_identity_id) is the idempotency key: one grant per member per project, re-share upserts.
export async function ensureGovProposalShareGrantSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS gov_proposal_share_grant (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       delivery_project_id UUID NOT NULL REFERENCES delivery_projects(id) ON DELETE CASCADE,
       member_identity_id UUID NOT NULL,
       level VARCHAR(20) NOT NULL DEFAULT 'none',
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_gov_proposal_share_grant_project_member ON gov_proposal_share_grant (delivery_project_id, member_identity_id)`,
  ];
  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] gov_proposal_share_grant schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Gov proposal share grant schema ensured');
}
