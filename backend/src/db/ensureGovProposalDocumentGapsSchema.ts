import { sequelize } from '../config/database';

// Gov proposal document gaps (gov_proposal_document_gaps) — P1 of the Gov Proposal Studio. A typed GAP the draft
// could not answer from grounded facts: the AI inserts a question instead of inventing the fact (the no-fabrication
// rail). `resolution` is how a human closed it — `answered` with a real answer, or `filler` with a placeholder that
// is visibly flagged and BLOCKS export/submission server-side until replaced; `open` is unanswered. Gaps used to
// live only on response slots (responseSlots.ts `ResponseGap`); P1 moves them onto the document that owns the
// section, so the named documents are the single proposal model.
//
// Idempotent raw SQL, the same additive pattern as the other ensure*Schema.ts files: one statement per element,
// each in its own try/catch so a partial DB self-heals and re-running boot is a no-op. A single additive NEW table
// that FKs to delivery_projects; no existing table is altered here.
//
// `source_gap_id` records the original `ResponseGap.id` a row was migrated from, so the one-off slot→document
// migration (scripts/migrateProposalSlotsToDocumentSections.ts) is idempotent: ON CONFLICT on
// (delivery_project_id, source_gap_id) DO NOTHING means re-running it never duplicates a migrated gap.
export async function ensureGovProposalDocumentGapsSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS gov_proposal_document_gaps (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       delivery_project_id UUID NOT NULL REFERENCES delivery_projects(id) ON DELETE CASCADE,
       doc_key VARCHAR(60) NOT NULL,
       section_key TEXT NOT NULL,
       question TEXT NOT NULL,
       why TEXT,
       suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
       resolution VARCHAR(16) NOT NULL DEFAULT 'open',
       answer TEXT,
       answer_ref TEXT,
       source_gap_id TEXT,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       resolved_by UUID,
       resolved_at TIMESTAMPTZ
     )`,
    `CREATE INDEX IF NOT EXISTS idx_gov_proposal_document_gaps_project_doc ON gov_proposal_document_gaps (delivery_project_id, doc_key)`,
    // Idempotency anchor for the slot->document migration. Partial so hand-created gaps (no source) are unconstrained.
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_gov_proposal_document_gaps_source ON gov_proposal_document_gaps (delivery_project_id, source_gap_id) WHERE source_gap_id IS NOT NULL`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] gov_proposal_document_gaps schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Gov proposal document gaps schema ensured');
}
