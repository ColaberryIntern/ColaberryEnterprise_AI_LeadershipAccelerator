import { sequelize } from '../config/database';

/**
 * Practice-slot reservations, with overlap prevented by the DATABASE.
 *
 * WHY THIS IS NEEDED AT ALL. Every Zoom meeting this platform creates is created under
 * one `ZOOM_HOST_EMAIL`. The Zoom app's OAuth grant carries three scopes —
 * `meeting:write:meeting:admin` and two `cloud_recording:read` — and no `user:read`,
 * so `GET /users/me` answers 400 code 4711 and the real licence count **cannot be read
 * programmatically**. Rather than assume a number nobody verified, capacity is treated
 * as ONE concurrent meeting and practice sessions are serialised. That is the
 * conservative direction: it makes students queue, where the optimistic guess would
 * double-book a host and drop someone out of their own rehearsal.
 *
 * WHY AN EXCLUSION CONSTRAINT RATHER THAN A CHECK-THEN-INSERT. "Is anything booked at
 * 14:00?" followed by "book 14:00" is a read-then-write: two students clicking at the
 * same moment both read "free" and both get a slot. `EXCLUDE USING gist (slot WITH &&)`
 * pushes the question into the database, where it is decided once. One student gets the
 * slot; the other gets a refusal it can turn into a truthful next-available time.
 *
 * The constraint is PARTIAL — `WHERE (state = 'held')` — so a released or cancelled
 * reservation stops blocking the slot the moment it is released, without being deleted
 * and losing the history of who had it.
 */

export const PRESENTATION_SLOT_TABLES = ['presentation_slot_reservations'] as const;

export const PRESENTATION_SLOT_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS presentation_slot_reservations (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     enrollment_id UUID,
     attempt_id UUID,
     assignment_id UUID,
     slot TSTZRANGE NOT NULL,
     mode VARCHAR(30) NOT NULL DEFAULT 'practice_solo',
     state VARCHAR(20) NOT NULL DEFAULT 'held',
     released_at TIMESTAMPTZ,
     released_reason TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `ALTER TABLE presentation_slot_reservations ADD COLUMN IF NOT EXISTS enrollment_id UUID`,
  `ALTER TABLE presentation_slot_reservations ADD COLUMN IF NOT EXISTS attempt_id UUID`,
  `ALTER TABLE presentation_slot_reservations ADD COLUMN IF NOT EXISTS assignment_id UUID`,
  `ALTER TABLE presentation_slot_reservations ADD COLUMN IF NOT EXISTS slot TSTZRANGE`,
  `ALTER TABLE presentation_slot_reservations ADD COLUMN IF NOT EXISTS mode VARCHAR(30) DEFAULT 'practice_solo'`,
  `ALTER TABLE presentation_slot_reservations ADD COLUMN IF NOT EXISTS state VARCHAR(20) DEFAULT 'held'`,
  `ALTER TABLE presentation_slot_reservations ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ`,
  `ALTER TABLE presentation_slot_reservations ADD COLUMN IF NOT EXISTS released_reason TEXT`,
  `ALTER TABLE presentation_slot_reservations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
  `ALTER TABLE presentation_slot_reservations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,

  // THE CONSTRAINT THAT MAKES CAPACITY REAL.
  //
  // `ADD CONSTRAINT` has no `IF NOT EXISTS`, so it is guarded by a catalogue lookup to
  // stay re-runnable like every other statement in this directory. gist over tstzrange
  // is built in on PG 15 — no btree_gist extension is required, because the constraint
  // compares only the range and nothing else.
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'presentation_slot_no_overlap'
     ) THEN
       ALTER TABLE presentation_slot_reservations
         ADD CONSTRAINT presentation_slot_no_overlap
         EXCLUDE USING gist (slot WITH &&) WHERE (state = 'held');
     END IF;
   END $$;`,

  `CREATE INDEX IF NOT EXISTS presentation_slot_enrollment
     ON presentation_slot_reservations (enrollment_id)`,
  `CREATE INDEX IF NOT EXISTS presentation_slot_held
     ON presentation_slot_reservations USING gist (slot) WHERE state = 'held'`,
];

export const PRESENTATION_SLOT_REQUIRED_COLUMNS: string[] = [
  'presentation_slot_reservations.id',
  'presentation_slot_reservations.enrollment_id',
  'presentation_slot_reservations.slot',
  'presentation_slot_reservations.state',
];

export const PRESENTATION_SLOT_REQUIRED_CONSTRAINTS: string[] = ['presentation_slot_no_overlap'];

/** Held blocks the slot. Released and cancelled do not, but are kept for history. */
export const PRESENTATION_SLOT_STATES = ['held', 'released', 'cancelled'] as const;

export async function ensurePresentationSlotSchema(): Promise<void> {
  for (const sql of PRESENTATION_SLOT_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] presentation slot stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Presentation slot reservations ensured (1 table + overlap constraint)');
}
