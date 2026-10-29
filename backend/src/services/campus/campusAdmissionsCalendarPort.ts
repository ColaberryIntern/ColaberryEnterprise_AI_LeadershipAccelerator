import { getTestOverrides } from '../settingsService';
import { getAvailableSlots, findEventsByPrivateProperty, insertCampusEvent, cancelCalendarEvent } from '../calendarService';
import { admissionsCalendar } from '../calendarTarget';
import type { AdmissionsCalendarPort } from './campusAdmissionsCall';
import { memoryAdmissionsCalendar } from './campusAdmissionsMemoryCalendar';

/**
 * The admissions calendar the campus books on (C20). Production: the Google calendar behind calendarService. The in-memory one
 * only when CAMPUS_CALENDAR_STUB=1 and NODE_ENV is not 'production' (the local e2e), so a stray env var can never fake bookings
 * in production. One memory calendar per process, so a booking survives between requests in a local run.
 */
let memory: ReturnType<typeof memoryAdmissionsCalendar> | null = null;

export function stubAllowed(e: NodeJS.ProcessEnv = process.env): boolean {
  return e.CAMPUS_CALENDAR_STUB === '1' && e.NODE_ENV !== 'production';
}

export function admissionsCalendarPort(): AdmissionsCalendarPort {
  if (stubAllowed()) return (memory ??= memoryAdmissionsCalendar());
  // C90: the admissions calendar (Roselen in production), not the strategy-call calendar; unset = the same calendar as before
  const target = admissionsCalendar();
  return {
    getAvailableSlots: (days) => getAvailableSlots(days, target),
    findEventsByPrivateProperty: (key, value, timeMin) => findEventsByPrivateProperty(key, value, timeMin, target),
    insertCampusEvent: (input) => insertCampusEvent(input, target),
    cancelCalendarEvent: (eventId) => cancelCalendarEvent(eventId, target),
    ownerEmail: target.ownerEmail,
    async testRedirect() {
      const t = await getTestOverrides();
      return t.enabled && t.email ? t.email : null;
    },
  };
}
