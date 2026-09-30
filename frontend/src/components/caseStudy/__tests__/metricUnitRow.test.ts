import { unitAlreadyInValue } from '../CaseStudyMeasurement';

/**
 * The metric card used to print its unit twice.
 *
 * MEASURED ACROSS THE LIVE RECORDS, not suspected: 13 of the 14 metrics
 * published on the three records carry the unit inside `valueDisplay` — "14
 * decision records" sitting directly above a row reading UNIT: records. That is
 * not fourteen separate authoring slips. A display value written as a complete
 * phrase, which is exactly what the authoring guidance asks for, almost always
 * contains its own noun.
 *
 * So the card suppresses the redundant row. The cases below are the real
 * published values, plus the two that must NOT be suppressed — because a rule
 * that hides a unit carrying information the value does not state would be a
 * worse defect than the duplication it set out to fix.
 */
describe('unitAlreadyInValue', () => {
  it.each([
    ['14 decision records', 'records'],
    ['6 phases', 'phases'],
    ['132 commits · 18 days', 'commits'],
    ['46 of 292 files', 'files'],
    ['7 modules · 4 with tests', 'modules'],
    ['20 tests, over 1 of 142 files', 'tests'],
  ])('suppresses the row for "%s" (unit "%s")', (value, unit) => {
    expect(unitAlreadyInValue(value, unit)).toBe(true);
  });

  it('keeps a unit that adds something the value does not say', () => {
    // "41%" nowhere contains the words "percentage points"; that row is the
    // only place a reader learns what the number is measured in.
    expect(unitAlreadyInValue('41%', 'percentage points')).toBe(false);
  });

  it('is conservative about singular and plural', () => {
    // Printing a slightly redundant row is a smaller error than hiding a unit
    // the value did not actually state.
    expect(unitAlreadyInValue('3 rooms', 'room')).toBe(false);
  });

  it('does nothing when either side is empty', () => {
    expect(unitAlreadyInValue('14 records', '')).toBe(false);
    expect(unitAlreadyInValue('', 'records')).toBe(false);
  });

  it('does not build a regular expression out of record data', () => {
    // The unit is snapshot content. Escaping it into a pattern would be a
    // needless place for a `%` or a `.` to change what matches.
    expect(() => unitAlreadyInValue('cost is 5', '$(a|b)*')).not.toThrow();
    expect(unitAlreadyInValue('cost is 5', '$(a|b)*')).toBe(false);
  });
});
