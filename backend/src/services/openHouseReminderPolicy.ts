
/**
 * Who gets reminded about an Open House, and when.
 *
 * ── THE RULE THAT GOVERNS THIS FILE ─────────────────────────────────────────
 *
 * An Open House reminder goes to the people who registered for THAT event, and
 * to nobody else.
 *
 * That is not a preference. The scheduler's existing path picks recipients by
 * cohort, and Open House registrants are Explorers: the Explorer cohort held 957
 * accounts on 2026-11-10 against 2 registrations. Pointing an Open House session
 * at that cohort would mail 957 people who never asked, from a cron that fires
 * with nobody watching. Ali's standing rule is never to bulk-email students, and
 * he confirmed the scoping explicitly on 2026-11-10.
 *
 * So this module FAILS CLOSED. Every function here answers "nobody" when it
 * cannot answer confidently, and the scheduler is written so that an Open House
 * session which cannot resolve its registrations sends to an empty list rather
 * than falling through to the cohort. A missed reminder can be re-sent by hand;
 * 957 unwanted emails cannot be recalled.
 */

/** Which reminder a session is currently due, if any. */
export type ReminderWindow = '24h' | '1h';

/**
 * The 1-hour window is generous at two hours, and the 24-hour window runs from
 * there to 26. Both are wider than the 30-minute sweep that drives them, because
 * a window narrower than the sweep is a window the sweep can step over - a
 * session 59 minutes out at one tick and 29 at the next would never be inside a
 * strict "one hour" test.
 */
export const ONE_HOUR_WINDOW_MAX_HOURS = 2;
export const DAY_WINDOW_MAX_HOURS = 26;

/**
 * Which reminder is due for a session this many hours away.
 *
 * Deliberately a function of the SESSION's distance alone, which is what makes
 * the late-registrant case correct without a special case for it: once an event
 * is under two hours away the answer is '1h' for everybody, so somebody who
 * registers at that point can only ever be sent the 1-hour note. Their 24-hour
 * stamp stays null for ever and nothing fires on it, because the 24-hour window
 * is already behind them.
 *
 * Returns null once the session has started: a reminder for something already
 * under way is worse than silence.
 */
export function reminderWindowFor(hoursUntilStart: number): ReminderWindow | null {
  if (!Number.isFinite(hoursUntilStart)) return null;
  if (hoursUntilStart <= 0) return null;
  if (hoursUntilStart <= ONE_HOUR_WINDOW_MAX_HOURS) return '1h';
  if (hoursUntilStart <= DAY_WINDOW_MAX_HOURS) return '24h';
  return null;
}

/** Hours from `now` until the session starts. Negative once it has begun. */
export function hoursUntil(startsAt: Date, now: Date): number {
  return (startsAt.getTime() - now.getTime()) / (60 * 60 * 1000);
}

/** The column that records a given window, so the two cannot be mixed up at a call site. */
export function stampColumnFor(window: ReminderWindow): 'reminder_24h_sent_at' | 'reminder_1h_sent_at' {
  return window === '1h' ? 'reminder_1h_sent_at' : 'reminder_24h_sent_at';
}

/** A session is an Open House exactly when it carries an Eventbrite event id. */
export function openHouseEventIdOf(session: { open_house_event_id?: string | null } | null | undefined): string | null {
  const id = session?.open_house_event_id;
  return typeof id === 'string' && id.trim() !== '' ? id.trim() : null;
}
