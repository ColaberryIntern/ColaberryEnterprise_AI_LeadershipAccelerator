/**
 * Central-time date key — the ONE timezone boundary used across the points
 * economy (daily streaks, daily anti-cheat caps, the HUD's notion of "today").
 * Extracted into its own module so streakService and pointsService share a
 * single tz definition rather than each carrying its own copy (CLAUDE.md: a
 * dependency two modules share belongs in a third module they both import,
 * never A→B→A). Pure — no clock, no I/O, deterministic for a given instant.
 */

export const CENTRAL_TZ = 'America/Chicago';

/** 'YYYY-MM-DD' for an instant (epoch ms) as seen in Central time. */
export function centralDateKey(ms: number): string {
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: CENTRAL_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * A naive wall-clock (its UTC getters carry the raw digits, e.g. built via
 * `new Date("2026-07-23T18:30:00Z")`) re-interpreted as Central time, DST-aware,
 * to recover the true instant. Originated in publicEventsService.ts for CCPP's
 * mssql driver (which reads Central wall-clock datetimes into UTC fields);
 * re-homed here so any module needing "this Central wall-clock, as an instant"
 * shares one implementation.
 */
export function centralWallClockToInstant(naive: Date): Date {
  const guess = Date.UTC(
    naive.getUTCFullYear(), naive.getUTCMonth(), naive.getUTCDate(),
    naive.getUTCHours(), naive.getUTCMinutes(), naive.getUTCSeconds(),
  );
  // How far ahead of UTC is Central at that instant? (negative — Central is behind)
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: CENTRAL_TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(guess))) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  let hour = Number(parts.hour); if (hour === 24) hour = 0;
  const asCentral = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour, Number(parts.minute), Number(parts.second));
  const offset = asCentral - guess;
  return new Date(guess - offset);
}

/**
 * Normalize a stored class time to 24h "HH:MM".
 *
 * Lives here, not in a service, because more than one module needs it and a
 * per-module copy of exactly this function has already caused a production
 * incident: a duplicate in meetingService.ts, plus an earlier version of this
 * regex that did not tolerate the trailing seconds Sequelize TIME columns
 * return ("HH:MM:SS"), so every call fell through to the '10:00' default and
 * the session-lifecycle cron evaluated every class against a fake 10am
 * Central. The seconds group is optional for that reason — do not "tidy" it.
 */
export function convertTo24h(timeStr: string): string {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return '10:00';
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const period = match[3]?.toUpperCase();
  if (period === 'PM' && hours < 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return `${hours.toString().padStart(2, '0')}:${minutes}`;
}

/**
 * The real UTC instant of a class's stored Central wall-clock time.
 *
 * Live class times are entered and stored as Central wall-clock ("18:30"), but
 * this runs in a UTC container — a naive `new Date(dateStr + "T" + timeStr)`
 * silently parses that wall-clock AS UTC, running the whole session lifecycle
 * (live/completed transitions, recap generation, reminder timing, join windows)
 * 5-6 hours off from the real Central class time. Root-caused 2026-07-23
 * (Session CC-20260723-t7n4): that night's Orientation was auto-marked
 * 'completed' hours before its real 6:30pm CT start, blocking check-in.
 *
 * Takes the RAW stored string (e.g. "18:30:00") and normalizes internally, so
 * a caller cannot forget the conversion step — which is how the bug nearly
 * regressed while being fixed. Pure; no models, no I/O. Kept importable
 * without pulling in the Sequelize model graph so recording ingest and the
 * lifecycle cron can share one implementation.
 */
export function classInstant(sessionDate: string, rawTime: string): Date {
  return centralWallClockToInstant(new Date(`${sessionDate}T${convertTo24h(rawTime)}:00Z`));
}

/**
 * A class's stored time rendered for a human, e.g. ("2026-08-10", "18:30:00")
 * → "6:30 PM CDT".
 *
 * The zone suffix is DERIVED from the session's own date, never hardcoded, for
 * two reasons. First, the reminder email used to append a literal " ET" to the
 * raw stored string, producing "18:30:00 ET" for a class that actually starts
 * 6:30 PM Central — reported by staff 2026-08-11. Second, a hardcoded "CST" is
 * wrong for most of the teaching year: Central is CDT from March to November,
 * so the label has to follow DST the way the scheduling math already does.
 *
 * Pure. Returns the unformatted input if the time cannot be parsed, so a
 * malformed row degrades to visible-but-ugly rather than to a wrong time.
 * Note this deliberately does NOT lean on convertTo24h's '10:00' fallback:
 * that default is safe for scheduling math (which needs *some* instant) but
 * not for a label, where it would confidently announce a class at 10:00 AM
 * that is not at 10:00 AM.
 */
export function formatCentralClock(sessionDate: string, rawTime: string): string {
  if (!sessionDate || !rawTime) return rawTime || '';
  if (!/^\d{1,2}:\d{2}(?::\d{2})?\s*(AM|PM)?$/i.test(rawTime.trim())) return rawTime;
  const instant = classInstant(sessionDate, rawTime);
  if (Number.isNaN(instant.getTime())) return rawTime;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CENTRAL_TZ,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(instant);
}
