/**
 * Keep a story's due date off a major US holiday.
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

/**
 * The nearest working day: one day earlier (the work is still due before the
 * holiday), or one day later when earlier would fall before `notBefore`.
 * None of these holidays fall on consecutive days, so one step is always enough.
 */
export function offHoliday(d: Date, notBefore?: Date): Date {
  if (!isHoliday(d)) return d;
  const earlier = new Date(d.getTime() - DAY);
  if (!notBefore || earlier.getTime() >= notBefore.getTime()) return earlier;
  return new Date(d.getTime() + DAY);
}
