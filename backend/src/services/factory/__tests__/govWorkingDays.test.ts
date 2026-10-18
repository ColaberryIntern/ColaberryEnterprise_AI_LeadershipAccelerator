import { usFederalHolidays, isWorkingDay, workingDaysBetween, addWorkingDays, utcDay, dayKey } from '../govWorkingDays';

describe('usFederalHolidays (observed US federal holidays, deterministic)', () => {
  it('computes the 2026 holidays with the nth-weekday and observed-shift rules', () => {
    const h = usFederalHolidays(2026);
    expect(h.has('2026-01-01')).toBe(true);  // New Year's (Thu)
    expect(h.has('2026-01-19')).toBe(true);  // MLK - 3rd Mon Jan
    expect(h.has('2026-02-16')).toBe(true);  // Presidents' - 3rd Mon Feb
    expect(h.has('2026-05-25')).toBe(true);  // Memorial - last Mon May
    expect(h.has('2026-06-19')).toBe(true);  // Juneteenth (Fri)
    expect(h.has('2026-07-03')).toBe(true);  // Independence Jul 4 is a Saturday -> observed Fri Jul 3
    expect(h.has('2026-07-04')).toBe(false); // the actual Saturday is NOT the observed day
    expect(h.has('2026-09-07')).toBe(true);  // Labor - 1st Mon Sep
    expect(h.has('2026-10-12')).toBe(true);  // Columbus - 2nd Mon Oct
    expect(h.has('2026-11-11')).toBe(true);  // Veterans (Wed)
    expect(h.has('2026-11-26')).toBe(true);  // Thanksgiving - 4th Thu Nov
    expect(h.has('2026-12-25')).toBe(true);  // Christmas (Fri)
    expect(h.size).toBe(11);
  });

  it('omits Juneteenth before 2021', () => {
    expect(usFederalHolidays(2020).has('2020-06-19')).toBe(false);
    expect(usFederalHolidays(2020).size).toBe(10);
  });
});

describe('isWorkingDay', () => {
  it('is false on weekends, false on a holiday, true on an ordinary weekday', () => {
    expect(isWorkingDay(utcDay(2026, 9, 17))).toBe(false); // Sat 2026-10-17
    expect(isWorkingDay(utcDay(2026, 9, 18))).toBe(false); // Sun 2026-10-18
    expect(isWorkingDay(utcDay(2026, 10, 26))).toBe(false); // Thanksgiving 2026-11-26
    expect(isWorkingDay(utcDay(2026, 6, 3))).toBe(false);  // observed Independence (Fri 2026-07-03)
    expect(isWorkingDay(utcDay(2026, 9, 19))).toBe(true);  // Mon 2026-10-19
  });
});

describe('workingDaysBetween (half-open [start, end))', () => {
  it('counts Mon-Fri in a clean week and excludes the end', () => {
    expect(workingDaysBetween(utcDay(2026, 9, 19), utcDay(2026, 9, 26))).toBe(5); // Mon 10-19 .. Mon 10-26
  });
  it('excludes a federal holiday inside the range', () => {
    expect(workingDaysBetween(utcDay(2026, 10, 23), utcDay(2026, 10, 30))).toBe(4); // Thanksgiving week (26th off)
  });
  it('is zero when end <= start', () => {
    expect(workingDaysBetween(utcDay(2026, 9, 26), utcDay(2026, 9, 19))).toBe(0);
    expect(workingDaysBetween(utcDay(2026, 9, 19), utcDay(2026, 9, 19))).toBe(0);
  });
});

describe('addWorkingDays', () => {
  it('rolls a Friday + 1 to the next Monday', () => {
    expect(dayKey(addWorkingDays(utcDay(2026, 9, 16), 1))).toBe('2026-10-19'); // Fri 10-16 -> Mon 10-19
  });
  it('skips a holiday when advancing', () => {
    // Wed 2026-11-25 + 1 working day skips Thanksgiving (Thu 11-26) -> Fri 11-27 (the day after is NOT a federal holiday)
    expect(dayKey(addWorkingDays(utcDay(2026, 10, 25), 1))).toBe('2026-11-27');
    // Wed 2026-11-25 + 2 working days -> Mon 11-30 (past Thanksgiving + the weekend)
    expect(dayKey(addWorkingDays(utcDay(2026, 10, 25), 2))).toBe('2026-11-30');
  });
  it('returns the start day for n=0', () => {
    expect(dayKey(addWorkingDays(utcDay(2026, 9, 19), 0))).toBe('2026-10-19');
  });
});
