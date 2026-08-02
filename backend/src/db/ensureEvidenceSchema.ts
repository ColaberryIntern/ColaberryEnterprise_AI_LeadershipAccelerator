import { sequelize } from '../config/database';

// ProofDesk Milestone 2 (Proof & Ticket Experience) schema — ensured via idempotent
// raw SQL, same pattern as ensureWorkLedgerSchema.ts (215-model prod graph,
// sync({alter:true}) hits pre-existing index conflicts — see that file's header for
// the full rationale). Every statement is CREATE/ADD ... IF NOT EXISTS and wrapped in
// its own try/catch so a partial DB self-heals and re-running boot is a no-op.
// Columns must match backend/src/models/EvidenceArtifact.ts, EvidenceLink.ts,
// DecisionRecord.ts EXACTLY.
//
// Additive only: creates 3 new tables, never alters or drops any existing column,
// table, or constraint. No binary/object storage — evidence_artifacts.storage_ref is a
// path-string reference, following the same convention as
// dom_snapshots.screenshot_path / visual_review_sessions.primary_screenshot_path.
export async function ensureEvidenceSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS evidence_artifacts (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       ticket_id UUID REFERENCES tickets(id),
       artifact_type VARCHAR(30) NOT NULL,
       storage_ref VARCHAR(512),
       dom_snapshot_id UUID REFERENCES dom_snapshots(id),
       visual_review_session_id UUID REFERENCES visual_review_sessions(id),
       source_event_id UUID REFERENCES work_ledger_events(event_id),
       title VARCHAR(255),
       captured_at TIMESTAMPTZ,
       metadata JSONB DEFAULT '{}'::jsonb,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_evidence_artifacts_ticket_id ON evidence_artifacts (ticket_id)`,
    `CREATE INDEX IF NOT EXISTS idx_evidence_artifacts_artifact_type ON evidence_artifacts (artifact_type)`,
    `CREATE INDEX IF NOT EXISTS idx_evidence_artifacts_source_event_id ON evidence_artifacts (source_event_id)`,

    `CREATE TABLE IF NOT EXISTS evidence_links (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       evidence_id UUID NOT NULL REFERENCES evidence_artifacts(id),
       ticket_id UUID NOT NULL REFERENCES tickets(id),
       link_role VARCHAR(30) NOT NULL DEFAULT 'primary',
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_links_evidence_ticket ON evidence_links (evidence_id, ticket_id)`,
    `CREATE INDEX IF NOT EXISTS idx_evidence_links_ticket_id ON evidence_links (ticket_id)`,
    `CREATE INDEX IF NOT EXISTS idx_evidence_links_evidence_id ON evidence_links (evidence_id)`,

    `CREATE TABLE IF NOT EXISTS decision_records (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       ticket_id UUID NOT NULL REFERENCES tickets(id),
       decision_type VARCHAR(20) NOT NULL,
       actor_type VARCHAR(20) NOT NULL,
       actor_id VARCHAR(255) NOT NULL,
       rationale TEXT,
       linked_evidence_ids UUID[],
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_decision_records_ticket_id ON decision_records (ticket_id)`,
    `CREATE INDEX IF NOT EXISTS idx_decision_records_decision_type ON decision_records (decision_type)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] evidence schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] ProofDesk Evidence schema ensured');
}
