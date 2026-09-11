/**
 * calendarTime — render a UTC instant in a brand's local time, correctly across DST.
 *
 * THE RULE: STORE UTC, RENDER LOCAL, NEVER DO ARITHMETIC IN LOCAL TIME. A scheduled post is an
 * instant. The brand's wall-clock reading of that instant is derived at render time by the
 * platform's timezone database, which knows when each zone shifts. Every DST bug this codebase
 * has had came from the other direction - taking a wall-clock string, building a Date from it
 * in the browser's zone, and doing day arithmetic on the result. That is one hour wrong twice a
 * year and the wrong day for anyone near midnight.
 *
 * THE FALL-BACK HOUR IS THE CASE THAT MATTERS. On 2026-11-01, America/Chicago reads 01:30 twice:
 * once at 06:30Z (CDT, -05:00) and once at 07:30Z (CST, -06:00). A calendar that shows "1:30 AM"
 * for both without the offset has rendered two different instants identically, and an operator
 * cannot tell which one their post goes out at. So the offset is part of the rendering, not
 * decoration.
 */

export const DEFAULT_BRAND_TIMEZONE = 'America/Chicago';

export interface BrandLocalTime {
  /** YYYY-MM-DD in the brand's zone - the calendar day the item belongs to. */
  day: string;
  /** e.g. "9:00 AM" */
  time: string;
  /** e.g. "CDT" or "CST" - the short zone name in force at that instant. */
  zone: string;
  /** e.g. "-05:00" - the numeric offset in force at that instant. */
  offset: string;
  /** e.g. "Sat, Oct 31" */
  dayLabel: string;
}

function parts(utcIso: string, timeZone: string, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, ...options });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(utcIso))) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  return out;
}

/**
 * Is this a timezone the platform recognises? Used at the write boundary so a brand cannot be
 * saved with "CST" (ambiguous - Central Standard or China Standard) or a typo.
 */
export function isValidTimeZone(tz: string): boolean {
  // ICU accepts legacy single-word aliases like "CST", "EST" and "MST". Those are exactly the
  // ambiguous forms this check exists to refuse ("CST" is Central Standard in one place and
  // China Standard in another), so the platform's own acceptance is necessary but not
  // sufficient: the name must also be the IANA Area/Location form, or UTC itself.
  if (tz !== 'UTC' && !tz.includes('/')) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function brandLocal(utcIso: string, timeZone: string = DEFAULT_BRAND_TIMEZONE): BrandLocalTime | null {
  const ms = Date.parse(utcIso);
  if (Number.isNaN(ms)) return null;

  const d = parts(utcIso, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' });
  const o = parts(utcIso, timeZone, { timeZoneName: 'longOffset' });
  const l = parts(utcIso, timeZone, { weekday: 'short', month: 'short', day: 'numeric' });

  // longOffset yields "GMT-05:00"; "GMT" alone means +00:00.
  const rawOffset = o.timeZoneName ?? 'GMT';
  const offset = rawOffset === 'GMT' ? '+00:00' : rawOffset.replace('GMT', '');

  return {
    day: `${d.year}-${d.month}-${d.day}`,
    time: `${d.hour}:${d.minute} ${d.dayPeriod}`,
    zone: d.timeZoneName ?? timeZone,
    offset,
    dayLabel: `${l.weekday}, ${l.month} ${l.day}`,
  };
}

export interface CalendarItem {
  id: string;
  brandId: string;
  brandName: string;
  brandTimeZone: string | null;
  channel: string;
  title: string;
  /** UTC instant. */
  scheduledFor: string;
  status: string;
}

export interface CalendarDay {
  /** YYYY-MM-DD in the VIEWER's chosen zone. */
  day: string;
  items: Array<CalendarItem & { local: BrandLocalTime }>;
}

/**
 * Group items by calendar day in ONE zone, so a cross-brand view has one set of columns.
 *
 * A calendar showing two brands in two zones cannot put "Tuesday" in one place: a post at
 * 23:30 Chicago is Wednesday in London. So the grid is laid out in the viewer's chosen zone,
 * and each item additionally carries its BRAND-local rendering so the operator sees both -
 * where it sits on their grid, and what time it goes out where the audience is.
 */
export function groupByDay(items: readonly CalendarItem[], viewerTimeZone: string): CalendarDay[] {
  const byDay = new Map<string, CalendarDay['items']>();

  for (const item of items) {
    const local = brandLocal(item.scheduledFor, item.brandTimeZone ?? DEFAULT_BRAND_TIMEZONE);
    const viewer = brandLocal(item.scheduledFor, viewerTimeZone);
    // An unparseable schedule has no day. Dropping it silently would hide a broken item; it is
    // filed under a sentinel day the UI renders as "unscheduled / invalid" instead.
    const key = viewer?.day ?? 'invalid';
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push({ ...item, local: local ?? { day: 'invalid', time: '—', zone: '', offset: '', dayLabel: 'Invalid time' } });
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, dayItems]) => ({
      day,
      items: [...dayItems].sort((a, b) => Date.parse(a.scheduledFor) - Date.parse(b.scheduledFor)),
    }));
}
