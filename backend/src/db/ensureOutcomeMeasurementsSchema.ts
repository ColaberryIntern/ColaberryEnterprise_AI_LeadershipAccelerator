import { sequelize } from '../config/database';

// ProofDesk Milestone 5 (Outcomes & Learning) schema — ensured via idempotent raw
// SQL, same pattern as ensureEvidenceSchema.ts / ensureWorkLedgerSchema.ts (215-model
// prod graph, sync({alter:true}) hits pre-existing index conflicts — see
// ensureWorkLedgerSchema.ts's header for the full rationale). Every statement is
// CREATE/ADD ... IF NOT EXISTS and wrapped in its own try/catch so a partial DB
// self-heals and re-running boot is a no-op. Columns must match
// backend/src/models/OutcomeMeasurement.ts EXACTLY.
//
// Additive only: creates 1 new table, never alters or drops any existing column,
// table, or constraint. `UNIQUE (ticket_id, measurement_type)` is the idempotency key
// referenced by outcomeMeasurementService.ts's scheduling function.
export async function ensureOutcomeMeasurementsSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS outcome_measurements (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       ticket_id UUID NOT NULL REFERENCES tickets(id),
       measurement_type VARCHAR(40) NOT NULL DEFAULT 'ticket_recurrence_check',
       baseline JSONB NOT NULL DEFAULT '{}'::jsonb,
       target JSONB NOT NULL DEFAULT '{}'::jsonb,
       observation_window_days INTEGER NOT NULL DEFAULT 7,
       scheduled_for TIMESTAMPTZ NOT NULL,
       status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
       observed_at TIMESTAMPTZ,
       observed_result JSONB,
       outcome_status VARCHAR(20) NOT NULL DEFAULT 'pending',
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_outcome_measurements_ticket_id ON outcome_measurements (ticket_id)`,
    `CREATE INDEX IF NOT EXISTS idx_outcome_measurements_scheduled_for ON outcome_measurements (scheduled_for)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_outcome_measurements_ticket_type ON outcome_measurements (ticket_id, measurement_type)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] outcome_measurements schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] ProofDesk Outcome Measurements schema ensured');
}
