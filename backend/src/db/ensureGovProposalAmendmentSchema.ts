import { sequelize } from '../config/database';

// Gov proposal amendment / message inbox entry — ensured via idempotent raw SQL, same pattern as
// ensureGovProposalResponseSchema.ts. Each statement is CREATE ... IF NOT EXISTS in its own try/catch.
//
// Additive only: creates 1 new table, never alters or drops anything existing. Columns must match
// backend/src/models/GovProposalAmendment.ts EXACTLY.
//
// An `amendment` entry carries `affects` (requirement ids) and, when recorded, flips affected reviewed/approved
// responses back to revision_required (invalidation). A `message` entry records context and invalidates nothing.
// UNIQUE (delivery_project_id, amendment_key) makes re-recording the same entry idempotent.
export async function ensureGovProposalAmendmentSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS gov_proposal_amendment (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       delivery_project_id UUID NOT NULL REFERENCES delivery_projects(id) ON DELETE CASCADE,
       amendment_key VARCHAR(160) NOT NULL,
       kind VARCHAR(20) NOT NULL DEFAULT 'amendment',
       summary TEXT NOT NULL,
       affects JSONB NOT NULL DEFAULT '[]'::jsonb,
       provenance TEXT,
       observed_at TIMESTAMPTZ,
       recorded_by_identity_id UUID,
       invalidated_count INTEGER NOT NULL DEFAULT 0,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_gov_proposal_amendment_project_key ON gov_proposal_amendment (delivery_project_id, amendment_key)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] gov_proposal_amendment schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Gov proposal amendment schema ensured');
}
