import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * The Open House attendee list we own (OH-2). One row per person per Eventbrite
 * event id. See `db/ensureOpenHouseRegistrationSchema.ts` for why the key is the
 * Eventbrite id and why this is not `session_guests`.
 *
 * Every write here is idempotent through the unique index, so a retried request,
 * a double-tapped button and a visitor who signs up twice all leave the same
 * single row - and `created_at` keeps the FIRST registration's time, because the
 * insert declines on conflict instead of upserting.
 */

export interface OpenHouseRegistrationInput {
  eventId: string;
  email: string;
  name?: string | null;
  enrollmentId?: string | null;
  /** Where the signup came from, e.g. 'landing_page' or 'training_site'. */
  source: string;
}

export interface OpenHouseRegistrationResult {
  /** False when this person was already registered for this event. */
  created: boolean;
  registration_id: string | null;
}

/**
 * Record one registration. Returns `created: false` when the row already
 * existed, which is the normal answer for a repeat signup and not an error.
 *
 * Never throws for a duplicate - that is the whole point of the conflict clause.
 * A genuine database failure DOES throw, because losing a registration silently
 * is the one outcome worth failing a request over: the account and the welcome
 * email are created by the caller either way, so a swallowed error here would
 * leave someone believing they have a seat that nothing recorded.
 */
export async function recordOpenHouseRegistration(
  input: OpenHouseRegistrationInput
): Promise<OpenHouseRegistrationResult> {
  const email = (input.email || '').trim().toLowerCase();
  if (!email) throw new Error('email is required to record an Open House registration');
  if (!input.eventId) throw new Error('eventId is required to record an Open House registration');

  const rows = await sequelize.query<{ id: string }>(
    `INSERT INTO open_house_registrations (event_id, email_lower, name, enrollment_id, source)
     VALUES (:eventId, :email, :name, :enrollmentId, :source)
     ON CONFLICT (event_id, email_lower) DO NOTHING
     RETURNING id`,
    {
      type: QueryTypes.SELECT,
      replacements: {
        eventId: String(input.eventId),
        email,
        name: input.name?.trim() || null,
        enrollmentId: input.enrollmentId || null,
        source: input.source || 'unknown',
      },
    }
  );

  const row = rows[0];
  return { created: !!row, registration_id: row?.id ?? null };
}

/** How many people have registered here for one event. */
export async function countOpenHouseRegistrations(eventId: string): Promise<number> {
  const rows = await sequelize.query<{ n: string }>(
    `SELECT COUNT(*) AS n FROM open_house_registrations WHERE event_id = :eventId`,
    { type: QueryTypes.SELECT, replacements: { eventId: String(eventId) } }
  );
  return Number(rows[0]?.n ?? 0);
}

export interface OpenHouseRegistrationRow {
  email_lower: string;
  name: string | null;
  enrollment_id: string | null;
  source: string;
  created_at: Date;
}

/**
 * The attendee list for one event, newest first. Capped rather than unbounded:
 * this backs a staff view, and an Open House that somehow took 50,000 signups
 * should degrade to a long page rather than to a dead backend.
 */
export async function listOpenHouseRegistrations(
  eventId: string,
  limit = 1000
): Promise<OpenHouseRegistrationRow[]> {
  const capped = Math.max(1, Math.min(5000, Math.floor(limit)));
  return sequelize.query<OpenHouseRegistrationRow>(
    `SELECT email_lower, name, enrollment_id, source, created_at
       FROM open_house_registrations
      WHERE event_id = :eventId
      ORDER BY created_at DESC
      LIMIT :limit`,
    { type: QueryTypes.SELECT, replacements: { eventId: String(eventId), limit: capped } }
  );
}
