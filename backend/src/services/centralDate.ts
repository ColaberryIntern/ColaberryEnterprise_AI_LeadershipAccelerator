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

/** Monday-first, matching how the weekly schedule names its days. */
export const CENTRAL_WEEKDAYS = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
] as const;

/**
 * The lowercase weekday name of a Central calendar date key ("2026-11-02" → "monday").
 *
 * WHY NOON AND NOT MIDNIGHT. The key is a Central calendar date, and the only job here
 * is to name its weekday — so it is read at 12:00 UTC, which is the same calendar day
 * everywhere from UTC-11 to UTC+11. Parsing it at midnight would put the instant on the
 * previous day for every negative offset, naming Sunday for a Monday, and that error
 * would be invisible for most of the week and wrong every time it mattered.
 *
 * Returns '' for a key that is not a date, so a caller gets no match rather than a
 * confident wrong weekday.
 */
export function centralWeekdayName(dateKey: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey ?? ''))) return '';
  const at = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(at.getTime())) return '';
  return CENTRAL_WEEKDAYS[at.getUTCDay()];
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
 * The SQL twin of `centralWallClockToInstant`: "now", expressed in the same frame
 * CCPP's `EventBrite_Events.StartDate` is stored in, for use in a WHERE clause.
 *
 * CCPP stores StartDate as CENTRAL wall-clock (10:00 for a 10:00 AM Central
 * event) — the very thing the function above corrects when a row is read. An
 * upcoming-window filter that compares that Central value against `GETUTCDATE()`
 * mixes two frames, and the event drops out of the feed as soon as UTC-now passes
 * its Central start: FIVE HOURS early in summer, SIX in winter.
 *
 * Observed twice, from the same root cause in two different services:
 *   - 2026-09-02, `publicEventsService`: the 10:00 AM CDT AI Strategy session
 *     vanished from the Events page, the calendar and the "Next event" chip at
 *     05:00 AM CDT, while registration was still open.
 *   - 2026-11-10, `openHouseEventService`: `GET /api/v1/open-house/event` labeled
 *     the Nov 19 Open House "12:30 PM CT" for a 6:30 PM CT event, and would have
 *     dropped it from the endpoint at 12:30 PM on the day.
 *
 * It lives HERE, next to the JS half, for exactly that reason. The first fix left
 * the SQL fragment private to one service, so the second service kept its own
 * broken comparison and nothing pointed the two at one implementation. Anything
 * comparing a CCPP datetime column against "now" must use this.
 *
 * `AT TIME ZONE` rather than `GETDATE()`: the CCPP host happens to run Central
 * today, so GETDATE() would also work, but it would break silently if that host
 * were ever moved. This states the intent, and the Windows zone id handles
 * CST/CDT automatically. Verified available on CCPP's SQL Server 2017 (the
 * feature needs 2016+).
 *
 * Static SQL, no user input — safe to interpolate.
 */
export const CCPP_NOW_CENTRAL =
  "CAST(GETUTCDATE() AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time' AS datetime)";

/**
 * The INVERSE of `centralWallClockToInstant`, for an arbitrary zone: given a real
 * instant, what does the wall clock read in `timeZone`?
 *
 * Returns `YYYY-MM-DDTHH:mm:ss` with NO trailing `Z`, because the one caller that
 * needs it — the Zoom adapter — pairs a naive local string with an explicit
 * `timezone` field, which is how Zoom's API expects a non-GMT start time.
 *
 * WHY THIS EXISTS. `meetingProvider.ts` used to do `instant.toISOString().slice(0,19)`
 * and send the result alongside `timezone: 'America/Chicago'`. That takes the UTC
 * wall clock and tells Zoom to read it as Central, so every booking was created
 * 5-6 hours late. Slicing the `Z` off an ISO string does not convert anything; it
 * only discards the one piece of information that said which zone the digits were in.
 *
 * DST is handled by `Intl` rather than by arithmetic, so a booking on either side of
 * a transition converts with the offset actually in force on that date.
 */
export function instantToWallClock(instant: Date, timeZone: string): string {
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  // `hour12: false` yields "24" for midnight in some ICU builds — the same guard
  // centralWallClockToInstant above already carries, for the same reason.
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}`;
}

/**
 * The one clock-time pattern. Shared rather than copied, for the reason in
 * `convertTo24h` below: a second copy of this exact regex has already caused a
 * production incident. Anything that needs to ASK whether a stored time is
 * readable must test with this, never with its own regex.
 */
const CLOCK_TIME_RE = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i;

/**
 * Whether a stored time can actually be read, as opposed to falling through
 * `convertTo24h`'s default.
 *
 * EXISTS BECAUSE THE DEFAULT IS A TRAP FOR CALLERS THAT DECIDE SOMETHING.
 * `convertTo24h` returns '10:00' for anything it cannot parse, which is the
 * right call for scheduling math that needs *some* instant, and the wrong one
 * for a caller asking "is a session running right now" — that caller would
 * confidently announce a session at 10:00 Central that does not exist.
 * `formatCentralClock` already refuses to lean on the default for the same
 * reason; this makes the check available instead of re-derived.
 */
export function isReadableClockTime(timeStr: unknown): boolean {
  return typeof timeStr === 'string' && CLOCK_TIME_RE.test(timeStr);
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
  const match = timeStr.match(CLOCK_TIME_RE);
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

/**
 * How near a class is, in words, relative to `nowMs` — "Today", "Tomorrow", or a
 * named day for anything further out.
 *
 * This is the DAY half of the same defect formatCentralClock fixed above. The
 * reminder email hardcoded the word "Tomorrow" for every non-1-hour reminder,
 * because the sender assumed the "24-hour reminder" fires 24 hours out. It does
 * not: schedulerService sweeps a ROLLING window (`now < session <= now+24h`) and
 * the send is armed by an in-process Set, so any backend restart on the day of a
 * class re-arms it and the next sweep announces a class starting in nine hours
 * as "Tomorrow". That is exactly what went out for Session 7 on 2026-08-13 —
 * sent 9:30 AM Central for a 6:30 PM Central class.
 *
 * Takes `session_date` (already a Central calendar date — that is how live class
 * dates are stored) and compares CALENDAR DAYS, not elapsed hours. A class 9
 * hours out is "Today"; a class 20 hours out that crosses midnight is
 * "Tomorrow". Both keys are parsed at UTC midnight purely to subtract them, so
 * the arithmetic cannot drift across a DST boundary the way `+86400000` would.
 *
 * Pure. Returns "Upcoming" for an unparseable date rather than an empty string
 * or a guess: an empty label would render "[Accelerator] : Session 7", and a
 * guess would repeat the original defect of confidently naming the wrong day.
 */
export function sessionDayLabel(sessionDate: string, nowMs: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test((sessionDate || '').trim())) return 'Upcoming';
  const sessionMs = Date.parse(`${sessionDate.trim()}T00:00:00Z`);
  const todayMs = Date.parse(`${centralDateKey(nowMs)}T00:00:00Z`);
  if (Number.isNaN(sessionMs) || Number.isNaN(todayMs)) return 'Upcoming';

  const dayDiff = Math.round((sessionMs - todayMs) / 86400000);
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Tomorrow';

  // Past dates land here too (dayDiff < 0). A reminder should never fire for a
  // past class, but naming the actual day is the safe failure: it is still true,
  // where "Today"/"Tomorrow" would not be.
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', // keys are already Central calendar dates; UTC avoids re-shifting them
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date(sessionMs));
}

/**
 * A raw instant (any ISO string, epoch, or Date — as stored in Postgres `TIMESTAMPTZ`
 * columns across ProofDesk/Workforce OS) rendered for a human, e.g. "Aug 12, 3:00 PM
 * CDT". DST-aware and labeled for the same reason formatCentralClock is: this
 * codebase's admin/ticket surfaces used to render bare `.toISOString()` or the
 * browser's own local timezone with no indication a conversion happened at all — see
 * PROGRESS.md session CC-20260812-r9x3 ("ticket UX" fixes) for the concrete instance
 * (a generated ticket summary embedding raw UTC as unlabeled prose). Unlike
 * formatCentralClock (which takes a Central *wall-clock* pair because live-class times
 * are stored that way), this takes a real instant directly — the shape most call sites
 * in this codebase actually have (a `Date`/timestamptz column, not a wall-clock pair).
 *
 * Pure. Returns a safe, honest fallback string for null/invalid input rather than
 * throwing or emitting "Invalid Date" — this function backs both UI display and
 * AI-generated prose text, where a raw exception or "Invalid Date" leaking into a
 * ticket summary would be worse than a plain-language fallback.
 */
export function formatCentralDateTime(d: Date | string | null | undefined): string {
  if (!d) return 'an unknown time';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return 'an unknown time';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CENTRAL_TZ,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}
