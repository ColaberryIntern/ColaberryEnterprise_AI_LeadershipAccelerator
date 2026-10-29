import { env } from '../config/env';

/**
 * WHICH CALENDAR A BOOKING GOES ON (Basecamp C90). Ali, 2026-10-29: "the Admissions calls that were booked are going on my
 * calendar instead of the Admissions / Rose's calendar."
 *
 *  - default:    GOOGLE_CALENDAR_ID, acting as GOOGLE_CALENDAR_OWNER_EMAIL. What every booking used before; still the
 *                fallback, and where calls booked before the switch live.
 *  - admissions: ADMISSIONS_CALENDAR_ID, acting as ADMISSIONS_CALENDAR_OWNER_EMAIL (or the calendar id itself when that is an
 *                email, a person's primary calendar). Used by every admissions booking: the campus "Talk to a person" call, the
 *                admissions appointment agent, Maya's booking tool and (Ali, 2026-10-29: "Roselen should get booked all
 *                these") the website's strategy-call form, for availability, the booking and the prep notes.
 *
 * While ADMISSIONS_CALENDAR_ID is unset, admissions resolves to the default target, so shipping this changes nothing until the
 * setting is made. The service account must be allowed to act as the owner (domain-wide delegation, checked before setting it).
 */
export interface CalendarTarget {
  kind: 'default' | 'admissions';
  calendarId: string;
  /** The Workspace user the service account acts as (needed for Meet links); null = the service account itself. */
  ownerEmail: string | null;
}

export function defaultCalendar(): CalendarTarget {
  return { kind: 'default', calendarId: env.googleCalendarId, ownerEmail: env.googleCalendarOwnerEmail || null };
}

export function admissionsCalendar(): CalendarTarget {
  const id = env.admissionsCalendarId;
  if (!id) return defaultCalendar();
  const owner = env.admissionsCalendarOwnerEmail || (id.includes('@') ? id : null);
  return { kind: 'admissions', calendarId: id, ownerEmail: owner };
}
