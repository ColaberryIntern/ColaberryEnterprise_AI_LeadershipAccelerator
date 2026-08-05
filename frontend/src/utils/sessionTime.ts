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
