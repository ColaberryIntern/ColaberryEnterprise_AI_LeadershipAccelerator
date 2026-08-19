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
// THE UNIQUE CONSTRAINT ON (enrollment_id, kind) IS THE FEATURE, not a nicety.
// This table is simultaneously the send ledger AND the "has this person had
// this intro yet" marker — there is no last_login_at on enrollments, so the
// absence of an 'account' row is what defines a first login. Someone opening
// the portal in two tabs, or on a phone and a laptop at once, produces
// concurrent requests; the unique index is what makes "each intro exactly
// once, ever" a database invariant rather than an application hope. The
// service races INSERT-then-send against it deliberately.
//
// `kind` is what makes TWO intros possible without them colliding: 'account'
// when someone first gets a login, 'student' when they join a real class. A
// person who signs up and later enrols legitimately receives both.
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
       kind VARCHAR(20) NOT NULL DEFAULT 'account',
       room_id UUID,
       message_id UUID,
       outcome VARCHAR(20) NOT NULL DEFAULT 'sent',
       detail TEXT,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    // Additive for an environment that already ran the single-intro version:
    // the column is added before the composite index is built on it.
    `ALTER TABLE reese_welcomes ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'account'`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_reese_welcomes_enrollment_kind_once ON reese_welcomes (enrollment_id, kind)`,
    // Drop the single-intro version's index. `CREATE ... IF NOT EXISTS` never
    // removes anything, so an environment that booted the first release keeps a
    // UNIQUE index on enrollment_id ALONE — which silently caps each person at
    // ONE row and makes the student intro impossible: its insert is rejected,
    // the service reads that as "already sent", and the class message never
    // arrives. Observed on production 2026-08-18, where both indexes coexisted.
    // The composite index above is the real constraint; this one must go.
    `DROP INDEX IF EXISTS idx_reese_welcomes_enrollment_once`,
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
