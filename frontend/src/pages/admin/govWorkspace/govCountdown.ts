/**
 * govCountdown — PURE, deterministic countdown-band math for Step 5 "Build the bid". No I/O; `now` and the deadline
 * are injected, so it is reproducible and unit-testable. It mirrors the backend pure logic (govWorkingDays +
 * govOnTimeProbability) because the decoupled (gws) pilot only has the close date client-side; keeping it pure +
 * tested on both sides is the repo pattern (see the P2 tracksForCategory mirror).
 *
 * Working days = Monday-Friday minus observed US federal holidays (Ali's choice, 2026-10-18). On-time probability is
 * a documented monotonic band, never a guess: a missing input renders "-" with the reason.
 */

function pad(n: number): string { return String(n).padStart(2, '0'); }
function dayKey(d: Date): string { return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
function utcDay(y: number, m0: number, day: number): Date { return new Date(Date.UTC(y, m0, day)); }
function startOfUtcDay(d: Date): Date { return utcDay(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
function nthWeekday(y: number, m0: number, wd: number, n: number): Date {
  const first = utcDay(y, m0, 1); const shift = (wd - first.getUTCDay() + 7) % 7; return utcDay(y, m0, 1 + shift + (n - 1) * 7);
}
function lastWeekday(y: number, m0: number, wd: number): Date {
  const last = utcDay(y, m0 + 1, 0); const shift = (last.getUTCDay() - wd + 7) % 7; return utcDay(y, m0, last.getUTCDate() - shift);
}
function observed(d: Date): Date {
  const dow = d.getUTCDay();
  if (dow === 6) return utcDay(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1);
  if (dow === 0) return utcDay(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return d;
}
export function usFederalHolidays(year: number): Set<string> {
  const days: Date[] = [
    observed(utcDay(year, 0, 1)), nthWeekday(year, 0, 1, 3), nthWeekday(year, 1, 1, 3), lastWeekday(year, 4, 1),
    ...(year >= 2021 ? [observed(utcDay(year, 5, 19))] : []), observed(utcDay(year, 6, 4)), nthWeekday(year, 8, 1, 1),
    nthWeekday(year, 9, 1, 2), observed(utcDay(year, 10, 11)), nthWeekday(year, 10, 4, 4), observed(utcDay(year, 11, 25)),
  ];
  return new Set(days.map(dayKey));
}
export function isWorkingDay(d: Date, holidays?: Set<string>): boolean {
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !(holidays ?? usFederalHolidays(d.getUTCFullYear())).has(dayKey(d));
}
/** Working days in [start, end), end exclusive. 0 when end <= start. */
export function workingDaysBetween(start: Date, end: Date): number {
  const s = startOfUtcDay(start); const e = startOfUtcDay(end);
  if (!(s < e)) return 0;
  const hs = new Set<string>();
  for (let y = s.getUTCFullYear(); y <= e.getUTCFullYear(); y++) for (const k of usFederalHolidays(y)) hs.add(k);
  let count = 0; const cur = startOfUtcDay(s);
  while (cur < e) { if (isWorkingDay(cur, hs)) count += 1; cur.setUTCDate(cur.getUTCDate() + 1); }
  return count;
}

/** Advance `n` working days from `start` (n >= 0); the start day is not counted. */
export function addWorkingDays(start: Date, n: number): Date {
  const cur = startOfUtcDay(start);
  let remaining = Math.max(0, Math.floor(n));
  while (remaining > 0) { cur.setUTCDate(cur.getUTCDate() + 1); if (isWorkingDay(cur)) remaining -= 1; }
  return cur;
}

/** The day BEFORE the deadline (never earlier than `now`); null if no deadline. Mirrors backend govShipByDate. */
export function shipByDate(deadline: Date | null, now: Date): Date | null {
  if (!deadline) return null;
  const d = startOfUtcDay(deadline); d.setUTCDate(d.getUTCDate() - 1);
  const n = startOfUtcDay(now);
  return d < n ? n : d;
}

export const BLOCKED_DAY_COST = 2;
/** Rough working days of build per unbuilt story, until a dated critical path is wired. Documented, deterministic. */
export const WORKING_DAYS_PER_STORY = 2;
const PROBABILITY_BANDS: ReadonlyArray<readonly [number, number]> = [[1.5, 95], [1.2, 85], [1.0, 70], [0.85, 50], [0.7, 30], [0.5, 15]];

export interface Countdown {
  shipBy: string | null;            // YYYY-MM-DD (day before the deadline), or null
  workingDaysToShipBy: number | null;
  remainingBuildDays: number | null;
  humanBlockedCount: number;
  probability: number | null;       // 0-100 or null ("-")
  reason: string | null;
  effectiveNeeded: number | null;
  slackRatio: number | null;
}

/**
 * Derive the countdown from the deadline, the remaining unbuilt-story count, and the number of items blocked on a
 * human answer. `remainingStoryCount` null ⇒ no plan ⇒ probability "-".
 */
export function deriveCountdown(input: {
  now: Date; deadline: Date | null; remainingStoryCount: number | null; humanBlockedCount: number;
}): Countdown {
  const ship = shipByDate(input.deadline, input.now);
  const workingDaysToShipBy = ship ? workingDaysBetween(startOfUtcDay(input.now), ship) : null;
  const remainingBuildDays = input.remainingStoryCount === null ? null : Math.max(0, input.remainingStoryCount) * WORKING_DAYS_PER_STORY;
  const blocked = Math.max(0, Math.floor(input.humanBlockedCount || 0));

  const base: Countdown = {
    shipBy: ship ? dayKey(ship) : null,
    workingDaysToShipBy, remainingBuildDays, humanBlockedCount: blocked,
    probability: null, reason: null, effectiveNeeded: null, slackRatio: null,
  };
  if (workingDaysToShipBy === null || remainingBuildDays === null) {
    base.reason = workingDaysToShipBy === null ? 'no submission deadline' : 'no build plan yet';
    return base;
  }
  const effectiveNeeded = remainingBuildDays + blocked * BLOCKED_DAY_COST;
  base.effectiveNeeded = effectiveNeeded;
  if (effectiveNeeded <= 0) { base.probability = 95; return base; }
  const ratio = workingDaysToShipBy / effectiveNeeded;
  base.slackRatio = Math.round(ratio * 100) / 100;
  let probability = 5;
  for (const [t, p] of PROBABILITY_BANDS) { if (ratio >= t) { probability = p; break; } }
  base.probability = probability;
  base.reason = probability >= 70 ? null
    : blocked > 0 ? `${blocked} item(s) waiting on your answer; ${workingDaysToShipBy} working days to ship-by vs ${effectiveNeeded} needed`
      : `${workingDaysToShipBy} working days to ship-by vs ${effectiveNeeded} of remaining build work`;
  return base;
}

/** Working days reserved AFTER the MVP is demo-ready for proposal drafting + sign/ship, before the deadline. */
export const PROPOSAL_BUFFER_WORKING_DAYS = 5;

/** Go back `n` working days from `start` (n >= 0). */
function subtractWorkingDays(start: Date, n: number): Date {
  const cur = startOfUtcDay(start);
  let remaining = Math.max(0, Math.floor(n));
  while (remaining > 0) { cur.setUTCDate(cur.getUTCDate() - 1); if (isWorkingDay(cur)) remaining -= 1; }
  return cur;
}

export interface MvpSchedule {
  shipBy: string | null;
  mvpDemoReadyBy: string | null;
  latestMvpReadyBy: string | null;
  daysBeforeDue: number | null;
  feasible: boolean | null;
  mvpBuildDays: number | null;
  headline: string;
}

/**
 * Back-plan the MVP from the deadline, deterministically + working-day aware. The MVP is demo-ready after
 * mvpStoryCount * WORKING_DAYS_PER_STORY working days of build; it must land by ship-by MINUS a proposal/sign buffer.
 * Feasible when the earliest demo-ready date fits before that latest-allowed date. "-" (nulls) when an input is
 * missing - never a guessed date.
 */
export function deriveMvpSchedule(input: { now: Date; deadline: Date | null; mvpStoryCount: number | null }): MvpSchedule {
  const ship = shipByDate(input.deadline, input.now);
  if (!ship || input.deadline == null || input.mvpStoryCount === null) {
    return {
      shipBy: ship ? dayKey(ship) : null, mvpDemoReadyBy: null, latestMvpReadyBy: null, daysBeforeDue: null,
      feasible: null, mvpBuildDays: null, headline: input.deadline == null ? 'No submission deadline' : 'No build plan yet',
    };
  }
  const mvpBuildDays = Math.max(0, input.mvpStoryCount) * WORKING_DAYS_PER_STORY;
  const earliest = addWorkingDays(startOfUtcDay(input.now), mvpBuildDays);
  const latest = subtractWorkingDays(ship, PROPOSAL_BUFFER_WORKING_DAYS);
  const daysBeforeDue = workingDaysBetween(earliest, startOfUtcDay(input.deadline));
  const feasible = earliest.getTime() <= latest.getTime();
  const headline = feasible
    ? `MVP demo-ready by ${dayKey(earliest)} - ${daysBeforeDue} working days before due`
    : `MVP will not be demo-ready in time: it needs ${mvpBuildDays} working days and only fits if ready by ${dayKey(latest)}`;
  return { shipBy: dayKey(ship), mvpDemoReadyBy: dayKey(earliest), latestMvpReadyBy: dayKey(latest), daysBeforeDue, feasible, mvpBuildDays, headline };
}

function parseDayKey(k: string): Date { return utcDay(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10))); }

export interface PreSubmissionBar { key: string; label: string; leftPct: number; widthPct: number; tone: 'critical' | 'buffer' | 'overflow'; }
export interface PreSubmissionMarker { key: string; label: string; date: string; leftPct: number; tone: 'now' | 'constraint' | 'ship' | 'deadline'; }
export interface PreSubmissionGantt {
  feasible: boolean | null;
  headline: string;
  bars: PreSubmissionBar[];
  markers: PreSubmissionMarker[];
  schedule: MvpSchedule;
}

/**
 * Lay the pre-submission back-plan out on a FIXED now->deadline axis (the deadline is the anchor, so it is always the
 * right edge). Two bars: the MVP build (now -> demo-ready; its tone is `overflow`/red when it crosses the latest-safe
 * date) and the draft/ship buffer (latest-safe -> ship-by). Four markers: today, the latest the MVP can be ready,
 * ship-by, and the deadline. PURE + total: a missing input, or a non-positive now->deadline span, yields empty
 * bars/markers while preserving the schedule headline (the banner still renders the reason). leftPct/widthPct are
 * percentages (one decimal) so a plain positioned div renders each bar, matching the post-award Gantt convention.
 */
export function derivePreSubmissionGantt(input: { now: Date; deadline: Date | null; mvpStoryCount: number | null }): PreSubmissionGantt {
  const schedule = deriveMvpSchedule(input);
  const empty: PreSubmissionGantt = { feasible: schedule.feasible, headline: schedule.headline, bars: [], markers: [], schedule };
  if (input.deadline == null || input.mvpStoryCount === null || schedule.mvpDemoReadyBy == null || schedule.latestMvpReadyBy == null || schedule.shipBy == null) {
    return empty;
  }
  const now = startOfUtcDay(input.now);
  const deadline = startOfUtcDay(input.deadline);
  const span = deadline.getTime() - now.getTime();
  if (span <= 0) return empty;
  const pct = (d: Date): number => Math.max(0, Math.min(100, Math.round(((d.getTime() - now.getTime()) / span) * 1000) / 10));

  const demoReady = parseDayKey(schedule.mvpDemoReadyBy);
  const latest = parseDayKey(schedule.latestMvpReadyBy);
  const ship = parseDayKey(schedule.shipBy);
  const latestPct = pct(latest);

  const bars: PreSubmissionBar[] = [
    { key: 'build', label: `Build MVP (${schedule.mvpBuildDays ?? 0} working days)`, leftPct: 0, widthPct: Math.max(1, pct(demoReady)), tone: schedule.feasible ? 'critical' : 'overflow' },
    { key: 'buffer', label: `Draft & ship (${PROPOSAL_BUFFER_WORKING_DAYS} working days)`, leftPct: latestPct, widthPct: Math.max(1, pct(ship) - latestPct), tone: 'buffer' },
  ];
  const markers: PreSubmissionMarker[] = [
    { key: 'now', label: 'Today', date: dayKey(now), leftPct: 0, tone: 'now' },
    { key: 'latest', label: 'MVP ready by', date: schedule.latestMvpReadyBy, leftPct: latestPct, tone: 'constraint' },
    { key: 'ship', label: 'Ship by', date: schedule.shipBy, leftPct: pct(ship), tone: 'ship' },
    { key: 'deadline', label: 'Deadline', date: dayKey(deadline), leftPct: 100, tone: 'deadline' },
  ];
  return { feasible: schedule.feasible, headline: schedule.headline, bars, markers, schedule };
}
