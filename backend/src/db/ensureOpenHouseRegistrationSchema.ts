import { sequelize } from '../config/database';

/**
 * OH-2 (Ali, 2026-11-10) — WE own the Open House attendee list.
 *
 * Until now "registering" for an Open House happened entirely in Eventbrite, and
 * the platform only ever read a mirror of it. Eventbrite's API cannot create a
 * registration (see openHouseOnboardingService), so the signup on our own
 * landing page could never have become an Eventbrite seat. Ali chose to own
 * registration here instead, which means we need a row that says "this person
 * signed up for that Open House".
 *
 * `event_id` is the EVENTBRITE event id, not a local uuid, because CCPP's mirror
 * of Eventbrite is still the only thing that knows which Open House is next -
 * `open_house_events` exists and holds zero rows, and `live_sessions` carries
 * one Open House row ever. Keying on the Eventbrite id means a registration
 * taken here and the event the public endpoint advertises cannot drift apart,
 * with no new scheduling surface to maintain.
 *
 * The unique index IS the idempotency key: a double-submitted form, a retried
 * request, or a visitor who signs up twice produces one row, and the insert is
 * `ON CONFLICT DO NOTHING` rather than an upsert so a repeat can never rewrite
 * the original registration's timestamp.
 *
 * NOT `session_guests`, deliberately. That table is the record of who joined on
 * the night, and `countGuests` plus the raffle draws read it - pre-registering
 * someone there would inflate the live headcount and could award a book to a
 * no-show.
 *
 * Additive only: creates one new table and its indexes, alters nothing.
 */
export async function ensureOpenHouseRegistrationSchema(): Promise<void> {
  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS open_house_registrations (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       event_id VARCHAR(64) NOT NULL,
       email_lower VARCHAR(255) NOT NULL,
       name VARCHAR(255),
       enrollment_id UUID REFERENCES enrollments(id) ON DELETE SET NULL,
       source VARCHAR(64) NOT NULL DEFAULT 'unknown',
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
    // The idempotency key. One person, one registration, per event.
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_open_house_registrations_event_email
       ON open_house_registrations (event_id, email_lower)`,
    // The attendee list for one event, newest first - how staff will read it.
    `CREATE INDEX IF NOT EXISTS idx_open_house_registrations_event_created
       ON open_house_registrations (event_id, created_at DESC)`,
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] open_house_registrations schema stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Open House registration schema ensured');
}
