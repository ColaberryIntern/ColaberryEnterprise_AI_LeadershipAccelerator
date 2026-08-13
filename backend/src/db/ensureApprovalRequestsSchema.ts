import { sequelize } from '../config/database';

// ProofDesk Governance — Milestone 4 schema, ensured via idempotent raw SQL, same
// pattern as ensureWorkLedgerSchema.ts / ensureEvidenceSchema.ts / ensureWorkGraphSchema.ts
// (215-model prod graph, sync({alter:true}) hits pre-existing index conflicts). Every
// statement is CREATE ... IF NOT EXISTS, or wrapped in the shared try/catch below for
// statements Postgres has no "IF NOT EXISTS" form for (ADD CONSTRAINT), so a partial DB
// self-heals and re-running boot is a no-op.
//
// Columns must match backend/src/models/ApprovalRequest.ts EXACTLY.
//
// SHADOW MODE ONLY (see ApprovalRequest.ts's header and this milestone's execution
// contract): this schema exists so authorization decisions have a durable home, and so
// M1's WorkLedgerEvent.authorization_decision_id column (reserved since Milestone 1,
// previously a loose UUID with no FK target because approval_requests did not exist)
// can finally be constrained. Nothing in this migration, or anywhere else in this
// milestone, causes an approval_requests row to block, delay, or gate a real action.
//
// Additive only: creates 1 new table and adds 1 new FK constraint on the pre-existing,
// nullable work_ledger_events.authorization_decision_id column. Never alters or drops
// any existing column, table, or constraint otherwise.
export async function ensureApprovalRequestsSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS approval_requests (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       ticket_id UUID REFERENCES tickets(id),
       work_unit_id UUID REFERENCES ticket_work_units(id),
       run_id UUID REFERENCES agent_runs(id),
       event_id UUID REFERENCES work_ledger_events(event_id),
       agent_name VARCHAR(100) NOT NULL,
       action VARCHAR(100) NOT NULL,
       risk_tier VARCHAR(10) NOT NULL DEFAULT 'R0',
       autonomy_level VARCHAR(20),
       verdict VARCHAR(30) NOT NULL,
       reason_code VARCHAR(100),
       prepared_action JSONB,
       approval_scope JSONB,
       status VARCHAR(20) NOT NULL DEFAULT 'shadow_logged',
       expires_at TIMESTAMPTZ,
       decided_by VARCHAR(255),
       decided_at TIMESTAMPTZ,
       decision_channel VARCHAR(30),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    // One decision per ledger event — a retry that re-emits the same idempotency-keyed
    // ledger event must not create a second approval_requests row (this milestone's own
    // idempotency requirement, mirroring work_ledger_events.idempotency_key's pattern).
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_requests_event_id ON approval_requests (event_id) WHERE event_id IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_approval_requests_ticket_id ON approval_requests (ticket_id)`,
    `CREATE INDEX IF NOT EXISTS idx_approval_requests_work_unit_id ON approval_requests (work_unit_id)`,
    `CREATE INDEX IF NOT EXISTS idx_approval_requests_run_id ON approval_requests (run_id)`,
    `CREATE INDEX IF NOT EXISTS idx_approval_requests_agent_name ON approval_requests (agent_name)`,
    `CREATE INDEX IF NOT EXISTS idx_approval_requests_verdict ON approval_requests (verdict)`,
    `CREATE INDEX IF NOT EXISTS idx_approval_requests_risk_tier ON approval_requests (risk_tier)`,
    `CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests (status)`,
    `CREATE INDEX IF NOT EXISTS idx_approval_requests_created_at ON approval_requests (created_at)`,

    // FK from the M1-preexisting work_ledger_events.authorization_decision_id column
    // (added nullable, no FK target, since approval_requests did not exist at M1 time —
    // see WorkLedgerEvent.ts's comment: "No approval_requests table exists yet
    // (Milestone 4)"). Postgres has no "ADD CONSTRAINT IF NOT EXISTS" form; a
    // duplicate-add on a re-run throws and is caught by the shared try/catch below,
    // same idempotent-by-catch pattern already used repo-wide for constraints
    // (see ensureWorkGraphSchema.ts's identical fk_work_ledger_events_work_unit case).
    `ALTER TABLE work_ledger_events ADD CONSTRAINT fk_work_ledger_events_authorization_decision
       FOREIGN KEY (authorization_decision_id) REFERENCES approval_requests(id)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] approval-requests schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] ProofDesk Governance (approval_requests) schema ensured');
}
