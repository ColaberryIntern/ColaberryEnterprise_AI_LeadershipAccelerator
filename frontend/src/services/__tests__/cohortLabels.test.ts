import { cohortHeadline, cohortOrientation, isBatchCohort, EnrollmentCohortOption } from '../portalEnrollmentApi';

/**
 * What the Settings -> Enrollment tab is allowed to call "the date".
 *
 * Taiwo reported on 2026-11-06 that this screen was showing December 7 while
 * leads expected November 12. The data behind that one row was corrected, but
 * the screen would have told the same lie again in December for a structural
 * reason: under the monthly batch model a batch's `start_date` is its
 * ORIENTATION, which falls in the month AFTER the batch, so "Cohort - December
 * 2026" carries 2027-01-04. Printing that as a class start date names a month
 * the student has not missed and cannot join yet.
 *
 * These three functions are the whole defense. A legacy row must keep rendering
 * exactly as it always has, because its `start_date` genuinely is a start.
 */
const batch = (over: Partial<EnrollmentCohortOption> = {}): EnrollmentCohortOption => ({
  id: 'c-dec',
  name: 'Cohort - December 2026',
  start_date: '2027-01-04',
  batch_month: '2026-12',
  core_day: 'Monday',
  core_time: '6:30 PM - 8:00 PM',
  seats_left: 500,
  ...over,
});

const legacy = (over: Partial<EnrollmentCohortOption> = {}): EnrollmentCohortOption => ({
  id: 'c-nov',
  name: 'Cohort - November 2026',
  start_date: '2026-11-12',
  batch_month: null,
  core_day: 'Monday',
  core_time: '6:30 PM - 8:00 PM',
  seats_left: 123,
  ...over,
});

describe('isBatchCohort', () => {
  it('is true only for a row carrying a parseable batch month', () => {
    expect(isBatchCohort(batch())).toBe(true);
    expect(isBatchCohort(legacy())).toBe(false);
  });

  it('treats an unparseable batch month as legacy rather than guessing', () => {
    // Falling back to the legacy rendering shows a real date from the row. The
    // alternative — trusting a malformed value — prints a month nobody set.
    expect(isBatchCohort(batch({ batch_month: '2026-13' }))).toBe(false);
    expect(isBatchCohort(batch({ batch_month: 'December' }))).toBe(false);
    expect(isBatchCohort(batch({ batch_month: '' }))).toBe(false);
  });
});

describe('cohortHeadline', () => {
  it('names the BATCH MONTH for a batch, never its orientation', () => {
    expect(cohortHeadline(batch())).toBe('December 2026');
    // The specific regression: the orientation must not be the headline.
    expect(cohortHeadline(batch())).not.toContain('January');
    expect(cohortHeadline(batch())).not.toContain('2027');
  });

  it('names the start date for a legacy cohort, which is what Taiwo expected to see', () => {
    expect(cohortHeadline(legacy())).toBe('November 12, 2026');
  });

  it('falls back to the start date when the batch month is unusable', () => {
    expect(cohortHeadline(batch({ batch_month: 'oops' }))).toBe('January 4, 2027');
  });

  it('does not shift a date across a timezone', () => {
    // new Date('2026-11-12') is UTC midnight and renders as the 11th in US zones.
    expect(cohortHeadline(legacy({ start_date: '2026-11-12' }))).toBe('November 12, 2026');
    expect(cohortHeadline(legacy({ start_date: '2027-01-01' }))).toBe('January 1, 2027');
  });
});

describe('cohortOrientation', () => {
  it('gives the orientation for a batch, since the headline no longer carries it', () => {
    expect(cohortOrientation(batch())).toBe('January 4, 2027');
  });

  it('is null for a legacy cohort, so its start date is not repeated under a second name', () => {
    expect(cohortOrientation(legacy())).toBeNull();
  });

  it('headline and orientation are never the same string for a batch', () => {
    // If they ever collide the screen is showing one date under two labels,
    // which is the confusion this whole change exists to remove.
    const b = batch();
    expect(cohortHeadline(b)).not.toBe(cohortOrientation(b));
  });
});
