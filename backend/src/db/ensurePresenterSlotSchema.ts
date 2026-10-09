import { sequelize } from '../config/database';

/**
 * The running order for a cohort demo day: who presents, in what position, for how
 * long.
 *
 * WHY A SEPARATE TABLE RATHER THAN COLUMNS ON `presentation_attempts`. Two reasons,
 * and the second is the real one.
 *
 * `ensurePresentationStudioSchema.ts` stands at 498 lines against this repo's
 * 500-line ceiling, and the rule is that the next change to a file at the limit
 * splits it first. That alone would be a weak reason to invent a table.
 *
 * The real reason: an attempt is "this learner's take", and it exists for solo
 * rehearsals that have no running order at all. A slot is "position 4 of 11 in
 * Thursday's session" — it belongs to the SESSION, and the uniqueness that matters
 * (one presenter per position, one slot per learner per session) is a property of
 * the session, not of the attempt. Expressed as columns on the attempt, neither
 * constraint can be written down.
 *
 * WHAT IS DELIBERATELY NOT HERE: any copy of the learner's name, project title or
 * evidence. A slot points at an assignment; anything a viewer is allowed to see
 * about that assignment is resolved through the normal ownership checks at read
 * time. Denormalising it here would create a second place where one student's work
 * can leak into another's page.
 */

export const PRESENTER_SLOT_TABLES = ['presentation_presenter_slots'] as const;

export const PRESENTER_SLOT_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS presentation_presenter_slots (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     booking_id UUID NOT NULL,
     assignment_id UUID NOT NULL,
     enrollment_id UUID,
     cohort_id UUID,
     position INTEGER NOT NULL,
     role VARCHAR(20) NOT NULL DEFAULT 'presenter',
     starts_at TIMESTAMPTZ,
     duration_seconds INTEGER,
     state VARCHAR(20) NOT NULL DEFAULT 'scheduled',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  // CREATE TABLE IF NOT EXISTS is a no-op on an existing table, so every column is
  // also added explicitly. This is the trap this directory exists to avoid.
  `ALTER TABLE presentation_presenter_slots ADD COLUMN IF NOT EXISTS booking_id UUID`,
  `ALTER TABLE presentation_presenter_slots ADD COLUMN IF NOT EXISTS assignment_id UUID`,
  `ALTER TABLE presentation_presenter_slots ADD COLUMN IF NOT EXISTS enrollment_id UUID`,
  `ALTER TABLE presentation_presenter_slots ADD COLUMN IF NOT EXISTS cohort_id UUID`,
  `ALTER TABLE presentation_presenter_slots ADD COLUMN IF NOT EXISTS position INTEGER`,
  `ALTER TABLE presentation_presenter_slots ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'presenter'`,
  `ALTER TABLE presentation_presenter_slots ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ`,
  `ALTER TABLE presentation_presenter_slots ADD COLUMN IF NOT EXISTS duration_seconds INTEGER`,
  `ALTER TABLE presentation_presenter_slots ADD COLUMN IF NOT EXISTS state VARCHAR(20) DEFAULT 'scheduled'`,
  `ALTER TABLE presentation_presenter_slots ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
  `ALTER TABLE presentation_presenter_slots ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,

  // ONE PRESENTER PER POSITION. Without this, two students are both "third" and the
  // running order silently disagrees with itself depending on how it is sorted —
  // the kind of defect nobody notices until demo day is underway.
  `CREATE UNIQUE INDEX IF NOT EXISTS presenter_slots_unique_position
     ON presentation_presenter_slots (booking_id, position)
     WHERE state <> 'cancelled'`,

  // ONE SLOT PER LEARNER PER SESSION. A student scheduled twice in the same session
  // would be told two different times for the same demo.
  `CREATE UNIQUE INDEX IF NOT EXISTS presenter_slots_unique_assignment
     ON presentation_presenter_slots (booking_id, assignment_id)
     WHERE state <> 'cancelled'`,

  `CREATE INDEX IF NOT EXISTS presenter_slots_booking
     ON presentation_presenter_slots (booking_id, position)`,
  `CREATE INDEX IF NOT EXISTS presenter_slots_enrollment
     ON presentation_presenter_slots (enrollment_id)`,
];

export const PRESENTER_SLOT_REQUIRED_COLUMNS: string[] = [
  'presentation_presenter_slots.booking_id',
  'presentation_presenter_slots.assignment_id',
  'presentation_presenter_slots.position',
  'presentation_presenter_slots.role',
  'presentation_presenter_slots.state',
];

/** A slot is a place in the order, not a claim that anyone presented. */
export const PRESENTER_SLOT_STATES = ['scheduled', 'presenting', 'done', 'cancelled'] as const;

/** `peer` reviews someone else's demo; it never confers moderator rights. */
export const PRESENTER_SLOT_ROLES = ['presenter', 'peer'] as const;

export async function ensurePresenterSlotSchema(): Promise<void> {
  for (const sql of PRESENTER_SLOT_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'backend',
        event: 'ensure_presenter_slot_schema_failed',
        outcome: 'failure',
        error_class: err?.constructor?.name ?? 'Error',
        context: { statement: String(sql).slice(0, 120) },
      }));
      throw err;
    }
  }
}
