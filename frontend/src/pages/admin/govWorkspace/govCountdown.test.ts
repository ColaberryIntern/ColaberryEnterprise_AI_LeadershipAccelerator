import { deriveCountdown, shipByDate, workingDaysBetween, usFederalHolidays } from './govCountdown';

const utc = (y: number, m0: number, d: number) => new Date(Date.UTC(y, m0, d));

describe('govCountdown working-day mirror', () => {
  it('matches the backend federal-holiday + working-day math', () => {
    expect(usFederalHolidays(2026).has('2026-07-03')).toBe(true); // Independence observed Fri
    expect(usFederalHolidays(2026).size).toBe(11);
    expect(workingDaysBetween(utc(2026, 9, 19), utc(2026, 9, 26))).toBe(5); // a clean Mon-Mon week
    expect(workingDaysBetween(utc(2026, 10, 23), utc(2026, 10, 30))).toBe(4); // Thanksgiving week
  });

  it('ship-by is the day before the deadline, never earlier than now', () => {
    expect(shipByDate(utc(2026, 10, 30), utc(2026, 9, 19))).toEqual(utc(2026, 10, 29));
    expect(shipByDate(null, utc(2026, 9, 19))).toBeNull();
    expect(shipByDate(utc(2026, 9, 19), utc(2026, 9, 25))).toEqual(utc(2026, 9, 25)); // clamped to now
  });
});

describe('deriveCountdown (deterministic)', () => {
  const now = utc(2026, 9, 19); // Mon 2026-10-19

  it('renders "-" (null) with a reason when the deadline or plan is missing', () => {
    expect(deriveCountdown({ now, deadline: null, remainingStoryCount: 3, humanBlockedCount: 0 }).probability).toBeNull();
    expect(deriveCountdown({ now, deadline: null, remainingStoryCount: 3, humanBlockedCount: 0 }).reason).toBe('no submission deadline');
    expect(deriveCountdown({ now, deadline: utc(2026, 11, 1), remainingStoryCount: null, humanBlockedCount: 0 }).reason).toBe('no build plan yet');
  });

  it('computes the ship-by and a high probability with ample slack', () => {
    const c = deriveCountdown({ now, deadline: utc(2026, 11, 1), remainingStoryCount: 1, humanBlockedCount: 0 });
    expect(c.shipBy).toBe('2026-12-31'); // the day before the deadline
    expect(c.remainingBuildDays).toBe(2); // 1 story * 2 working days
    expect(c.probability).toBe(95);       // lots of working days vs 2 needed
  });

  it('drops to the low band when the remaining work dwarfs the window', () => {
    const c = deriveCountdown({ now, deadline: utc(2026, 10, 2), remainingStoryCount: 50, humanBlockedCount: 0 });
    expect(c.remainingBuildDays).toBe(100);
    expect(c.probability).toBe(5);
  });

  it('95 when there is nothing left to build', () => {
    expect(deriveCountdown({ now, deadline: utc(2026, 11, 1), remainingStoryCount: 0, humanBlockedCount: 0 }).probability).toBe(95);
  });

  it('human-blocked items add latency and are reproducible', () => {
    const a = deriveCountdown({ now, deadline: utc(2026, 10, 16), remainingStoryCount: 5, humanBlockedCount: 2 });
    const b = deriveCountdown({ now, deadline: utc(2026, 10, 16), remainingStoryCount: 5, humanBlockedCount: 2 });
    expect(a).toEqual(b); // pure
    expect(a.effectiveNeeded).toBe(5 * 2 + 2 * 2); // remainingBuildDays 10 + blocked 2*2
  });
});
