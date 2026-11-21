import type { PlacementInterview } from '../interviewsApi';

/**
 * Career Prep v27, CP8.3: "Add to calendar" for a booked interview, built in the browser (PURE). The event's link is the
 * consent-room PAGE on this site (`<origin>/portal/career/interview/<id>`), the same link the booking email carries;
 * it is never the meeting provider's link (the sheet is never given one). Text is escaped per RFC 5545.
 */
const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export function interviewIcs(i: PlacementInterview, origin: string, now: number): string | null {
  if (i.state !== 'booked' || !i.startsAt || !i.roomPage) return null;
  const start = Date.parse(i.startsAt);
  const page = `${origin.replace(/\/$/, '')}${i.roomPage}`;
  const title = `Interview: ${i.company ?? 'employer'}${i.role ? `, ${i.role}` : ''}`;
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Refactored//Career Prep//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:placement-${i.id}@refactored.ai`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(start + i.minutes * 60_000)}`,
    `SUMMARY:${esc(title)}`, `DESCRIPTION:${esc(`Join from the room page: ${page}`)}`, `URL:${page}`,
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}

/** The download link's href (a data URL, so no server round trip and nothing stored). */
export function icsHref(ics: string): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}
