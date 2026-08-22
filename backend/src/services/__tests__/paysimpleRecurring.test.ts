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

  // Eight live subscribers anchor on the 30th or 31st. SpecificDayofMonth: 31 does
  // not survive a 30-day month, so those must become LastofMonth or a renewal
  // silently skips February.
  it.each([29, 30, 31])('maps day %i to LastofMonth rather than a day that may not exist', (day) => {
    expect(cadenceFor('monthly', day)).toEqual({ ExecutionFrequencyType: 'LastofMonth' });
    expect(cadenceFor('monthly', day)).not.toHaveProperty('ExecutionFrequencyParameter');
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
