import { fetchSchedule, OnboardingSchedule } from '../../services/onboardingApi';

/**
 * Module-level cache/inflight-dedup for fetchSchedule() — shared by useIsExplorer
 * and useEntitlement so two hooks reading the same schedule payload (both are
 * used together in PortalShell) fire exactly one GET, not two.
 */
let cached: OnboardingSchedule | null = null;
let inflight: Promise<OnboardingSchedule> | null = null;

export function loadSchedule(): Promise<OnboardingSchedule> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = fetchSchedule()
      .then((s) => { cached = s; return s; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/** The currently-cached schedule, if any fetch has completed — synchronous, no I/O. */
export function getCachedSchedule(): OnboardingSchedule | null {
  return cached;
}

/** Test/dev escape hatch — force the next loadSchedule() to refetch. */
export function resetScheduleCache(): void {
  cached = null;
  inflight = null;
}
