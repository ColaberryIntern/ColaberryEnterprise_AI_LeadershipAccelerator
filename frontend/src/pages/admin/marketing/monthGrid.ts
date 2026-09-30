import { toCentralInput } from './centralTime';
import type { CalendarItem } from './calendarTime';

/**
 * monthGrid - the month view's cells, built in Central.
 *
 * WHY A MONTH AT ALL. Loomly's daily driver is a month grid whose cards carry the time, the
 * status and the networks; ours was a list grouped by day. The list is correct and is harder to
 * read a month from - "what is going out the week after next" is a scroll rather than a glance.
 *
 * EVERY DAY HERE IS A CENTRAL DAY. A post at 8 PM Central on the 30th is on the 30th, even though
 * it is already the 1st in UTC. The day an item belongs to is taken from its Central wall clock
 * (centralTime), never from `Date.getDate()`, which would read the browser's zone.
 *
 * WEEKS START MONDAY, matching the grid Loomly shows and the way the team talks about a week.
 */

export interface MonthDay {
  /** YYYY-MM-DD in Central. */
  day: string;
  dayOfMonth: number;
  /** True for the leading and trailing days that belong to the neighbouring months. */
  outside: boolean;
  /** True when this is today, in Central. */
  today: boolean;
  items: CalendarItem[];
}

export interface MonthGrid {
  /** The month being shown, YYYY-MM. */
  month: string;
  /** A readable title: "September 2026". */
  title: string;
  /** Always whole weeks, Monday first. */
  weeks: MonthDay[][];
}

const DAY_MS = 86_400_000;

/** YYYY-MM for an instant, in Central. */
export function centralMonthOf(iso: string): string {
  return toCentralInput(iso).slice(0, 7);
}

/** YYYY-MM-DD for an instant, in Central. */
export function centralDayOf(iso: string): string {
  return toCentralInput(iso).slice(0, 10);
}

function parseMonth(month: string): { year: number; monthIndex: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  return monthIndex >= 0 && monthIndex <= 11 ? { year, monthIndex } : null;
}

/** The month before or after, wrapping the year. `step` is -1 or 1. */
export function shiftMonth(month: string, step: number): string {
  const parsed = parseMonth(month);
  if (!parsed) return month;
  const d = new Date(Date.UTC(parsed.year, parsed.monthIndex + step, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Build the grid.
 *
 * Dates are constructed and stepped in UTC and only ever FORMATTED as days - never advanced by
 * adding 24 hours to a local Date, which is the arithmetic that loses or repeats an hour twice a
 * year. A month's cells are calendar squares, not instants, so UTC midnight is a safe carrier.
 */
export function buildMonthGrid(month: string, items: readonly CalendarItem[], now: Date = new Date()): MonthGrid {
  const parsed = parseMonth(month);
  if (!parsed) return { month, title: month, weeks: [] };
  const { year, monthIndex } = parsed;

  const byDay = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const day = centralDayOf(item.scheduledFor);
    if (!day) continue;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(item);
  }
  // Soonest first inside a day, so a cell reads top to bottom like the day does.
  for (const list of byDay.values()) list.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));

  const first = new Date(Date.UTC(year, monthIndex, 1));
  // getUTCDay: 0 = Sunday. Monday-first means Sunday sits at the END of a week.
  const leading = (first.getUTCDay() + 6) % 7;
  const start = new Date(first.getTime() - leading * DAY_MS);
  const today = toCentralInput(now.toISOString()).slice(0, 10);

  const weeks: MonthDay[][] = [];
  const cursor = new Date(start.getTime());
  // Six weeks covers every month; the last row is dropped when it belongs entirely to next month.
  for (let w = 0; w < 6; w += 1) {
    const week: MonthDay[] = [];
    for (let d = 0; d < 7; d += 1) {
      const day = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-${String(cursor.getUTCDate()).padStart(2, '0')}`;
      week.push({
        day,
        dayOfMonth: cursor.getUTCDate(),
        outside: cursor.getUTCMonth() !== monthIndex,
        today: day === today,
        items: byDay.get(day) ?? [],
      });
      cursor.setTime(cursor.getTime() + DAY_MS);
    }
    // A trailing week entirely outside the month is noise, unless something is scheduled in it.
    if (weeks.length >= 4 && week.every((c) => c.outside) && week.every((c) => c.items.length === 0)) break;
    weeks.push(week);
  }

  return { month, title: `${MONTH_NAMES[monthIndex]} ${year}`, weeks };
}

/** The range to ask the server for, so a month view fetches its own leading and trailing days. */
export function monthRange(month: string): { start: string; end: string } {
  const grid = buildMonthGrid(month, []);
  const days = grid.weeks.flat();
  return days.length > 0
    ? { start: days[0].day, end: days[days.length - 1].day }
    : { start: `${month}-01`, end: `${month}-28` };
}
