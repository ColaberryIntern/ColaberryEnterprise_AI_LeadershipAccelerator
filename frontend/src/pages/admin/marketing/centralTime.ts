import { brandLocal, DEFAULT_BRAND_TIMEZONE } from './calendarTime';

/**
 * centralTime - every time on the marketing screens is read and typed in US Central.
 *
 * Ali's rule (2026-09-18): times show only Central. Before this, the screens used three clocks:
 * UTC columns on the Content and Publishing queues and in the composer's log, the brand's zone
 * beside a UTC cell in the composer's confirmation, and the VIEWER's own laptop clock in the
 * schedule box, the calendar and the Overview. An operator whose laptop is set to another zone
 * would type 9:00 meaning Central and schedule the post for 9:00 somewhere else.
 *
 * The zone abbreviation is kept (CDT in summer, CST from Nov 1) because on the fall-back night
 * 1:30 AM happens twice, and the abbreviation is the only thing that tells the two apart.
 *
 * TYPING A TIME is the other half and the one that was actually broken. The composer loaded a
 * saved time into its `datetime-local` box as the UTC wall clock (`scheduled_for.slice(0, 16)`)
 * and saved the box back as the browser's LOCAL wall clock (`new Date(value)`). Opening a
 * scheduled post and pressing "Set time" without touching it moved the post five hours later.
 * `toCentralInput` / `fromCentralInput` are the matched pair that replace both halves.
 */

export const CENTRAL = DEFAULT_BRAND_TIMEZONE;

/** "Fri, Sep 18, 9:45 AM CDT", or null for a missing or unreadable instant. */
export function formatCentral(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const l = brandLocal(iso, CENTRAL);
  return l ? `${l.dayLabel}, ${l.time} ${l.zone}` : null;
}

/** "Sep 18, 2026" in Central - the calendar day an instant falls on HERE, not in the viewer's zone. */
export function formatCentralDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', { timeZone: CENTRAL, month: 'short', day: 'numeric', year: 'numeric' }).format(d);
}

function centralParts(ms: number): { y: number; mo: number; d: number; h: number; mi: number } {
  const p: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-US', {
    timeZone: CENTRAL, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(ms))) {
    p[part.type] = part.value;
  }
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute };
}

const pad = (n: number) => String(n).padStart(2, '0');
const HOUR = 3_600_000;

/** A UTC instant as the `YYYY-MM-DDTHH:mm` a `datetime-local` box shows, in Central. */
export function toCentralInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const p = centralParts(ms);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}

/**
 * A `YYYY-MM-DDTHH:mm` typed as a CENTRAL wall clock, as a UTC ISO instant. Null if unreadable.
 *
 * Never `new Date(value)`, which reads it in the browser's zone. Central is only ever UTC-5 (CDT)
 * or UTC-6 (CST), so both readings are tried and the one Central reads back as typed is kept -
 * checkable by hand, with no offset arithmetic to get wrong.
 *
 * The two DST edges, decided rather than left to chance:
 *   - Fall back (1:00-1:59 AM happens twice): both readings are valid; the EARLIER one (CDT) wins.
 *   - Spring forward (2:00-2:59 AM does not exist): neither is valid; the clock is moved on an
 *     hour, so 2:30 becomes 3:30 CDT - what a person means by "2:30" on a morning that skips it.
 */
export function fromCentralInput(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  if (Number.isNaN(wall)) return null;

  for (let shift = 0; shift <= 1; shift += 1) {
    const target = wall + shift * HOUR;
    const want = new Date(target).toISOString().slice(0, 16);
    const valid = [target + 5 * HOUR, target + 6 * HOUR].filter((ms) => toCentralInput(new Date(ms).toISOString()) === want);
    if (valid.length > 0) return new Date(Math.min(...valid)).toISOString();
  }
  return null;
}
