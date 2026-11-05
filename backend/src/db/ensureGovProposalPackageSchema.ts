import { sequelize } from '../config/database';

/**
 * Gov proposal package (Proposal Studio P6): the two pieces of state the final assembly needs beyond the documents
 * themselves —
 *   - gov_proposal_form_signatures: per required form, per signer role, whether the signed copy is on file. An
 *     unsigned REQUIRED form is fatal to export.
 *   - gov_proposal_redaction_spans: the character ranges in a specific (immutable) version an admin marked to redact
 *     for the Public-Information-Act public copy; the redacted copy renders those ranges as [REDACTED].
 *
 * Additive, idempotent raw SQL; new tables FK to delivery_projects / versions; no existing table altered.
 */
export async function ensureGovProposalPackageSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS gov_proposal_form_signatures (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       delivery_project_id UUID NOT NULL REFERENCES delivery_projects(id) ON DELETE CASCADE,
       form_key VARCHAR(80) NOT NULL,
       signer_role VARCHAR(120) NOT NULL,
       status VARCHAR(16) NOT NULL DEFAULT 'unsigned',
       signed_file_path TEXT,
       required BOOLEAN NOT NULL DEFAULT TRUE,
       updated_by_identity_id UUID,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_gov_proposal_form_signatures_key ON gov_proposal_form_signatures (delivery_project_id, form_key, signer_role)`,
    `CREATE TABLE IF NOT EXISTS gov_proposal_redaction_spans (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       version_id UUID NOT NULL REFERENCES gov_proposal_document_versions(id) ON DELETE CASCADE,
       span_start INTEGER NOT NULL,
       span_end INTEGER NOT NULL,
       label TEXT,
       created_by_identity_id UUID,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_gov_proposal_redaction_spans_version ON gov_proposal_redaction_spans (version_id)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] gov_proposal_package schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Gov proposal package (signatures + redaction) schema ensured');
}
