import portalApi from '../utils/portalApi';
import { formatBatchMonth } from '../utils/cohortSelection';

// Settings → Enrollment tab. Enrolling (picking a class date) is separate from
// paying: it reserves the student's place; payment on the Subscription tab
// locks the seat. Billing is anchored to the class start date server-side.

export interface EnrollmentCohortOption {
  id: string;
  name: string;
  /**
   * 'YYYY-MM-DD'. For a BATCH row this is the ORIENTATION, not the day class
   * starts — always go through `cohortHeadline` / `cohortOrientation` rather
   * than formatting it directly.
   */
  start_date: string;
  /** 'YYYY-MM' for a monthly batch, null for a legacy fixed-start cohort. */
  batch_month: string | null;
  core_day: string | null;
  core_time: string | null;
  seats_left: number | null;
}

export interface PortalEnrollmentView {
  status: 'not_enrolled' | 'enrolled' | 'enrolled_paid';
  enrolled_cohort: EnrollmentCohortOption | null;
  cohorts: EnrollmentCohortOption[];
  default_cohort_id: string | null;
  paid: boolean;
}

export async function fetchEnrollment(): Promise<PortalEnrollmentView> {
  const { data } = await portalApi.get<PortalEnrollmentView>('/api/portal/enrollment');
  return data;
}

export async function selectEnrollmentCohort(cohortId: string): Promise<{ ok: boolean; changed: boolean; view: PortalEnrollmentView }> {
  const { data } = await portalApi.post('/api/portal/enrollment', { cohort_id: cohortId });
  return data;
}

/** Timezone-safe formatter for DATEONLY strings — new Date('YYYY-MM-DD') parses
 *  as UTC midnight and renders a day early in US timezones. */
export function formatClassDate(dateOnly: string): string {
  const [y, m, d] = dateOnly.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** True when this row is a monthly batch rather than a legacy fixed-start cohort. */
export function isBatchCohort(c: Pick<EnrollmentCohortOption, 'batch_month'>): boolean {
  return formatBatchMonth(c.batch_month) !== null;
}

/**
 * What to put in front of the student as "the date" for this cohort.
 *
 * A legacy row's `start_date` is a genuine start, so it is the answer. A batch's
 * `start_date` is its orientation a month later, so naming it here would tell a
 * student their class begins a month after it actually does — which is the
 * mistake the public cohort card made on 2026-11-06, reported by Taiwo while a
 * lead was trying to enroll. For a batch the honest headline is the batch month
 * itself, because that is what the student is choosing.
 */
export function cohortHeadline(c: EnrollmentCohortOption): string {
  return formatBatchMonth(c.batch_month) ?? formatClassDate(c.start_date);
}

/**
 * The orientation date, for a batch only — null for a legacy cohort, whose
 * `start_date` has already been spent as the headline and must not be repeated
 * here under a second name.
 */
export function cohortOrientation(c: EnrollmentCohortOption): string | null {
  return isBatchCohort(c) ? formatClassDate(c.start_date) : null;
}
