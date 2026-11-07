import { readBatchMonth } from '../cohortBatchMonth';

/**
 * The discriminator between a monthly batch and a legacy fixed-start cohort.
 *
 * Everything downstream keys off this one answer: a non-null result means
 * `start_date` is an ORIENTATION and must never be printed as a class start
 * date, and null means it is a genuine start and should be printed exactly as it
 * always has. Both the public cohort list and the student portal's class-date
 * dropdown read it, which is why it lives in one module rather than two.
 *
 * The null cases carry the weight here. Returning null makes a surface fall back
 * to the legacy rendering, so a wrongly-null answer reprints the old bug and a
 * wrongly-non-null answer invents a batch month nobody set.
 */
describe('readBatchMonth', () => {
  it('lifts the month from a batch row', () => {
    expect(readBatchMonth({ batch_month: '2026-12' })).toBe('2026-12');
  });

  it('ignores everything else in settings_json', () => {
    expect(readBatchMonth({ batch_month: '2027-01', schedule: { core_days: ['Monday'] } })).toBe('2027-01');
  });

  it('trims surrounding whitespace rather than returning a value nothing can parse', () => {
    expect(readBatchMonth({ batch_month: '  2026-12  ' })).toBe('2026-12');
  });

  it('is null for a legacy cohort, which is what keeps November showing November 12', () => {
    expect(readBatchMonth({ schedule: { core_days: ['Monday', 'Thursday'] } })).toBeNull();
  });

  it('is null for every shape that is not a populated string', () => {
    expect(readBatchMonth(null)).toBeNull();
    expect(readBatchMonth(undefined)).toBeNull();
    expect(readBatchMonth({})).toBeNull();
    expect(readBatchMonth({ batch_month: null })).toBeNull();
    expect(readBatchMonth({ batch_month: '' })).toBeNull();
    expect(readBatchMonth({ batch_month: '   ' })).toBeNull();
    expect(readBatchMonth({ batch_month: 202612 })).toBeNull();
    expect(readBatchMonth({ batch_month: { month: '2026-12' } })).toBeNull();
  });

  it('is null for a settings_json that is not an object at all', () => {
    // Postgres JSONB can hand back a bare scalar, and a string here would throw
    // on property access if the type guard were a truthiness check alone.
    expect(readBatchMonth('2026-12')).toBeNull();
    expect(readBatchMonth(42)).toBeNull();
    expect(readBatchMonth(true)).toBeNull();
  });

  it('does not mutate what it was given', () => {
    const settings = { batch_month: '2026-12', schedule: {} };
    readBatchMonth(settings);
    expect(settings).toEqual({ batch_month: '2026-12', schedule: {} });
  });
});
