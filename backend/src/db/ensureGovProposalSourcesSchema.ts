import { sequelize } from '../config/database';

/**
 * Gov Proposal Studio source-document library (P-SRC): per-PROJECT reference documents a human uploads, split into
 * embedded chunks, so the proposal-generation agent can retrieve the RELEVANT parts of a long source (a stakeholder
 * briefing, a past proposal, a capability statement) per section, rather than being handed the whole file or nothing.
 *
 * Deliberately PROJECT-scoped (project_id on every row), not tenant-wide like the company fact library: a source
 * uploaded for one pursuit grounds only that pursuit. A document grounds nothing until a human sets approved=true,
 * preserving the platform invariant that only human-approved material reaches the drafter.
 *
 * Embeddings reuse the existing pgvector column shape (vector(1536), nullable when the embedding proxy is down) that
 * intelligence_memory already relies on. Idempotent, additive raw SQL; new tables only; no existing table altered.
 */
export async function ensureGovProposalSourcesSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS gov_proposal_source_documents (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       project_id UUID NOT NULL,
       tenant_id UUID NOT NULL,
       name TEXT NOT NULL,
       mime_type TEXT,
       source TEXT,
       status TEXT NOT NULL DEFAULT 'ready',
       approved BOOLEAN NOT NULL DEFAULT FALSE,
       approved_by_identity_id UUID,
       uploaded_by_identity_id UUID,
       extracted_chars INTEGER NOT NULL DEFAULT 0,
       truncated BOOLEAN NOT NULL DEFAULT FALSE,
       chunk_count INTEGER NOT NULL DEFAULT 0,
       embedded_count INTEGER NOT NULL DEFAULT 0,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_gov_proposal_source_documents_project ON gov_proposal_source_documents (project_id)`,
    `CREATE TABLE IF NOT EXISTS gov_proposal_source_chunks (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       document_id UUID NOT NULL REFERENCES gov_proposal_source_documents (id) ON DELETE CASCADE,
       project_id UUID NOT NULL,
       tenant_id UUID NOT NULL,
       chunk_index INTEGER NOT NULL,
       text TEXT NOT NULL,
       token_estimate INTEGER NOT NULL DEFAULT 0,
       embedding vector(1536),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_gov_proposal_source_chunks_project ON gov_proposal_source_chunks (project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_gov_proposal_source_chunks_document ON gov_proposal_source_chunks (document_id)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] gov_proposal_sources schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Gov proposal sources schema ensured');
}
