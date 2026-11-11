import { sequelize } from '../config/database';

/**
 * OH-6 (Ali, 2026-11-10) — reminders for the Open House WE registered people for.
 *
 * ── WHY ANYTHING IS NEEDED AT ALL ───────────────────────────────────────────
 *
 * Eventbrite reminds the people who registered on Eventbrite. Nobody who signs
 * up on our landing page is one of them - Eventbrite's API cannot create a
 * registration, which is the whole reason OH-2 exists - so as things stand a
 * person who signs up with us is never told when or how to attend.
 *
 * The platform already has a good reminder system: `schedulerService` sweeps
 * every 30 minutes, creates a Meet link if one is missing, sends at 24h and 1h,
 * and records arming ON THE SESSION ROW so a deploy cannot re-mail a cohort.
 * Two things stop it serving the Open House, and this migration is what each
 * needs.
 *
 * ── 1. live_sessions.open_house_event_id ────────────────────────────────────
 *
 * Which Open House a session IS. The Eventbrite id, matching
 * `open_house_registrations.event_id`, because CCPP's mirror of Eventbrite is
 * still the only thing that knows which Open House is next. A session carrying
 * this id is an Open House; one without it is an ordinary class. That is the
 * flag the scheduler branches on, and it is a column rather than a convention
 * over `title ILIKE '%open house%'` so a renamed session cannot silently start
 * or stop mailing people.
 *
 * ── 2. per-REGISTRATION arming, not per-session ─────────────────────────────
 *
 * The existing arming is one timestamp on the session: send to the cohort, mark
 * the session, never send again. That is right for a fixed roster and wrong
 * here, because an Open House's roster grows until the doors open. Arm the
 * session and somebody who registers an hour later is never reminded; do not arm
 * it and everybody is reminded again every thirty minutes.
 *
 * So the stamp belongs on the registration. Each row is reminded at most once
 * per window, late registrants still get theirs, and a restart or a redeploy
 * changes nothing because the record is in the database rather than in a Set.
 *
 * Additive only: two nullable columns and one nullable column, no backfill, no
 * rewrite. Existing rows read as "not yet reminded", which is true.
 */
export async function ensureOpenHouseReminderSchema(): Promise<void> {
  const statements: string[] = [
    // Which Open House this session is. NULL for every ordinary class, which is
    // what keeps this invisible to the existing reminder path.
    `ALTER TABLE live_sessions
       ADD COLUMN IF NOT EXISTS open_house_event_id VARCHAR(64)`,
    // One scheduled session per Open House. A partial index so the uniqueness
    // applies only to the Open House rows and every ordinary session, all of
    // which hold NULL, is unaffected.
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_live_sessions_open_house_event
       ON live_sessions (open_house_event_id)
       WHERE open_house_event_id IS NOT NULL`,
    // Per-registration arming.
    `ALTER TABLE open_house_registrations
       ADD COLUMN IF NOT EXISTS reminder_24h_sent_at TIMESTAMPTZ`,
    `ALTER TABLE open_house_registrations
       ADD COLUMN IF NOT EXISTS reminder_1h_sent_at TIMESTAMPTZ`,
    // The sweep's query: "rows for this event that have not had this reminder".
    `CREATE INDEX IF NOT EXISTS idx_open_house_registrations_reminders
       ON open_house_registrations (event_id, reminder_24h_sent_at, reminder_1h_sent_at)`,
  ];

  for (const sql of statements) {
    await sequelize.query(sql);
  }
}
