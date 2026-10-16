import portalApi from '../../utils/portalApi';

/**
 * Client for the Colaberry Campus endpoints. C1 has one: whether the campus is
 * on for the signed-in participant.
 *
 * FAIL CLOSED. The campus is an opt-in navigation change, so a timeout, a 401,
 * a 404 from an older backend, or a malformed body all read as "off" and the
 * learner keeps the classic portal. That is the opposite of usePortalFlags'
 * fail-open Today redesign on purpose: there the flag exists for rollback,
 * here it exists for rollout.
 */
export const CAMPUS_FLAGS_TIMEOUT_MS = 10_000;

export interface CampusFlags { campus: boolean }

export async function fetchCampusFlags(): Promise<CampusFlags> {
  try {
    const { data } = await portalApi.get<unknown>('/api/portal/campus/flags', { timeout: CAMPUS_FLAGS_TIMEOUT_MS });
    const campus = !!data && typeof data === 'object' && (data as { campus?: unknown }).campus === true;
    return { campus };
  } catch {
    return { campus: false };
  }
}
