/**
 * Parse a session start time to a 24-hour "HH:MM" string, or null if unparseable.
 * Accepts 12-hour ("1:00 PM", "12:00 AM") and 24-hour ("13:00", "9:00",
 * "18:30:00") inputs — the DB stores live_sessions start/end times as
 * "HH:MM:SS", so the trailing seconds must be optional here too, matching
 * parseTimeParts below (the earlier miss silently broke every "next class"
 * countdown target since none of them actually reach a real session row
 * without the ":00" hour a plain "HH:MM" match would require).
 *
 * Extracted from PortalSessionDetailPage so the AM/PM conversion (the source of the
 * earlier NaN-countdown bug) is unit-testable in isolation, per the BUILD-BREAK-HARDEN
 * rule that each fix ships with a test reproducing the original break.
 */
export function parseSessionTimeToHHMM(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = String(raw).match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = match[2];
  const period = match[3]?.toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  if (h > 23 || Number(m) > 59) return null;
  return `${String(h).padStart(2, '0')}:${m}`;
}

const SUPPORTED_ZONES = new Set([
  'America/Chicago',
  'America/New_York',
  'America/Denver',
  'America/Los_Angeles',
]);

/**
 * DST-aware short zone label for a cohort's IANA timezone on a given date
 * (e.g. "America/Chicago" → "CDT" in July, "CST" in January). Takes the
 * session date rather than "now" so a card is labeled correctly whether it's
 * viewed on the session day or in advance. Returns "" for an unsupported/
 * unknown/missing zone so the caller renders the time without a misleading
 * suffix.
 */
export function tzAbbrev(timezone: string | null | undefined, dateStr?: string | null): string {
  if (!timezone || !SUPPORTED_ZONES.has(timezone)) return '';
  const d = dateStr ? new Date(`${dateStr}T12:00:00`) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'short', hour: 'numeric' }).formatToParts(d);
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

/** Parse "HH:MM:SS", "HH:MM" (24h), or "h:mm AM/PM" into 24h {h, m}, or null if unparseable. */
function parseTimeParts(raw: string | null | undefined): { h: number; m: number } | null {
  if (!raw) return null;
  const match = String(raw).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const period = match[3]?.toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  if (h > 23 || m > 59) return null;
  return { h, m };
}

function to12Hour(parts: { h: number; m: number }): { clock: string; period: 'AM' | 'PM' } {
  const period = parts.h >= 12 ? 'PM' : 'AM';
  const h12 = parts.h % 12 === 0 ? 12 : parts.h % 12;
  return { clock: `${h12}:${String(parts.m).padStart(2, '0')}`, period };
}

/** Format a session time string (any supported input shape) as a friendly 12-hour clock time, e.g. "18:30:00" → "6:30 PM". Returns null if unparseable. */
export function formatSessionTime(raw: string | null | undefined): string | null {
  const parts = parseTimeParts(raw);
  if (!parts) return null;
  const { clock, period } = to12Hour(parts);
  return `${clock} ${period}`;
}

/**
 * Live class times are stored as Central wall-clock strings — the backend's
 * scheduling math treats them that way unconditionally (see
 * backend/src/services/centralDate.ts `classInstant`), so Central is what these
 * digits actually mean regardless of who is reading them.
 */
export const CENTRAL_TZ = 'America/Chicago';

/**
 * How far ahead of UTC the Central clock is at a given instant, in ms (negative
 * here, since Central is behind UTC). Read from Intl's own zone database rather
 * than a hardcoded offset, so CST and CDT are both correct and the DST boundary
 * needs no special case.
 */
function centralOffsetMs(atMs: number): number {
  const p: Record<string, number> = {};
  for (const part of new Intl.DateTimeFormat('en-US', {
    timeZone: CENTRAL_TZ,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(atMs))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  // Some ICU builds render midnight as "24" even under h23 - the same guard
  // backend/src/services/centralDate.ts carries, for the same reason.
  const hour = p.hour === 24 ? 0 : p.hour;
  return atMs - Date.UTC(p.year, p.month - 1, p.day, hour, p.minute);
}

/**
 * The REAL INSTANT a class starts, as an ISO string ending in `Z`, from its
 * stored Central wall-clock digits. Returns null when the date or time cannot
 * be read, so a caller shows no countdown rather than a NaN one.
 *
 * WHY THIS EXISTS. Every "next class" countdown in the portal used to build its
 * target as a bare `${session_date}T${hh}:${mm}:00` string and hand it to
 * `new Date()`, which reads a string carrying no zone as the VIEWER'S OWN local
 * time. The stored digits are Central (see CENTRAL_TZ above), so the countdown
 * silently ran long by the viewer's distance from Central: two hours for a
 * student on the Pacific coast, four for one in Hawaii, and nothing at all for
 * the Central-time staff who read it every week, which is why it survived this
 * long.
 *
 * Reported by a student 2026-11-22: the card read "1 day and 51 minutes" at
 * 5:38 PM Pacific for a class 22 hours 52 minutes away. It printed the correct
 * "6:30 PM CST" directly above that wrong number.
 *
 * It matters beyond the digits. The backend decides when a session flips to
 * `live` using Central unconditionally (`centralDate.ts` `classInstant`), so a
 * viewer-local countdown also disagreed with the server about whether class had
 * started. Anchoring both to Central is what keeps them in step.
 *
 * TWO PASSES, because the offset in force at the naive timestamp is not
 * necessarily the one in force at the target - the second pass re-reads it at
 * the answer. Same shape as the proven converter in the Comms Hub composer
 * (`components/admin/commsHub/compose/centralTime.ts`), which the portal has no
 * way to reach; this is the shared home for the student-facing surfaces.
 */
export function sessionStartInstant(
  dateStr: string | null | undefined,
  rawTime: string | null | undefined,
): string | null {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) return null;
  const hhmm = parseSessionTimeToHHMM(rawTime);
  if (!hhmm) return null;
  const naive = Date.parse(`${dateStr}T${hhmm}:00Z`);
  if (Number.isNaN(naive)) return null;
  const firstPass = naive + centralOffsetMs(naive);
  const ms = naive + centralOffsetMs(firstPass);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/**
 * A stored session time rendered with its true, DST-aware zone label, e.g.
 * ("18:30:00", "2026-08-10") → "6:30 PM CDT".
 *
 * Exists because three surfaces were each appending a hardcoded " ET" to the
 * raw string, printing "18:30:00 ET" for a 6:30 PM Central class (reported by
 * staff 2026-08-11). Deriving the suffix from the session date also keeps it
 * honest across the DST boundary, where a hardcoded "CST" would be wrong for
 * most of the teaching year.
 */
export function formatCentralSessionTime(raw: string | null | undefined, dateStr?: string | null): string {
  const clock = formatSessionTime(raw);
  if (!clock) return raw ? String(raw) : '';
  const zone = tzAbbrev(CENTRAL_TZ, dateStr);
  return zone ? `${clock} ${zone}` : clock;
}

/** As formatCentralSessionTime, for a start/end pair: "6:30 - 8:30 PM CDT". */
export function formatCentralSessionRange(
  start: string | null | undefined,
  end: string | null | undefined,
  dateStr?: string | null
): string {
  const range = formatSessionTimeRange(start, end);
  if (!range) return '';
  const zone = tzAbbrev(CENTRAL_TZ, dateStr);
  return zone ? `${range} ${zone}` : range;
}

/**
 * Format a start/end pair as a single 12-hour range, collapsing a shared
 * AM/PM suffix (e.g. "18:30:00"/"20:30:00" → "6:30 - 8:30 PM"; a range that
 * crosses noon keeps both suffixes, e.g. "11:30 AM - 1:30 PM"). Falls back to
 * joining the raw strings if either side is unparseable, so a malformed value
 * degrades to visible-but-ugly rather than disappearing.
 */
export function formatSessionTimeRange(start: string | null | undefined, end: string | null | undefined): string {
  const startParts = parseTimeParts(start);
  const endParts = parseTimeParts(end);
  if (!startParts || !endParts) return [start, end].filter(Boolean).join(' - ');
  const startFmt = to12Hour(startParts);
  const endFmt = to12Hour(endParts);
  return startFmt.period === endFmt.period
    ? `${startFmt.clock} - ${endFmt.clock} ${endFmt.period}`
    : `${startFmt.clock} ${startFmt.period} - ${endFmt.clock} ${endFmt.period}`;
}
