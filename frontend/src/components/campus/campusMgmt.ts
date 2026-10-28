import axios from 'axios';
import { useEffect, useState } from 'react';
import { getParticipantToken } from '../../utils/participantToken';
import { CAMPUS_FLAGS_TIMEOUT_MS } from './campusApi';

/**
 * Can this learner use the Management Portal bridge? (Colaberry Campus C6.)
 *
 * The same answer as useMgmtStatus (GET /api/portal/mgmt/status -> mgmtBridgeService.getMgmtStatus: community role staff AND
 * a valid mgmt_role), read the campus way: its own request with no redirect interceptor (a campus read must never end a
 * session), cached once per page load so the banner, nav and map do not each ask. Any failure reads as "not management".
 *
 * Campus HQ (H2): the same response carries the person's admin `sections` (the ones their admin token is scoped to), so the
 * HQ building can light exactly the floors the admin sidebar would show. A malformed list reads as no sections.
 */
export interface CampusMgmt { isMgmt: boolean; label: string | null; sections: string[] }
const NONE: CampusMgmt = { isMgmt: false, label: null, sections: [] };

/** The response contract, checked at the boundary: anything unexpected reads as "not management". */
export function parseMgmtStatus(data: unknown): CampusMgmt {
  if (!data || typeof data !== 'object') return NONE;
  const d = data as { is_mgmt?: unknown; label?: unknown; sections?: unknown };
  if (d.is_mgmt !== true) return NONE;
  const sections = Array.isArray(d.sections) ? d.sections.filter((s): s is string => typeof s === 'string') : [];
  return { isMgmt: true, label: typeof d.label === 'string' ? d.label : null, sections };
}

let cached: Promise<CampusMgmt> | null = null;

export function fetchMgmt(): Promise<CampusMgmt> {
  if (!cached) {
    const token = getParticipantToken();
    cached = !token ? Promise.resolve(NONE) : axios
      .get<unknown>(`${process.env.REACT_APP_API_URL || ''}/api/portal/mgmt/status`, { headers: { Authorization: `Bearer ${token}` }, timeout: CAMPUS_FLAGS_TIMEOUT_MS })
      .then(({ data }) => parseMgmtStatus(data))
      .catch(() => NONE);
  }
  return cached;
}

export function fetchIsMgmt(): Promise<boolean> {
  return fetchMgmt().then((m) => m.isMgmt);
}

/** Test seam. */
export function __resetMgmtCacheForTests(): void { cached = null; }

export function useCampusMgmt(): CampusMgmt & { canSection: (s: string) => boolean } {
  const [m, setM] = useState<CampusMgmt>(NONE);
  useEffect(() => {
    let alive = true;
    void fetchMgmt().then((v) => { if (alive) setM(v); });
    return () => { alive = false; };
  }, []);
  return { ...m, canSection: (s: string) => m.sections.includes(s) };
}

export function useIsMgmt(): boolean {
  return useCampusMgmt().isMgmt;
}
