/**
 * Pins the day word that goes out in reminder emails.
 *
 * The defect: sendSessionReminder hardcoded "Tomorrow" for every non-1-hour
 * reminder, on the assumption that the "24-hour reminder" fires 24 hours out.
 * It fires on a ROLLING window and is re-armed by any backend restart, so on
 * 2026-08-13 a 9:30 AM Central sweep announced that evening's 6:30 PM Central
 * Session 7 as "Tomorrow". These tests hold the label to calendar days in
 * Central time, which is the only reading that makes "Today"/"Tomorrow" true.
 */

import { sessionDayLabel } from '../centralDate';

// 2026-08-13 09:30 CDT — the exact instant the bad reminder went out.
const INCIDENT_SEND = Date.parse('2026-08-13T14:30:00Z');

describe('sessionDayLabel', () => {
  it('says Today for the class that was announced as Tomorrow', () => {
    // The reported email: Session 7, session_date 2026-08-13, 6:30 PM CDT,
    // reminder sent 9:30 AM the same Central day.
    expect(sessionDayLabel('2026-08-13', INCIDENT_SEND)).toBe('Today');
  });

  it('still says Tomorrow when the class really is the next day', () => {
    expect(sessionDayLabel('2026-08-14', INCIDENT_SEND)).toBe('Tomorrow');
  });

  it('is driven by calendar days, not by hours remaining', () => {
    // Both of these are inside the cron's rolling 24h window. The 9-hour-out
    // class is Today; the 20-hour-out class crosses midnight and is Tomorrow.
    // Hour-counting cannot tell these apart — that was the whole bug.
    const nineHoursOut = Date.parse('2026-08-13T14:30:00Z'); // 9:30 AM CDT -> 6:30 PM CDT
    const twentyHoursOut = Date.parse('2026-08-12T22:30:00Z'); // 5:30 PM CDT -> next-day 1:30 PM
    expect(sessionDayLabel('2026-08-13', nineHoursOut)).toBe('Today');
    expect(sessionDayLabel('2026-08-13', twentyHoursOut)).toBe('Tomorrow');
  });

  it('uses the Central day, not the container UTC day', () => {
    // 2026-08-14 02:00 UTC is still 9:00 PM CDT on 08-13. A UTC-based label
    // would call an 08-14 class "Today"; in Central it is Tomorrow.
    const lateEveningCentral = Date.parse('2026-08-14T02:00:00Z');
    expect(sessionDayLabel('2026-08-13', lateEveningCentral)).toBe('Today');
    expect(sessionDayLabel('2026-08-14', lateEveningCentral)).toBe('Tomorrow');
  });

  it('names the day for anything further out', () => {
    expect(sessionDayLabel('2026-08-17', INCIDENT_SEND)).toBe('Monday, Aug 17');
  });

  it('names the day rather than lying about a past date', () => {
    // Should never happen (reminders only fire for future sessions), but the
    // failure mode must not be a confident "Today".
    expect(sessionDayLabel('2026-08-10', INCIDENT_SEND)).toBe('Monday, Aug 10');
  });

  it('holds across the DST boundaries the teaching year crosses', () => {
    // 2026 US DST: begins Mar 8, ends Nov 1. Day arithmetic must not drift.
    const dstStartEve = Date.parse('2026-03-07T18:00:00Z'); // Mar 7, noon CST
    expect(sessionDayLabel('2026-03-07', dstStartEve)).toBe('Today');
    expect(sessionDayLabel('2026-03-08', dstStartEve)).toBe('Tomorrow');

    const dstEndEve = Date.parse('2026-10-31T17:00:00Z'); // Oct 31, noon CDT
    expect(sessionDayLabel('2026-10-31', dstEndEve)).toBe('Today');
    expect(sessionDayLabel('2026-11-01', dstEndEve)).toBe('Tomorrow');
  });

  it('degrades to a neutral word rather than an empty subject line', () => {
    // An empty return would render "[Accelerator] : Session 7 - ...".
    for (const bad of ['', 'TBD', 'not-a-date', '08/13/2026']) {
      expect(sessionDayLabel(bad, INCIDENT_SEND)).toBe('Upcoming');
    }
    expect(sessionDayLabel(undefined as any, INCIDENT_SEND)).toBe('Upcoming');
  });
});
