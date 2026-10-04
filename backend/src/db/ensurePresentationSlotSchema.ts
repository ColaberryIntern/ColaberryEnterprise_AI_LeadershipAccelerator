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
     host_email VARCHAR(190) NOT NULL DEFAULT '',
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
  // Which Zoom host the slot is held ON. Existing rows take '' — a single
  // pseudo-host — so the partitioned constraint below behaves exactly like the
  // global one did until real hosts are registered. No backfill, no downtime.
  `ALTER TABLE presentation_slot_reservations ADD COLUMN IF NOT EXISTS host_email VARCHAR(190) NOT NULL DEFAULT ''`,
  `ALTER TABLE presentation_slot_reservations ADD COLUMN IF NOT EXISTS state VARCHAR(20) DEFAULT 'held'`,
  `ALTER TABLE presentation_slot_reservations ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ`,
  `ALTER TABLE presentation_slot_reservations ADD COLUMN IF NOT EXISTS released_reason TEXT`,
  `ALTER TABLE presentation_slot_reservations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
  `ALTER TABLE presentation_slot_reservations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,

  // THE CONSTRAINT THAT MAKES CAPACITY REAL.
  //
  // `ADD CONSTRAINT` has no `IF NOT EXISTS`, so it is guarded by a catalogue lookup to
  // stay re-runnable like every other statement in this directory. gist over tstzrange
  // is built in on PG 15, so this global form needs no extension.
  //
  // This statement stays FIRST and is never removed: it is the floor. If everything
  // below fails, the platform still refuses to double-book.
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'presentation_slot_no_overlap'
     ) AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'presentation_slot_no_overlap_per_host'
     ) THEN
       ALTER TABLE presentation_slot_reservations
         ADD CONSTRAINT presentation_slot_no_overlap
         EXCLUDE USING gist (slot WITH &&) WHERE (state = 'held');
     END IF;
   END $$;`,

  // PARTITIONING CAPACITY BY HOST.
  //
  // The global constraint above serialises the WHOLE PLATFORM to one practice
  // session at a time, because it compares only the range. That was correct while
  // there was provably one Zoom host. It stops being correct the moment a second
  // host is registered, and it is the reason twenty students preparing for demo day
  // would queue behind each other.
  //
  // Comparing `host_email WITH =` alongside the range needs btree_gist, which gist
  // does not provide for scalar equality on its own. Creating an extension can
  // require privileges this role may not have, so the attempt is swallowed rather
  // than allowed to abort boot.
  `DO $$
   BEGIN
     CREATE EXTENSION IF NOT EXISTS btree_gist;
   EXCEPTION WHEN OTHERS THEN
     RAISE NOTICE 'btree_gist unavailable; per-host slot capacity stays disabled';
   END $$;`,

  // ADD THE NEW CONSTRAINT BEFORE DROPPING THE OLD ONE, deliberately. The reverse
  // order leaves a window — however short — in which nothing prevents two students
  // taking the same host. The new constraint is strictly weaker than the old one,
  // so any data satisfying the global rule already satisfies the per-host rule and
  // the ADD cannot fail on existing rows.
  //
  // Runs only when btree_gist actually exists. Without it the global constraint
  // simply stays, which is capacity one: degraded, never unsafe.
  `DO $$
   BEGIN
     IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist')
        AND NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'presentation_slot_no_overlap_per_host'
        )
     THEN
       ALTER TABLE presentation_slot_reservations
         ADD CONSTRAINT presentation_slot_no_overlap_per_host
         EXCLUDE USING gist (host_email WITH =, slot WITH &&) WHERE (state = 'held');
       ALTER TABLE presentation_slot_reservations
         DROP CONSTRAINT IF EXISTS presentation_slot_no_overlap;
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

/**
 * Exactly one of these must exist. `_per_host` supersedes the global form, and the
 * global form remains the fallback where btree_gist is unavailable — so a parity
 * check must accept EITHER rather than demand the newer one and fail a correct,
 * conservatively-degraded database.
 */
export const PRESENTATION_SLOT_REQUIRED_CONSTRAINTS: string[] = ['presentation_slot_no_overlap'];
export const PRESENTATION_SLOT_CONSTRAINT_ALTERNATIVES: string[] = [
  'presentation_slot_no_overlap',
  'presentation_slot_no_overlap_per_host',
];

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
