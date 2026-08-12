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
