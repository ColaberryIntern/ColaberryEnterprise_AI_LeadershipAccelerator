import fs from 'fs';
import path from 'path';

/**
 * T-SCHEMA (Proposal Studio v3): the columns V1/V2 persist to must be added the same rollback-safe way every other
 * ensure*Schema change is — `ADD COLUMN IF NOT EXISTS` on an existing, boot-created table, never a drop. Asserted on
 * the source (DB-free) because the guarantee is a property of the DDL text; `bootSchemaCreatable.test.ts` separately
 * proves the ALTERed tables are created in the boot path, and the integration tier runs the DDL for real.
 */
const DB = path.join(__dirname, '..');
const gaps = fs.readFileSync(path.join(DB, 'ensureGovProposalDocumentGapsSchema.ts'), 'utf8');
const review = fs.readFileSync(path.join(DB, 'ensureGovProposalReviewSchema.ts'), 'utf8');

const addsColumn = (src: string, table: string, col: string) =>
  new RegExp(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col}\\b`, 'i').test(src);

describe('gaps table carries the typed need + a dedupe key', () => {
  it('adds need and need_key additively', () => {
    expect(addsColumn(gaps, 'gov_proposal_document_gaps', 'need')).toBe(true);
    expect(addsColumn(gaps, 'gov_proposal_document_gaps', 'need_key')).toBe(true);
  });
  it('indexes need_key for cross-document dedupe, with IF NOT EXISTS', () => {
    expect(gaps).toMatch(/CREATE INDEX IF NOT EXISTS \w*need_key\w* ON gov_proposal_document_gaps \(delivery_project_id, need_key\)/i);
  });
  it('adds resolution_payload for the routed human answer (T04 resolve)', () => {
    expect(addsColumn(gaps, 'gov_proposal_document_gaps', 'resolution_payload')).toBe(true);
  });
});

describe('versions + gate reviews carry independent-judge evidence', () => {
  it('adds judge_run_ids to the version', () => {
    expect(addsColumn(review, 'gov_proposal_document_versions', 'judge_run_ids')).toBe(true);
  });
  it('adds decided_by, scores and judge_run_ids to the gate review', () => {
    expect(addsColumn(review, 'gov_proposal_gate_reviews', 'decided_by')).toBe(true);
    expect(addsColumn(review, 'gov_proposal_gate_reviews', 'scores')).toBe(true);
    expect(addsColumn(review, 'gov_proposal_gate_reviews', 'judge_run_ids')).toBe(true);
  });
});

describe('rollback-safe: additive only', () => {
  it('never drops a column or table in either ensure file', () => {
    for (const src of [gaps, review]) {
      expect(src).not.toMatch(/DROP\s+COLUMN/i);
      expect(src).not.toMatch(/DROP\s+TABLE/i);
    }
  });
});
