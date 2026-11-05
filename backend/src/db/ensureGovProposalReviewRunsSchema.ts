import { sequelize } from '../config/database';

// Gov proposal review runs (gov_proposal_review_runs) — one row per runReviewCycle invocation on a document, so the
// Proposal Studio UI can POLL a run's status + progress while it works (B.5). The review cycle is fire-and-forget on
// the server; this row is how it becomes observable (Idle / Running / Passed / Blocked in the agent panel).
//
// Idempotent raw SQL, same additive pattern as ensureGovExtractionJobSchema.ts: one CREATE ... IF NOT EXISTS per
// statement, each in its own try/catch, so a partial DB self-heals and re-running boot is a no-op. One NEW table,
// FK'd to gov_proposal_documents (like the versions/gates tables); nothing existing is altered.
//
// status lifecycle: running -> (passed | blocked | failed | done). Only ONE active (running) run is allowed per
// document; the store checks activeRunForDoc before starting another and the route returns 409 otherwise. The
// (document_id, status) index backs that active-run lookup.
export async function ensureGovProposalReviewRunsSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS gov_proposal_review_runs (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       document_id UUID NOT NULL REFERENCES gov_proposal_documents(id) ON DELETE CASCADE,
       status VARCHAR(16) NOT NULL DEFAULT 'running',
       iterations INTEGER NOT NULL DEFAULT 0,
       last_message TEXT,
       result_json JSONB,
       started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       finished_at TIMESTAMPTZ
     )`,
    `CREATE INDEX IF NOT EXISTS idx_gov_proposal_review_runs_doc_status ON gov_proposal_review_runs (document_id, status)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] gov_proposal_review_runs schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Gov proposal review runs schema ensured');
}
