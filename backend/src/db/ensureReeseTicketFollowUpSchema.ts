import { sequelize } from '../config/database';

// Reese ticket follow-up (2026-10-02) schema — ensured via idempotent raw SQL, same
// pattern as ensureReeseOutreachSchema.ts / ensureApprovalRequestsSchema.ts. Every
// statement is CREATE ... IF NOT EXISTS, wrapped in its own try/catch so a partial DB
// self-heals and re-running boot is a no-op. Columns must match
// backend/src/models/ReeseTicketFollowUp.ts EXACTLY.
//
// Additive only: creates 1 new table, never alters or drops any existing column,
// table, or constraint.
//
// The unique index on ticket_id enforces one row per ticket — reeseTicketFollowUpService.ts's
// findOrCreate() is the application-level guarantee this backstops, belt-and-suspenders
// against a race creating two rows for the same quiet ticket.
export async function ensureReeseTicketFollowUpSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS reese_ticket_follow_ups (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       ticket_id UUID NOT NULL REFERENCES tickets(id),
       room_id UUID NOT NULL,
       student_enrollment_id UUID NOT NULL REFERENCES enrollments(id),
       attempt_count INTEGER NOT NULL DEFAULT 0,
       status VARCHAR(20) NOT NULL DEFAULT 'active',
       last_followup_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_reese_ticket_followups_ticket_id ON reese_ticket_follow_ups (ticket_id)`,
    `CREATE INDEX IF NOT EXISTS idx_reese_ticket_followups_room_id ON reese_ticket_follow_ups (room_id)`,
    `CREATE INDEX IF NOT EXISTS idx_reese_ticket_followups_status ON reese_ticket_follow_ups (status)`,
    `CREATE INDEX IF NOT EXISTS idx_reese_ticket_followups_last_followup_at ON reese_ticket_follow_ups (last_followup_at)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] reese_ticket_follow_ups schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Reese ticket follow-up schema ensured');
}
