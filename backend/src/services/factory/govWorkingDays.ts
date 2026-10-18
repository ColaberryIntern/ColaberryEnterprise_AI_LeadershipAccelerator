/**
 * PURE US working-day calendar for the gov build schedule: Monday-Friday minus the observed US federal holidays.
 *
 * No I/O, no `Date.now()` inside - every function takes the dates it needs, so the on-time-probability and
 * back-planned-schedule math that depend on it stay deterministic and unit-testable (house rule: see
 * govScheduleWindow.ts / buildSchedule.ts, which inject `now0`). All arithmetic is in UTC at day granularity so a
 * timezone can never move a date across midnight.
 *
 * Working days are OUR team's build calendar (and the buyer's, who are also closed on federal holidays). Ali chose
 * "weekends + US federal holidays" on 2026-10-18.
 */

function pad(n: number): string { return String(n).padStart(2, '0'); }

/** UTC YYYY-MM-DD key for a date (day granularity, timezone-stable). */
export function dayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** A date at UTC midnight for (year, month0, day). */
export function utcDay(year: number, month0: number, day: number): Date {
  return new Date(Date.UTC(year, month0, day));
}

/** Normalize any Date to UTC midnight of the same calendar day. */
export function startOfUtcDay(d: Date): Date {
  return utcDay(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** The date of the nth <weekday> in (year, month0). weekday: 0=Sun..6=Sat, n is 1-based. */
function nthWeekday(year: number, month0: number, weekday: number, n: number): Date {
  const first = utcDay(year, month0, 1);
  const shift = (weekday - first.getUTCDay() + 7) % 7;
  return utcDay(year, month0, 1 + shift + (n - 1) * 7);
}

/** The last <weekday> in (year, month0). */
function lastWeekday(year: number, month0: number, weekday: number): Date {
  const lastOfMonth = utcDay(year, month0 + 1, 0);
  const shift = (lastOfMonth.getUTCDay() - weekday + 7) % 7;
  return utcDay(year, month0, lastOfMonth.getUTCDate() - shift);
}

/** The OBSERVED date of a fixed-date holiday: a Saturday is observed the Friday before, a Sunday the Monday after. */
function observed(d: Date): Date {
  const dow = d.getUTCDay();
  if (dow === 6) return utcDay(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1);
  if (dow === 0) return utcDay(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return d;
}

/**
 * The observed US federal holidays in `year`, as YYYY-MM-DD keys. Juneteenth is included only for 2021+ (the year it
 * became a federal holiday) so historical ranges stay correct.
 */
export function usFederalHolidays(year: number): Set<string> {
  const days: Date[] = [
    observed(utcDay(year, 0, 1)),   // New Year's Day
    nthWeekday(year, 0, 1, 3),      // Martin Luther King Jr. Day - 3rd Monday of January
    nthWeekday(year, 1, 1, 3),      // Washington's Birthday / Presidents' Day - 3rd Monday of February
    lastWeekday(year, 4, 1),        // Memorial Day - last Monday of May
    ...(year >= 2021 ? [observed(utcDay(year, 5, 19))] : []), // Juneteenth National Independence Day
    observed(utcDay(year, 6, 4)),   // Independence Day
    nthWeekday(year, 8, 1, 1),      // Labor Day - 1st Monday of September
    nthWeekday(year, 9, 1, 2),      // Columbus Day - 2nd Monday of October
    observed(utcDay(year, 10, 11)), // Veterans Day
    nthWeekday(year, 10, 4, 4),     // Thanksgiving Day - 4th Thursday of November
    observed(utcDay(year, 11, 25)), // Christmas Day
  ];
  return new Set(days.map(dayKey));
}

/** Union of the observed federal holidays across a list of years. */
function holidaysForYears(years: number[]): Set<string> {
  const all = new Set<string>();
  for (const y of years) for (const k of usFederalHolidays(y)) all.add(k);
  return all;
}

/** True when `d` is a working day: Monday-Friday and not an observed federal holiday. */
export function isWorkingDay(d: Date, holidays?: Set<string>): boolean {
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  const hs = holidays ?? usFederalHolidays(d.getUTCFullYear());
  return !hs.has(dayKey(d));
}

/**
 * Count working days in the half-open interval [start, end) - `start` inclusive, `end` exclusive. Zero when
 * `end <= start` (never negative; order the arguments yourself). Spans year boundaries correctly.
 */
export function workingDaysBetween(start: Date, end: Date): number {
  const s = startOfUtcDay(start);
  const e = startOfUtcDay(end);
  if (!(s < e)) return 0;
  const years: number[] = [];
  for (let y = s.getUTCFullYear(); y <= e.getUTCFullYear(); y++) years.push(y);
  const hs = holidaysForYears(years);
  let count = 0;
  const cur = startOfUtcDay(s);
  while (cur < e) {
    if (isWorkingDay(cur, hs)) count += 1;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

/** Advance `n` working days from `start` (n >= 0), returning the resulting working day (start itself not counted). */
export function addWorkingDays(start: Date, n: number): Date {
  const cur = startOfUtcDay(start);
  let remaining = Math.max(0, Math.floor(n));
  while (remaining > 0) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    if (isWorkingDay(cur)) remaining -= 1;
  }
  return cur;
}
