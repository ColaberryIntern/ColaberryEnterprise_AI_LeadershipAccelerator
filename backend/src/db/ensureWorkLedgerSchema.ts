import { sequelize } from '../config/database';

// ProofDesk Work Ledger — Milestone 1 (Foundation) schema, ensured via idempotent
// raw SQL rather than sequelize.sync({ alter: true }) — see ensureInboxCaseSchema.ts
// for why (215-model prod graph, alter-sync hits pre-existing index conflicts).
// Every statement is CREATE/ADD ... IF NOT EXISTS and wrapped in its own try/catch
// so a partial DB self-heals and re-running boot is a no-op.
// Columns must match the Sequelize models in backend/src/models/WorkContext.ts,
// AgentRun.ts, WorkLedgerEvent.ts, TicketActionLink.ts EXACTLY, and the 12 new
// columns on `tickets` must match backend/src/models/Ticket.ts EXACTLY.
//
// Additive only: this migration creates 4 new tables and adds 12 new NULLABLE
// columns to the existing `tickets` table. It never alters or drops any existing
// column, table, or constraint. Shadow mode — nothing reads these tables yet except
// workLedgerService.ts and workLedgerHealthService.ts.
export async function ensureWorkLedgerSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS work_contexts (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       ticket_id UUID REFERENCES tickets(id),
       context_type VARCHAR(50) NOT NULL,
       title VARCHAR(500),
       status VARCHAR(20) NOT NULL DEFAULT 'active',
       metadata JSONB DEFAULT '{}'::jsonb,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ
     )`,
    `CREATE INDEX IF NOT EXISTS idx_work_contexts_ticket_id ON work_contexts (ticket_id)`,
    `CREATE INDEX IF NOT EXISTS idx_work_contexts_context_type ON work_contexts (context_type)`,
    `CREATE INDEX IF NOT EXISTS idx_work_contexts_status ON work_contexts (status)`,

    `CREATE TABLE IF NOT EXISTS agent_runs (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       work_context_id UUID REFERENCES work_contexts(id),
       ticket_id UUID REFERENCES tickets(id),
       agent_name VARCHAR(100) NOT NULL,
       agent_version VARCHAR(50),
       trace_id UUID NOT NULL,
       status VARCHAR(20) NOT NULL DEFAULT 'running',
       started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       ended_at TIMESTAMPTZ,
       duration_ms INTEGER,
       result VARCHAR(20),
       retry_of_run_id UUID REFERENCES agent_runs(id),
       metadata JSONB,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_agent_runs_ticket_id ON agent_runs (ticket_id)`,
    `CREATE INDEX IF NOT EXISTS idx_agent_runs_work_context_id ON agent_runs (work_context_id)`,
    `CREATE INDEX IF NOT EXISTS idx_agent_runs_trace_id ON agent_runs (trace_id)`,
    `CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs (status)`,

    `CREATE TABLE IF NOT EXISTS work_ledger_events (
       event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       work_context_id UUID REFERENCES work_contexts(id),
       ticket_id UUID REFERENCES tickets(id),
       work_unit_id UUID,
       run_id UUID REFERENCES agent_runs(id),
       trace_id UUID NOT NULL,
       parent_event_id UUID REFERENCES work_ledger_events(event_id),
       actor_type VARCHAR(20) NOT NULL,
       actor_id VARCHAR(255) NOT NULL,
       agent_version VARCHAR(50),
       intent VARCHAR(100) NOT NULL,
       domain VARCHAR(50) NOT NULL,
       action_class VARCHAR(50) NOT NULL,
       target_type VARCHAR(50) NOT NULL,
       target_id VARCHAR(255),
       environment VARCHAR(20) NOT NULL DEFAULT 'production',
       risk_tier VARCHAR(10) NOT NULL DEFAULT 'R0',
       authorization_decision_id UUID,
       idempotency_key VARCHAR(255) NOT NULL,
       before_state_ref VARCHAR(255),
       after_state_ref VARCHAR(255),
       result VARCHAR(20) NOT NULL,
       reason_code VARCHAR(100),
       duration_ms INTEGER,
       cost_usd DECIMAL(12,6),
       source_record_type VARCHAR(50),
       source_record_id VARCHAR(255),
       occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_work_ledger_events_idempotency_key ON work_ledger_events (idempotency_key)`,
    `CREATE INDEX IF NOT EXISTS idx_work_ledger_events_ticket_id ON work_ledger_events (ticket_id)`,
    `CREATE INDEX IF NOT EXISTS idx_work_ledger_events_run_id ON work_ledger_events (run_id)`,
    `CREATE INDEX IF NOT EXISTS idx_work_ledger_events_trace_id ON work_ledger_events (trace_id)`,
    `CREATE INDEX IF NOT EXISTS idx_work_ledger_events_occurred_at ON work_ledger_events (occurred_at)`,
    `CREATE INDEX IF NOT EXISTS idx_work_ledger_events_source_record ON work_ledger_events (source_record_type, source_record_id)`,

    `CREATE TABLE IF NOT EXISTS ticket_action_links (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       ticket_id UUID NOT NULL REFERENCES tickets(id),
       event_id UUID NOT NULL REFERENCES work_ledger_events(event_id),
       link_role VARCHAR(30) NOT NULL DEFAULT 'primary',
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_action_links_ticket_event ON ticket_action_links (ticket_id, event_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ticket_action_links_ticket_id ON ticket_action_links (ticket_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ticket_action_links_event_id ON ticket_action_links (event_id)`,

    // Additive, nullable columns on the existing `tickets` table.
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS phase VARCHAR(50)`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS work_intent VARCHAR(100)`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS domain VARCHAR(50)`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS risk_tier VARCHAR(10)`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS proof_readiness VARCHAR(20)`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS environment VARCHAR(20)`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20)`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS outcome_status VARCHAR(20)`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS owner_department VARCHAR(100)`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS orchestrator_run_id UUID`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS summary_current TEXT`,
    `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS last_meaningful_activity_at TIMESTAMPTZ`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] work-ledger schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] ProofDesk Work Ledger schema ensured');
}
