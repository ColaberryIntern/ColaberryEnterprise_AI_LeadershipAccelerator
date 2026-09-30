import { sequelize } from '../config/database';

// Reese Phase 2 (Autonomous Outreach) schema — ensured via idempotent raw SQL,
// same pattern as ensureOutcomeMeasurementsSchema.ts / ensureWorkLedgerSchema.ts
// (215-model prod graph, sync({alter:true}) hits pre-existing index conflicts —
// see ensureWorkLedgerSchema.ts's header for the full rationale). Every
// statement is CREATE ... IF NOT EXISTS and wrapped in its own try/catch so a
// partial DB self-heals and re-running boot is a no-op. Columns must match
// backend/src/models/ReeseOutreach.ts EXACTLY.
//
// Additive only: creates 1 new table, never alters or drops any existing
// column, table, or constraint.
//
// The partial unique index on (enrollment_id, signal_type) WHERE status='active'
// backstops the application-level dedup check in
// reeseAutonomousOutreachService.ts — belt-and-suspenders against a race
// creating two active outreach threads for the same student+signal.
export async function ensureReeseOutreachSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS reese_autonomous_outreach (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       enrollment_id UUID NOT NULL REFERENCES enrollments(id),
       ticket_id UUID NOT NULL REFERENCES tickets(id),
       signal_type VARCHAR(30) NOT NULL,
       signal_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
       goal TEXT NOT NULL,
       status VARCHAR(20) NOT NULL DEFAULT 'active',
       attempt_count INTEGER NOT NULL DEFAULT 1,
       last_contacted_at TIMESTAMPTZ NOT NULL,
       next_follow_up_due_at TIMESTAMPTZ,
       risk_tier VARCHAR(10) NOT NULL DEFAULT 'R3',
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_reese_outreach_enrollment ON reese_autonomous_outreach (enrollment_id)`,
    `CREATE INDEX IF NOT EXISTS idx_reese_outreach_due ON reese_autonomous_outreach (status, next_follow_up_due_at)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_reese_outreach_active_unique ON reese_autonomous_outreach (enrollment_id, signal_type) WHERE status = 'active'`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] reese_autonomous_outreach schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Reese Phase 2 Autonomous Outreach schema ensured');
}
