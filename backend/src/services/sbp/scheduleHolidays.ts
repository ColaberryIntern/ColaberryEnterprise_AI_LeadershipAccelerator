/**
 * Keep a story's due date off a weekend or a major US holiday.
 *
 * ShiftFill v5 (2026-11-21): release r2 opened with a story due on Christmas
 * Day, because the schedule spreads stories evenly across the calendar and
 * nothing told it which days nobody works. The fix is to move only that one
 * date; the even spread elsewhere is right.
 *
 * Pure and deterministic: no locale, no clock, UTC dates in and out.
 */

const DAY = 86_400_000;

/** Fourth Thursday of November. */
function thanksgiving(year: number): number {
  const nov1 = new Date(Date.UTC(year, 10, 1)).getUTCDay();
  return 1 + ((4 - nov1 + 7) % 7) + 21;
}

/** True for New Year's Day, Independence Day, Thanksgiving and Christmas Day. */
export function isHoliday(d: Date): boolean {
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  return (m === 0 && day === 1)
    || (m === 6 && day === 4)
    || (m === 10 && day === thanksgiving(d.getUTCFullYear()))
    || (m === 11 && day === 25);
}

/** A weekday that is not one of the holidays above. */
export function isWorkingDay(d: Date): boolean {
  const wd = d.getUTCDay();
  return wd !== 0 && wd !== 6 && !isHoliday(d);
}

/**
 * The nearest working day: the closest earlier one (the work is still due
 * before the day off), or the closest later one when earlier would fall before
 * `notBefore`.
 *
 * Weekends too since ShiftFill v8 (2026-11-22): STORY-008 fell due on a
 * Saturday. `materializeTasks` already slides its demo task off weekends for
 * the reason that applies here: a task due on Saturday reads as already late
 * by Monday morning. The longest run of days off (a Monday holiday after a
 * weekend) is three, so each walk ends within three steps.
 */
export function toWorkingDay(d: Date, notBefore?: Date): Date {
  if (isWorkingDay(d)) return d;
  const step = (from: Date, by: number): Date => {
    let x = new Date(from.getTime() + by * DAY);
    while (!isWorkingDay(x)) x = new Date(x.getTime() + by * DAY);
    return x;
  };
  const earlier = step(d, -1);
  if (!notBefore || earlier.getTime() >= notBefore.getTime()) return earlier;
  return step(d, 1);
}
