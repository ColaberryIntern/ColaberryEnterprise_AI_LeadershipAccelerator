import { buildMonthGrid, centralDayOf, centralMonthOf, monthRange, shiftMonth } from '../monthGrid';
import type { CalendarItem } from '../calendarTime';

/**
 * The month view's cells.
 *
 * Every expected value was worked out by hand from fixed facts: September 2026 begins on a
 * Tuesday, Central is UTC-5 until 1 Nov 2026 and UTC-6 after, and weeks here start on Monday.
 * These run in whatever zone the machine is in, which is the point.
 */

function item(id: string, scheduledFor: string): CalendarItem {
  return {
    id, brandId: 'b-1', brandName: 'Refactored.ai', brandTimeZone: 'America/Chicago',
    channel: 'linkedin_member', title: `Post ${id}`, scheduledFor, status: 'scheduled',
  };
}

const NOW = new Date('2026-09-18T15:00:00Z'); // Fri 18 Sep, 10:00 CDT

describe('which day a post belongs to', () => {
  it('uses the CENTRAL day, not the UTC one', () => {
    // 8 PM Central on the 30th is already the 1st in UTC. It belongs to the 30th.
    expect(centralDayOf('2026-10-01T01:00:00.000Z')).toBe('2026-09-30');
    expect(centralMonthOf('2026-10-01T01:00:00.000Z')).toBe('2026-09');
  });

  it('and after the clocks change, too', () => {
    // 15 Nov: Central is CST (UTC-6). 6 PM Central is midnight UTC the next day.
    expect(centralDayOf('2026-11-16T00:00:00.000Z')).toBe('2026-11-15');
  });
});

describe('the grid itself', () => {
  const grid = buildMonthGrid('2026-09', [], NOW);

  it('is titled in words and made of whole weeks', () => {
    expect(grid.title).toBe('September 2026');
    for (const week of grid.weeks) expect(week).toHaveLength(7);
  });

  it('starts on the Monday before the 1st', () => {
    // 1 Sep 2026 is a Tuesday, so the grid opens on Monday 31 August.
    expect(grid.weeks[0][0].day).toBe('2026-08-31');
    expect(grid.weeks[0][0].outside).toBe(true);
    expect(grid.weeks[0][1].day).toBe('2026-09-01');
    expect(grid.weeks[0][1].outside).toBe(false);
  });

  it('marks the days either side as outside the month, and today as today', () => {
    const days = grid.weeks.flat();
    expect(days.find((d) => d.day === '2026-09-18')!.today).toBe(true);
    expect(days.filter((d) => d.today)).toHaveLength(1);
    expect(days.find((d) => d.day === '2026-10-01')!.outside).toBe(true);
  });

  it('covers every day of the month exactly once', () => {
    const inside = grid.weeks.flat().filter((d) => !d.outside).map((d) => d.day);
    expect(inside).toHaveLength(30);
    expect(new Set(inside).size).toBe(30);
    expect(inside[0]).toBe('2026-09-01');
    expect(inside[29]).toBe('2026-09-30');
  });

  it('drops a trailing week that is entirely next month and empty', () => {
    // Without this, most months render a sixth row of nothing.
    const last = grid.weeks[grid.weeks.length - 1];
    expect(last.some((d) => !d.outside)).toBe(true);
  });
});

describe('posts in the cells', () => {
  it('lands each post on its Central day, soonest first inside the day', () => {
    const grid = buildMonthGrid('2026-09', [
      item('late', '2026-09-18T22:00:00.000Z'),  // 5 PM CDT
      item('early', '2026-09-18T14:45:00.000Z'), // 9:45 AM CDT
      item('spill', '2026-10-01T01:00:00.000Z'), // 8 PM CDT on the 30th
    ], NOW);
    const days = grid.weeks.flat();
    expect(days.find((d) => d.day === '2026-09-18')!.items.map((i) => i.id)).toEqual(['early', 'late']);
    // The one that is "October" in UTC belongs to 30 September here.
    expect(days.find((d) => d.day === '2026-09-30')!.items.map((i) => i.id)).toEqual(['spill']);
  });

  it('keeps a post that falls in the leading or trailing days visible', () => {
    const grid = buildMonthGrid('2026-09', [item('aug', '2026-08-31T15:00:00.000Z')], NOW);
    expect(grid.weeks[0][0].items.map((i) => i.id)).toEqual(['aug']);
  });

  it('a day with nothing has an empty list rather than being missing', () => {
    const grid = buildMonthGrid('2026-09', [], NOW);
    expect(grid.weeks.flat().every((d) => Array.isArray(d.items))).toBe(true);
  });
});

describe('moving between months', () => {
  it('steps forward and back, wrapping the year', () => {
    expect(shiftMonth('2026-09', 1)).toBe('2026-10');
    expect(shiftMonth('2026-09', -1)).toBe('2026-08');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('asks the server for the whole grid, not just the month', () => {
    // Otherwise the leading and trailing cells are always empty and look wrong.
    expect(monthRange('2026-09')).toEqual({ start: '2026-08-31', end: expect.stringMatching(/^2026-10-/) });
  });

  it('a malformed month yields an empty grid rather than throwing', () => {
    expect(buildMonthGrid('nonsense', [], NOW).weeks).toEqual([]);
    expect(buildMonthGrid('2026-13', [], NOW).weeks).toEqual([]);
  });
});
