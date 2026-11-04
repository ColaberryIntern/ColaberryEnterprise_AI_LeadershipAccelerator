import { sequelize } from '../config/database';

/**
 * Gov proposal review layer (Proposal Studio P3): immutable VERSIONS of each document, and the color-team GATE
 * reviews over them.
 *
 * - gov_proposal_document_versions: every save (agent draft or human edit) is a new, IMMUTABLE row carrying the
 *   content, the six check scores, the findings, the pass verdict and the real PDF page count. There is no update
 *   path — history is never rewritten. `gov_proposal_documents.current_version_id` points at the latest.
 * - gov_proposal_gate_reviews: the Pink/Red/Gold/White-Glove decisions. A gate opens only when the version passes
 *   the checks relevant to it; Gold needs a program-capable human and separation of duties; a new version after an
 *   approval reopens the later gates.
 *
 * Idempotent, additive raw SQL (same self-healing pattern as the other ensure* files). New tables FK to
 * gov_proposal_documents; the only existing-table change is an additive ADD COLUMN IF NOT EXISTS.
 */
export async function ensureGovProposalReviewSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS gov_proposal_document_versions (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       document_id UUID NOT NULL REFERENCES gov_proposal_documents(id) ON DELETE CASCADE,
       version INTEGER NOT NULL,
       content_html TEXT,
       sections_json JSONB NOT NULL DEFAULT '[]'::jsonb,
       author_kind VARCHAR(12) NOT NULL DEFAULT 'agent',
       author_identity_id UUID,
       change_summary TEXT,
       check_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
       findings JSONB NOT NULL DEFAULT '[]'::jsonb,
       passes BOOLEAN NOT NULL DEFAULT FALSE,
       page_count INTEGER,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    // One row per (document, version): the store computes the next version and inserts; it never updates a row.
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_gov_proposal_doc_versions_doc_version ON gov_proposal_document_versions (document_id, version)`,
    // The latest version pointer. Additive; self-healing.
    `ALTER TABLE gov_proposal_documents ADD COLUMN IF NOT EXISTS current_version_id UUID`,
    `CREATE TABLE IF NOT EXISTS gov_proposal_gate_reviews (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       document_id UUID NOT NULL REFERENCES gov_proposal_documents(id) ON DELETE CASCADE,
       gate VARCHAR(16) NOT NULL,
       version_id UUID REFERENCES gov_proposal_document_versions(id) ON DELETE SET NULL,
       status VARCHAR(12) NOT NULL DEFAULT 'pending',
       reviewer_identity_id UUID,
       note TEXT,
       decided_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    // One live review row per (document, gate): decisions update in place; a reopened gate flips back to pending.
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_gov_proposal_gate_reviews_doc_gate ON gov_proposal_gate_reviews (document_id, gate)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] gov_proposal_review schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Gov proposal review (versions + gates) schema ensured');
}
