import portalApi from '../utils/portalApi';

// Settings → Enrollment tab. Enrolling (picking a class date) is separate from
// paying: it reserves the student's place; payment on the Subscription tab
// locks the seat. Billing is anchored to the class start date server-side.

export interface EnrollmentCohortOption {
  id: string;
  name: string;
  start_date: string;          // 'YYYY-MM-DD'
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
