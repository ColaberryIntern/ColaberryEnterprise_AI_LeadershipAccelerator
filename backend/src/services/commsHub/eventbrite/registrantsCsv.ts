import { csvCell } from '../../broadcast/broadcastClipListExport';
import type { Registrant, RegistrantList } from './registrants';

/**
 * The registrants download (CH9.3). RFC 4180 via the repo's `csvCell` (quotes a cell holding a comma,
 * quote or line break; doubles quotes), CRLF line endings, a UTF-8 byte-order mark so Excel reads
 * accented names correctly.
 *
 * FORMULA INJECTION. A registrant typed their own name into Eventbrite. A name like `=HYPERLINK(...)`
 * or `+1 555...` would run as a formula when the file is opened in a spreadsheet. Any cell starting
 * with = + - @, a tab or a carriage return is prefixed with an apostrophe, which spreadsheets show
 * as text. The same data always gives the same bytes (rows arrive sorted from mergeRegistrants).
 */
export const CSV_COLUMNS = ['Name', 'Email', 'Phone', 'Registered (Central)', 'Source', 'Has platform account'] as const;

export function safeCell(value: string): string {
  const s = String(value ?? '');
  return csvCell(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
}

const central = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
});
export function centralStamp(iso: string | null): string {
  return iso ? central.format(new Date(iso)) : '';
}

const SOURCE_LABEL: Record<string, string> = { eventbrite: 'Eventbrite', site: 'Our site' };

export function registrantsCsv(rows: ReadonlyArray<Registrant>): string {
  const lines = [CSV_COLUMNS.map((c) => safeCell(c)).join(',')];
  for (const r of rows) {
    lines.push([
      safeCell(r.name), safeCell(r.email), safeCell(r.phone), safeCell(centralStamp(r.registered_at)),
      safeCell(r.sources.map((s) => SOURCE_LABEL[s] ?? s).join(' + ')), safeCell(r.has_account ? 'Yes' : 'No'),
    ].join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** `registrants-<title-slug>-<event date, Central>.csv`: the event's date, not today's, so the name is stable. */
export function registrantsFilename(event: RegistrantList['event']): string {
  const slug = event.title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'event';
  const day = event.starts_at
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(event.starts_at))
    : event.ccpp_event_id;
  return `registrants-${slug}-${day}.csv`;
}
