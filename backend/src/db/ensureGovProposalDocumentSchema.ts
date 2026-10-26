import { sequelize } from '../config/database';

// Gov proposal documents (gov_proposal_documents) — the cockpit v2 Proposal workstream: one row per NAMED document a
// bid must submit (Cover Letter, Technical Proposal, Price/Cost Proposal, …), derived from the established
// requirements (see services/factory/proposal/govProposalDocuments.ts) and synced into this table so its authored
// state (draft content, status, review comments, acceptance) survives across re-derivation.
//
// Idempotent raw SQL, same additive pattern as ensureGovProposalResponseSchema.ts: one CREATE ... IF NOT EXISTS per
// statement, each in its own try/catch, so a partial DB self-heals and re-running boot is a no-op. A single additive
// NEW table that FKs to delivery_projects; no existing table is altered.
//
// status lifecycle: not_started → drafting → drafted → (accepted | changes_requested → drafting …). A document is
// `accepted` ONLY by a reviewer; the AI drafting it NEVER sets accepted. `admin_only` (the price document) is dropped
// by the student-safe projection, so an intern never sees it. `comments` is the review thread (JSONB array).
export async function ensureGovProposalDocumentSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS gov_proposal_documents (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       delivery_project_id UUID NOT NULL REFERENCES delivery_projects(id) ON DELETE CASCADE,
       doc_key VARCHAR(60) NOT NULL,
       title TEXT NOT NULL,
       status VARCHAR(24) NOT NULL DEFAULT 'not_started',
       content_html TEXT,
       version INTEGER NOT NULL DEFAULT 0,
       admin_only BOOLEAN NOT NULL DEFAULT FALSE,
       gate BOOLEAN NOT NULL DEFAULT FALSE,
       order_index INTEGER NOT NULL DEFAULT 0,
       requirement_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
       comments JSONB NOT NULL DEFAULT '[]'::jsonb,
       drafted_at TIMESTAMPTZ,
       drafted_by_identity_id UUID,
       accepted_at TIMESTAMPTZ,
       accepted_by_identity_id UUID,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    // One row per (project, document): re-deriving the document list upserts in place rather than duplicating.
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_gov_proposal_documents_project_key ON gov_proposal_documents (delivery_project_id, doc_key)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] gov_proposal_documents schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Gov proposal documents schema ensured');
}
