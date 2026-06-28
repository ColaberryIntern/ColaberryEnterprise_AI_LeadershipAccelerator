import api from '../utils/api';

// Public open-cohort shape from GET /api/cohorts (enrollmentRoutes →
// handleListOpenCohorts → cohortService.listOpenCohorts), the same source the
// admin cohort calendar (/admin/accelerator) writes to. Mounted ahead of the
// auth guards, so it is callable anonymously by the public site.
export interface OpenCohort {
  id: string;
  name: string;
  start_date: string; // 'YYYY-MM-DD'
  max_seats: number;
  seats_taken: number;
}

// The next open cohort's start date ('YYYY-MM-DD'), so public surfaces can show
// the same start date the admin manages instead of a hardcoded value. Picks the
// earliest open cohort whose start date is today or later. Returns null on any
// failure (network, bad shape, none upcoming) so callers fall back to their own
// default — this never throws and never blocks render.
export async function fetchNextCohortStart(signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await api.get('/api/cohorts', { signal, timeout: 12000 });
    const cohorts: OpenCohort[] = Array.isArray(res?.data?.cohorts) ? res.data.cohorts : [];
    const todayISO = new Date().toISOString().slice(0, 10);
    const upcoming = cohorts
      .filter((c) => typeof c?.start_date === 'string' && c.start_date >= todayISO)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
    return upcoming[0]?.start_date ?? null;
  } catch {
    return null;
  }
}
