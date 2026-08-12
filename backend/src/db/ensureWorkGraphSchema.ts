import { sequelize } from '../config/database';

// ProofDesk Work Graph — Milestone 3 (Multi-Agent Work Graph) schema, ensured via
// idempotent raw SQL, same pattern as ensureWorkLedgerSchema.ts / ensureEvidenceSchema.ts
// (215-model prod graph, sync({alter:true}) hits pre-existing index conflicts — see
// ensureWorkLedgerSchema.ts's header for the full rationale). Every statement is
// CREATE/ADD/ALTER ... IF NOT EXISTS (or wrapped in its own try/catch when Postgres
// has no IF NOT EXISTS form, e.g. ADD CONSTRAINT) so a partial DB self-heals and
// re-running boot is a no-op.
//
// Columns must match backend/src/models/TicketWorkUnit.ts, WorkUnitDependency.ts,
// ResourceLease.ts EXACTLY.
//
// Additive only: creates 3 new tables and one new FK constraint on the pre-existing,
// nullable `work_ledger_events.work_unit_id` column (added in M1 with no FK target
// since ticket_work_units did not exist yet). Never alters or drops any existing
// column, table, or constraint otherwise.
//
// Collision detection for resource_leases is enforced at the DB level, not just in
// application code: a partial unique index on (resource_key) WHERE status = 'active'
// means Postgres itself rejects a second concurrently-active lease on the same
// resource_key — workGraph/workCoordinatorService.ts's acquireLease() relies on
// catching that unique-violation, exactly like workLedgerService.ts already does for
// its own idempotency-key race.
export async function ensureWorkGraphSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS ticket_work_units (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       ticket_id UUID NOT NULL REFERENCES tickets(id),
       work_context_id UUID REFERENCES work_contexts(id),
       title VARCHAR(500) NOT NULL,
       description TEXT,
       required_capability VARCHAR(100) NOT NULL,
       target_resource_scope VARCHAR(255),
       acceptance_criteria TEXT,
       status VARCHAR(20) NOT NULL DEFAULT 'pending',
       risk_tier VARCHAR(10) NOT NULL DEFAULT 'R0',
       approval_policy VARCHAR(20) NOT NULL DEFAULT 'auto',
       verification_contract TEXT,
       eligible_parallelism INTEGER NOT NULL DEFAULT 1,
       expected_output_refs JSONB DEFAULT '[]'::jsonb,
       assigned_agent_name VARCHAR(100),
       assigned_run_id UUID REFERENCES agent_runs(id),
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_ticket_work_units_ticket_id ON ticket_work_units (ticket_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ticket_work_units_status ON ticket_work_units (status)`,
    `CREATE INDEX IF NOT EXISTS idx_ticket_work_units_required_capability ON ticket_work_units (required_capability)`,

    `CREATE TABLE IF NOT EXISTS work_unit_dependencies (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       work_unit_id UUID NOT NULL REFERENCES ticket_work_units(id),
       depends_on_work_unit_id UUID NOT NULL REFERENCES ticket_work_units(id),
       dependency_type VARCHAR(20) NOT NULL DEFAULT 'blocks',
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       CONSTRAINT chk_work_unit_dependencies_no_self_ref CHECK (work_unit_id <> depends_on_work_unit_id)
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_work_unit_dependencies_pair ON work_unit_dependencies (work_unit_id, depends_on_work_unit_id)`,
    `CREATE INDEX IF NOT EXISTS idx_work_unit_dependencies_work_unit_id ON work_unit_dependencies (work_unit_id)`,
    `CREATE INDEX IF NOT EXISTS idx_work_unit_dependencies_depends_on ON work_unit_dependencies (depends_on_work_unit_id)`,

    `CREATE TABLE IF NOT EXISTS resource_leases (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       resource_key VARCHAR(255) NOT NULL,
       work_unit_id UUID REFERENCES ticket_work_units(id),
       run_id UUID REFERENCES agent_runs(id),
       lease_owner VARCHAR(255) NOT NULL,
       status VARCHAR(20) NOT NULL DEFAULT 'active',
       acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       expires_at TIMESTAMPTZ NOT NULL,
       heartbeat_at TIMESTAMPTZ,
       idempotency_key VARCHAR(255) NOT NULL,
       before_state_version VARCHAR(100),
       cancellation_token UUID NOT NULL DEFAULT gen_random_uuid(),
       released_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    // Collision detection: only one ACTIVE lease per resource_key, enforced by Postgres.
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_resource_leases_active_resource_key ON resource_leases (resource_key) WHERE status = 'active'`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_resource_leases_idempotency_key ON resource_leases (idempotency_key)`,
    `CREATE INDEX IF NOT EXISTS idx_resource_leases_resource_key ON resource_leases (resource_key)`,
    `CREATE INDEX IF NOT EXISTS idx_resource_leases_work_unit_id ON resource_leases (work_unit_id)`,
    `CREATE INDEX IF NOT EXISTS idx_resource_leases_run_id ON resource_leases (run_id)`,
    `CREATE INDEX IF NOT EXISTS idx_resource_leases_status ON resource_leases (status)`,
    `CREATE INDEX IF NOT EXISTS idx_resource_leases_expires_at ON resource_leases (expires_at)`,

    // FK from the M1-preexisting work_ledger_events.work_unit_id column (added
    // nullable, no FK target, since ticket_work_units did not exist at M1 time).
    // Postgres has no "ADD CONSTRAINT IF NOT EXISTS" form; a duplicate-add on a
    // re-run throws and is caught by the per-statement try/catch below, same
    // idempotent-by-catch pattern already used repo-wide for constraints.
    `ALTER TABLE work_ledger_events ADD CONSTRAINT fk_work_ledger_events_work_unit
       FOREIGN KEY (work_unit_id) REFERENCES ticket_work_units(id)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] work-graph schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] ProofDesk Work Graph schema ensured');
}
