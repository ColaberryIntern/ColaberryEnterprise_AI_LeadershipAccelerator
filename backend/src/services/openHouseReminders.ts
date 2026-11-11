import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { type ReminderWindow, stampColumnFor } from './openHouseReminderPolicy';

/**
 * Reading and stamping the Open House reminder list.
 *
 * The DECISIONS live in `openHouseReminderPolicy.ts`, which touches no database
 * so it can be tested without one. This half is the queries.
 *
 * Both halves obey the same rule: an Open House reminder goes to the people who
 * registered for THAT event and nobody else. Every function here answers
 * "nobody" when it cannot answer confidently, because the alternative is mail to
 * the Explorer cohort - 957 accounts on 2026-11-10 against 2 registrations - and
 * a missed reminder can be re-sent by hand while mail that went out cannot be
 * recalled.
 */

export interface ReminderRecipient {
  registration_id: string;
  email: string;
  name: string | null;
  /** Null when the account could not be linked; suppression cannot be checked for them. */
  enrollment_id: string | null;
}

/**
 * The people registered for this event who have not had this window's reminder.
 *
 * Ordered and capped: a sweep that tried to mail an unbounded list inside a cron
 * tick would hold the loop open long enough to overlap the next one.
 */
export async function listRegistrationsAwaitingReminder(
  eventId: string,
  window: ReminderWindow,
  limit = 500,
): Promise<ReminderRecipient[]> {
  if (!eventId || !eventId.trim()) return []; // fail closed
  const column = stampColumnFor(window);
  return sequelize.query<ReminderRecipient>(
    `SELECT id AS registration_id, email_lower AS email, name, enrollment_id
       FROM open_house_registrations
      WHERE event_id = :eventId
        AND ${column} IS NULL
        AND email_lower IS NOT NULL
        AND email_lower <> ''
      ORDER BY created_at ASC
      LIMIT :limit`,
    {
      replacements: { eventId: eventId.trim(), limit: Math.max(1, Math.min(2000, Math.floor(limit))) },
      type: QueryTypes.SELECT,
    },
  );
}

/**
 * Record that this registration has had this window's reminder.
 *
 * Stamped per recipient, immediately after their send, so an interrupted sweep
 * re-sends at most the one in flight rather than the whole list. `IS NULL` in
 * the predicate makes a double-stamp a no-op instead of a silent overwrite of
 * when the first one actually went.
 */
export async function markRegistrationReminded(
  registrationId: string,
  window: ReminderWindow,
  at: Date = new Date(),
): Promise<void> {
  const column = stampColumnFor(window);
  await sequelize.query(
    `UPDATE open_house_registrations
        SET ${column} = :at
      WHERE id = :id AND ${column} IS NULL`,
    { replacements: { id: registrationId, at }, type: QueryTypes.UPDATE },
  );
}

/** How many of this event's registrations are still awaiting each window, for logging. */
export async function countAwaitingReminders(eventId: string): Promise<{ day: number; hour: number }> {
  if (!eventId || !eventId.trim()) return { day: 0, hour: 0 };
  const rows = await sequelize.query<{ day: string; hour: string }>(
    `SELECT COUNT(*) FILTER (WHERE reminder_24h_sent_at IS NULL)::text AS day,
            COUNT(*) FILTER (WHERE reminder_1h_sent_at IS NULL)::text AS hour
       FROM open_house_registrations WHERE event_id = :eventId`,
    { replacements: { eventId: eventId.trim() }, type: QueryTypes.SELECT },
  );
  return { day: Number(rows[0]?.day ?? 0), hour: Number(rows[0]?.hour ?? 0) };
}
