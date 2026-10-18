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
 */
let cached: Promise<boolean> | null = null;

export function fetchIsMgmt(): Promise<boolean> {
  if (!cached) {
    const token = getParticipantToken();
    cached = !token ? Promise.resolve(false) : axios
      .get<unknown>(`${process.env.REACT_APP_API_URL || ''}/api/portal/mgmt/status`, { headers: { Authorization: `Bearer ${token}` }, timeout: CAMPUS_FLAGS_TIMEOUT_MS })
      .then(({ data }) => !!data && typeof data === 'object' && (data as { is_mgmt?: unknown }).is_mgmt === true)
      .catch(() => false);
  }
  return cached;
}

/** Test seam. */
export function __resetMgmtCacheForTests(): void { cached = null; }

export function useIsMgmt(): boolean {
  const [isMgmt, setIsMgmt] = useState(false);
  useEffect(() => {
    let alive = true;
    void fetchIsMgmt().then((v) => { if (alive) setIsMgmt(v); });
    return () => { alive = false; };
  }, []);
  return isMgmt;
}
