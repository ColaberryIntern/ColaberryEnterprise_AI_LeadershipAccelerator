import { cadenceFor, assertStartDateNotPast } from '../paysimpleRecurring';

describe('cadenceFor', () => {
  it('maps a mid-month anchor to a specific day', () => {
    expect(cadenceFor('monthly', 12)).toEqual({
      ExecutionFrequencyType: 'SpecificDayofMonth',
      ExecutionFrequencyParameter: 12,
    });
  });

  it('maps day 1 and day 28 directly, since both exist in every month', () => {
    expect(cadenceFor('monthly', 1).ExecutionFrequencyParameter).toBe(1);
    expect(cadenceFor('monthly', 28).ExecutionFrequencyParameter).toBe(28);
  });

  // Day 31 is the ONLY rolled case, and that comes from live evidence rather than
  // calendar reasoning: schedule 1865596 has been anchored on day 31 since 2018 and
  // its charges landed on the FIRST of the month 11 times out of 12. A day-31
  // anchor therefore rolls forward into the next month instead of clamping back.
  // Eight members anchored on the 31st were promised 30 September; day 31 would
  // have billed them 1 October.
  it('maps day 31 to LastofMonth, because day 31 rolls into the next month', () => {
    expect(cadenceFor('monthly', 31)).toEqual({ ExecutionFrequencyType: 'LastofMonth' });
    expect(cadenceFor('monthly', 31)).not.toHaveProperty('ExecutionFrequencyParameter');
  });

  // Day 30 is NOT rolled. Schedule 2253360 has run on day 30 since 2019 and charges
  // on the 30th, so mapping it to LastofMonth would move real members off their own
  // anchor for no reason.
  it.each([29, 30])('keeps day %i on its real anchor rather than forcing month-end', (day) => {
    expect(cadenceFor('monthly', day)).toEqual({
      ExecutionFrequencyType: 'SpecificDayofMonth',
      ExecutionFrequencyParameter: day,
    });
  });

  it('maps annual plans to Annually and ignores the day', () => {
    expect(cadenceFor('annual', 31)).toEqual({ ExecutionFrequencyType: 'Annually' });
  });

  it('rejects a nonsense day rather than sending it to the gateway', () => {
    expect(() => cadenceFor('monthly', 0)).toThrow(/out of range/);
    expect(() => cadenceFor('monthly', 32)).toThrow(/out of range/);
    expect(() => cadenceFor('monthly', 1.5)).toThrow(/out of range/);
  });
});

describe('assertStartDateNotPast', () => {
  const NOW = Date.UTC(2026, 7, 22, 14, 0); // 22 Aug 2026

  it('allows a future first charge', () => {
    expect(() => assertStartDateNotPast(new Date(Date.UTC(2026, 8, 23)), NOW)).not.toThrow();
  });

  it('allows a first charge today, regardless of the hour', () => {
    expect(() => assertStartDateNotPast(new Date(Date.UTC(2026, 7, 22, 1)), NOW)).not.toThrow();
    expect(() => assertStartDateNotPast(new Date(Date.UTC(2026, 7, 22, 23)), NOW)).not.toThrow();
  });

  // The invariant that keeps a migration from inventing a catch-up charge: a period
  // that already lapsed is written off, never collected.
  it('REFUSES a first charge in the past, so nobody is retroactively billed', () => {
    expect(() => assertStartDateNotPast(new Date(Date.UTC(2026, 7, 21)), NOW))
      .toThrow(/written off, never back-charged/);
    expect(() => assertStartDateNotPast(new Date(Date.UTC(2026, 6, 1)), NOW))
      .toThrow(/in the past/);
  });
});
