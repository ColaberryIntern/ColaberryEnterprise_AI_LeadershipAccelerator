import { Cohort } from '../models/Cohort';

/**
 * Which cohorts a public visitor may enrol into.
 *
 * `/api/cohorts` returns every cohort with `status='open'`, which includes
 * internal lanes (the standing `explorer` prospect cohort, `corporate` sponsor
 * cohorts, demo rows). Those must never appear in a public cohort picker.
 */
export const PUBLIC_COHORT_TYPES = ['accelerator'] as const;

/**
 * Cohorts a visitor can still join, most imminent first.
 *
 * Deliberately does NOT require `start_date` to be in the future. The program
 * admits late joiners — the backend's enrolment contract
 * (`validateCohortAvailability`) only checks `status='open'` and seat
 * availability, so filtering out started cohorts here made the whole enrolment
 * flow dead the day a cohort began: every cohort dropped out of the list and
 * the Enroll submit button is disabled while the list is empty. That is exactly
 * what happened once "Cohort - July 2026" started on 2026-07-23.
 *
 * Keep this aligned with `validateCohortAvailability` in
 * `backend/src/services/enrollmentService.ts`. If they disagree, a visitor
 * either sees a cohort the server will reject, or cannot reach one it accepts.
 */
export function selectEnrollableCohorts(cohorts: Cohort[] | null | undefined): Cohort[] {
  if (!Array.isArray(cohorts)) return [];

  return cohorts
    .filter((c) => {
      if (!c || typeof c.start_date !== 'string') return false;
      // Seats: mirrors the server's `seats_taken >= max_seats` rejection.
      if (!(c.seats_taken < c.max_seats)) return false;
      // Status is normally pre-filtered server-side; re-check defensively so a
      // caller passing an unfiltered list cannot surface a closed cohort.
      if (c.status && c.status !== 'open') return false;
      // Internal lanes are not publicly enrollable.
      return PUBLIC_COHORT_TYPES.includes(c.cohort_type as typeof PUBLIC_COHORT_TYPES[number]);
    })
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
}

/**
 * The cohort to advertise on marketing surfaces (urgency badge, landing page
 * "next cohort" block). Null when nothing is joinable.
 */
export function selectNextCohort(cohorts: Cohort[] | null | undefined): Cohort | null {
  return selectEnrollableCohorts(cohorts)[0] || null;
}

/**
 * A batch month as a reader sees it: "2026-12" becomes "December 2026".
 *
 * WHY THIS EXISTS AT ALL. Since 2026-11-05 enrollment runs in monthly batches: you
 * join the batch for the month you pay in, and that batch's ORIENTATION is the first
 * Monday of the FOLLOWING month. `cohorts.start_date` holds the orientation, so a
 * marketing surface that prints it is naming a month the visitor has not missed and
 * cannot join yet. On 2026-11-06 the open November batch advertised "December 7, 2026"
 * and leads asked whether they could still start this month. Taiwo reported it.
 *
 * Parsed from `batch_month` rather than from the row's name, because the name is a
 * human label that has already drifted on production (both a hyphen and an em dash
 * appear in live rows) while `batch_month` is written by the batch tooling.
 *
 * Returns null for anything that is not a `YYYY-MM`, so a caller falls back to the
 * legacy rendering instead of printing a guess.
 */
export function formatBatchMonth(batchMonth: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(String(batchMonth || '').trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  // Day 1 at midday, so no timezone can roll it into the previous month.
  return new Date(year, month - 1, 1, 12).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}
