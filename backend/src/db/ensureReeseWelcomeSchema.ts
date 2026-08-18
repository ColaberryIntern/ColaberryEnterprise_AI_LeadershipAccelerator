import { sequelize } from '../config/database';

// Reese's first-login welcome ledger — ensured via idempotent raw SQL, same
// pattern as ensureReeseOutreachSchema.ts / ensureAgentAttachmentSchema.ts
// (the 215-model prod graph makes sync({alter:true}) hit pre-existing index
// conflicts). Every statement is CREATE ... IF NOT EXISTS in its own
// try/catch, so a partial DB self-heals and re-running boot is a no-op.
//
// Additive only: creates 1 new table, never alters or drops anything existing.
// Columns must match backend/src/models/ReeseWelcome.ts EXACTLY.
//
// THE UNIQUE CONSTRAINT ON enrollment_id IS THE FEATURE, not a nicety. This
// table is simultaneously the send ledger AND the "has this student ever
// logged in before" marker — there is no last_login_at on enrollments, so the
// absence of a row here is what defines a first login. A student opening the
// portal in two tabs, or on a phone and a laptop at once, produces concurrent
// login requests; the unique index is what makes "greeted exactly once, ever"
// a database invariant rather than an application hope. The service races
// INSERT-then-send against it deliberately.
//
// Deliberately NOT reusing reese_autonomous_outreach: that table requires a
// ticket_id (NOT NULL, FK to tickets), so every welcome would mint a ticket.
// Thousands of tickets whose only content is "we said hello" is noise in a
// queue humans read.
export async function ensureReeseWelcomeSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS reese_welcomes (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       enrollment_id UUID NOT NULL REFERENCES enrollments(id),
       room_id UUID,
       message_id UUID,
       outcome VARCHAR(20) NOT NULL DEFAULT 'sent',
       detail TEXT,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_reese_welcomes_enrollment_once ON reese_welcomes (enrollment_id)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] reese_welcomes schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Reese welcome schema ensured');
}
