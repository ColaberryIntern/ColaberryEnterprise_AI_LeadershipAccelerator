/**
 * cohortBatchMonth — the single place that decides whether a cohort row is a
 * monthly BATCH or a legacy fixed-start cohort.
 *
 * WHY THIS IS ITS OWN MODULE. Two services need the answer and neither should own
 * it: `cohortService` builds the public cohort list behind the marketing site, and
 * `portalEnrollmentService` builds the class-date dropdown in the student portal.
 * They are the two surfaces that printed the wrong month on 2026-11-06, and they
 * would both have to be edited in step forever if each carried its own copy of the
 * rule. A third module both depend on is the fix for that, not a third copy.
 *
 * WHAT THE FIELD MEANS. Under the monthly batch model you join the batch of the
 * month you pay in, and a batch's `cohorts.start_date` holds its ORIENTATION, which
 * falls on the first Monday of the month AFTER the batch. "Cohort - December 2026"
 * carries `start_date = 2027-01-04`. A legacy fixed-start cohort has no batch month
 * and its `start_date` genuinely is the day class starts.
 *
 * So `start_date` alone cannot say which kind of row you are holding, and printing
 * it as "the start date" is correct for one kind and a month late for the other.
 * This field is the discriminator, and it is null for every legacy row.
 *
 * Kept free of imports on purpose: a pure function with no model, no database and
 * no config can be depended on from anywhere without a cycle, and tested without
 * either.
 */

/**
 * The batch month as `YYYY-MM`, or null when the row is a legacy fixed-start cohort.
 *
 * Deliberately strict. Anything that is not a non-blank string — absent, null, a
 * number, whitespace, a malformed shape — is treated as "not a batch", because the
 * fallback for null is to render the row the way it was always rendered. Guessing
 * at a half-populated value is how a surface would start printing a month nobody
 * set.
 */
export function readBatchMonth(settingsJson: unknown): string | null {
  if (!settingsJson || typeof settingsJson !== 'object') return null;
  const value = (settingsJson as { batch_month?: unknown }).batch_month;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
