/**
 * When a batch's orientation is — derived from the batch month, not read off the row.
 *
 * The monthly batch model (`directives/run-monthly-enrollment-batches.md`) states the rule:
 * orientation is the first Monday of the month AFTER the batch closes, in the batch's own evening
 * slot. For the November 2026 batch that is Monday 7 December 2026.
 *
 * ── WHY THIS IS COMPUTED AND NOT READ FROM `start_date` ──
 *
 * A batch row's `cohorts.start_date` is documented in three separate places as holding the
 * ORIENTATION date rather than a class start (`batchCohort.ts`, `portalEnrollmentService.ts`,
 * `batchPlacementService.ts`). So reading it looks right. Measured against production on
 * 2026-11-08, it is right for four of the five batch rows and wrong for the one that matters:
 *
 *   batch     first Monday of the next month     stored start_date     agree
 *   2026-11   2026-12-07                         2026-11-12            NO
 *   2026-12   2027-01-04                         2027-01-04            yes
 *   2027-01   2027-02-01                         2027-02-01            yes
 *   2027-02   2027-03-01                         2027-03-01            yes
 *   2027-03   2027-04-05                         2027-04-05            yes
 *
 * November 2026 is the batch that is open right now, and it is the outlier. Four rows agreeing
 * with the convention is what makes the fifth a data defect rather than a different intent — and
 * correcting that row is an open decision on C10.13, not something this module should wait for or
 * pre-empt. Deriving the date means an email cannot tell a paying member their orientation is
 * 12 November, which is both wrong and already in the past.
 *
 * `start_date` is therefore never read here. When the November row is corrected, this module's
 * answer does not change — which is the point.
 *
 * ── WHAT IS READ FROM THE ROW ──
 *
 * Only the time, from `settings_json.schedule.start_time` ("18:30" on every batch row in
 * production). That is real stored data rather than a constant repeated in prose, so a batch that
 * moves its evening slot moves its orientation time with it. A row with no readable time falls
 * back to the model's documented 6:30 PM, which is what all five rows currently say.
 *
 * Pure: no DB, no clock, no I/O. Everything is a function of the row handed in.
 */
import { batchMonthOf, BatchCohortRow } from './batchCohort';

/** The documented evening slot, used only when a row carries no schedule of its own. */
export const DEFAULT_ORIENTATION_TIME = '18:30';

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export interface BatchOrientation {
  /** 'YYYY-MM-DD': the first Monday of the month after the batch month, or a first-session exception. */
  date: string;
  /** 'HH:MM' in 24-hour Central, from the row's own schedule where it has one. */
  time: string;
  /** The batch month this orientation belongs to, 'YYYY-MM'. */
  batchMonth: string;
  /** "Monday, December 7, 2026 at 6:30 PM CT" — the form an email should print. */
  label: string;
}

/**
 * The first Monday of the month AFTER `monthKey`, as 'YYYY-MM-DD'.
 *
 * Built in UTC on purpose. This is a calendar question — "which date is the first Monday" — and a
 * local-time construction would let the machine's own timezone shift the answer by a day for
 * anyone running it west of UTC. The date it returns is a Central calendar date; it is never
 * treated as an instant.
 */
export function orientationDateFor(monthKey: string): string | null {
  const key = String(monthKey ?? '').trim();
  if (!MONTH_KEY_RE.test(key)) return null;
  const [year, month] = key.split('-').map(Number);
  // `month` is 1-12 and Date.UTC takes 0-11, so passing `month` lands on the FOLLOWING month, and
  // December rolls into January of the next year without special-casing.
  const day = new Date(Date.UTC(year, month, 1));
  while (day.getUTCDay() !== 1) day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

/** The row's own evening start time, or the documented default. */
export function orientationTimeOf(cohort: BatchCohortRow | null | undefined): string {
  const raw = (cohort as any)?.settings_json?.schedule?.start_time;
  return typeof raw === 'string' && TIME_RE.test(raw.trim()) ? raw.trim() : DEFAULT_ORIENTATION_TIME;
}

/** "18:30" becomes "6:30 PM". Midnight and noon are the two cases a naive %12 gets wrong. */
export function formatClockTime(time: string): string {
  const match = TIME_RE.exec(String(time ?? '').trim());
  if (!match) return formatClockTime(DEFAULT_ORIENTATION_TIME);
  const hour24 = Number(match[1]);
  const suffix = hour24 < 12 ? 'AM' : 'PM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${match[2]} ${suffix}`;
}

/**
 * "2026-11" becomes "November 2026" - how a batch is named to a member.
 *
 * Here rather than in `batchCohort.ts` because that module is the DEFINITION of a batch and holds
 * no presentation at all; this one already owns the month names and the formatting. A member-facing
 * label built from the month key rather than sliced out of the row's `name` means a row named
 * inconsistently still reads correctly in an email.
 */
export function formatBatchMonth(monthKey: string): string | null {
  const key = String(monthKey ?? '').trim();
  if (!MONTH_KEY_RE.test(key)) return null;
  const [year, month] = key.split('-').map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** "2026-12-07" becomes "Monday, December 7, 2026" (American order, per the house style). */
export function formatOrientationDate(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? '').trim())) return null;
  const [year, month, day] = date.split('-').map(Number);
  const at = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(at.getTime())) return null;
  return `${DAY_NAMES[at.getUTCDay()]}, ${MONTH_NAMES[at.getUTCMonth()]} ${at.getUTCDate()}, ${at.getUTCFullYear()}`;
}

/**
 * One-off first sessions that come BEFORE the convention's orientation, keyed by batch month.
 *
 * Ali, 2026-11-09: the November 2026 batch holds a live session on 12 November as well as its
 * 7 December orientation. A member who joins on or before 12 November is told 12 November; from the
 * 13th on, the November batch is told 7 December like every other batch is told its own first
 * Monday. December onward has no entry and follows the convention.
 *
 * `through` is inclusive: on the 12th itself the 6:30 PM session is still ahead of a member who
 * pays that day, so it is still the right date to give them.
 */
export const FIRST_SESSION_EXCEPTIONS: Readonly<Record<string, { date: string; through: string }>> = {
  '2026-11': { date: '2026-11-12', through: '2026-11-12' },
};

/**
 * The date a member should be given as their batch's first live session, as 'YYYY-MM-DD'.
 *
 * `todayCentral` is the Central calendar date the member is being told on. Without it the answer is
 * the convention's orientation, so a caller that has no clock can never pick up an exception that
 * may already have passed.
 */
export function firstSessionDateFor(monthKey: string, todayCentral?: string | null): string | null {
  const exception = FIRST_SESSION_EXCEPTIONS[String(monthKey ?? '').trim()];
  const today = String(todayCentral ?? '').trim();
  if (exception && /^\d{4}-\d{2}-\d{2}$/.test(today) && today <= exception.through) return exception.date;
  return orientationDateFor(monthKey);
}

/**
 * The orientation for a batch row, or null when the row is not a batch.
 *
 * Null rather than a guess: on a legacy fixed-start cohort `start_date` genuinely IS a class start,
 * and there is no monthly orientation to compute. Calling such a date an orientation would be the
 * same mislabelling this module exists to avoid, pointing the other way.
 */
export function orientationOf(
  cohort: BatchCohortRow | null | undefined,
  todayCentral?: string | null,
): BatchOrientation | null {
  const batchMonth = batchMonthOf(cohort);
  if (!batchMonth) return null;
  const date = firstSessionDateFor(batchMonth, todayCentral);
  if (!date) return null;
  const time = orientationTimeOf(cohort);
  const pretty = formatOrientationDate(date);
  if (!pretty) return null;
  return { date, time, batchMonth, label: `${pretty} at ${formatClockTime(time)} CT` };
}
