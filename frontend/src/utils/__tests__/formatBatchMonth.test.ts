import { formatBatchMonth } from '../cohortSelection';

/**
 * The label on the landing page's enrollment card.
 *
 * It exists because the card used to print `start_date`, which for a monthly batch is
 * the ORIENTATION and lands in the month after the batch. The open November row
 * therefore advertised "December 7, 2026" and leads concluded they had missed the
 * month. The null cases matter as much as the happy ones: returning null is what makes
 * the card fall back to the legacy rendering instead of printing a guessed month.
 */
describe('formatBatchMonth', () => {
  it('formats the live batch rows', () => {
    expect(formatBatchMonth('2026-12')).toBe('December 2026');
    expect(formatBatchMonth('2027-01')).toBe('January 2027');
    expect(formatBatchMonth('2027-02')).toBe('February 2027');
    expect(formatBatchMonth('2027-03')).toBe('March 2027');
  });

  it('does not roll back a month across a timezone', () => {
    // Built at midday on the 1st for exactly this reason: midnight on the 1st in a
    // negative-offset zone is the last day of the previous month, which would have
    // labelled the January batch "December".
    expect(formatBatchMonth('2027-01')).toBe('January 2027');
    expect(formatBatchMonth('2026-01')).toBe('January 2026');
  });

  it('returns null for a legacy cohort, which has no batch month', () => {
    // The caller renders the old start-date card when this is null, so null is the
    // signal that keeps "Cohort - November 2026" showing November 12.
    expect(formatBatchMonth(null)).toBeNull();
    expect(formatBatchMonth(undefined)).toBeNull();
    expect(formatBatchMonth('')).toBeNull();
  });

  it('returns null rather than guessing at malformed input', () => {
    expect(formatBatchMonth('2026-13')).toBeNull();
    expect(formatBatchMonth('2026-00')).toBeNull();
    expect(formatBatchMonth('2026')).toBeNull();
    expect(formatBatchMonth('December 2026')).toBeNull();
    expect(formatBatchMonth('2026-1')).toBeNull();
  });
});
