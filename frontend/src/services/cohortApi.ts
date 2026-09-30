import api from '../utils/api';
import { selectNextCohort } from '../utils/cohortSelection';

// Public open-cohort shape from GET /api/cohorts (enrollmentRoutes →
// handleListOpenCohorts → cohortService.listOpenCohorts), the same source the
// admin cohort calendar (/admin/accelerator) writes to. Mounted ahead of the
// auth guards, so it is callable anonymously by the public site.
export interface OpenCohort {
  id: string;
  name: string;
  start_date: string; // 'YYYY-MM-DD'
  core_day?: string | null; // e.g. 'Monday and Thursday'
  core_time?: string | null; // e.g. '6:30 PM - 8:30 PM CST'
  max_seats: number;
  seats_taken: number;
  status?: 'open' | 'closed' | 'completed';
  cohort_type?: string;
}

// The next joinable public cohort, so public surfaces can show the same start
// date AND live-session schedule the admin manages instead of hardcoded values.
// Selection (including late-join and internal-lane rules) lives in
// utils/cohortSelection so every public surface agrees. Returns null on any
// failure (network, bad shape, none joinable) so callers fall back to their own
// defaults — never throws, never blocks render.
export async function fetchNextCohort(signal?: AbortSignal): Promise<OpenCohort | null> {
  try {
    const res = await api.get('/api/cohorts', { signal, timeout: 12000 });
    return selectNextCohort(res?.data?.cohorts) as OpenCohort | null;
  } catch {
    return null;
  }
}

// Convenience: just the next open cohort's start date ('YYYY-MM-DD'), or null.
export async function fetchNextCohortStart(signal?: AbortSignal): Promise<string | null> {
  const c = await fetchNextCohort(signal);
  return c ? c.start_date : null;
}
