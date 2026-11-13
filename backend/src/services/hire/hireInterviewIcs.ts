/**
 * hireInterviewIcs - the calendar file for a confirmed Hire interview (kit §4.2 "on confirm,
 * send both sides an .ics with the room link"). Pure: no I/O, so every line is unit-tested.
 *
 * NO ADDRESSES IN THE FILE. An .ics normally lists ORGANIZER and ATTENDEE mailto: lines, and
 * every recipient's calendar shows them. Hire's rule is that no email is exchanged until both
 * sides want to continue, so the event carries neither, and is sent as METHOD:PUBLISH (an event
 * to add, not an invitation to answer). Each side gets its own message with its own copy.
 *
 * STABLE UID, RISING SEQUENCE. The UID is the interview id, so a re-sent or re-timed file
 * updates the same calendar entry instead of adding a second one; SEQUENCE is the start time in
 * minutes, which only grows when the time moves.
 *
 * RFC 5545 details that calendars actually enforce: CRLF line ends, text escaping of `\ ; , \n`,
 * and lines folded at 75 octets (counted in UTF-8 bytes, never splitting a character).
 */

export interface IcsEvent {
  readonly interviewId: string;
  readonly start: Date;
  readonly minutes: number;
  readonly summary: string;
  readonly description: string;
  readonly roomUrl: string | null;
  readonly now: Date;
}

/** `20261116T150000Z` */
export function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold one content line at 75 octets; continuation lines start with a single space. */
export function icsFold(line: string): string {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, 'utf8');
    const limit = out.length === 0 ? 75 : 74; // a continuation's leading space counts
    if (bytes + n > limit) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function buildInterviewIcs(e: IcsEvent): string {
  const end = new Date(e.start.getTime() + e.minutes * 60_000);
  const location = e.roomUrl ?? 'Refactored room (the link follows from the Colaberry team)';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Refactored.ai//Hire interviews//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:hire-interview-${e.interviewId}@hire.refactored.ai`,
    `SEQUENCE:${Math.floor(e.start.getTime() / 60_000)}`,
    `DTSTAMP:${icsDate(e.now)}`,
    `DTSTART:${icsDate(e.start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(e.summary)}`,
    `DESCRIPTION:${icsEscape(e.description)}`,
    `LOCATION:${icsEscape(location)}`,
    ...(e.roomUrl ? [`URL:${e.roomUrl}`] : []),
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Interview in 10 minutes',
    'TRIGGER:-PT10M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(icsFold).join('\r\n') + '\r\n';
}
