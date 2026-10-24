import { useEffect, useMemo, useState } from 'react';
import { fetchCampusAudience } from './campusApi';
import type { CampusAudience } from './campusMap';
import { useEntitlement } from '../../pages/portal/useEntitlement';
import { useOrgManager } from '../../pages/portal/useIsOrgManager';
import { useIsExplorer } from '../../pages/portal/useIsExplorer';
import { useInternshipNav } from '../../pages/portal/useInternshipNav';
import { deriveCampusAudience, CampusAudienceResult } from './campusAudience';
import { useIsMgmt } from './campusMgmt';
import { effectiveAudience, useAudienceSwitchState } from './campusAudienceSwitch';

/**
 * The signed-in learner's campus audience. Reuses the exact hooks PortalShell
 * already calls (useEntitlement and useIsExplorer share one cached schedule
 * fetch), so mounting this beside the shell adds no network round trip.
 *
 * C6: campus STAFF = is_staff OR the Management Portal bridge's status (role staff AND a valid mgmt_role), because the Staff
 * Office's links only work through that bridge. The backend audience (campusStaffDesks.campusAudienceFor) uses the same pair.
 * Page locks never use this wider staff: they use PageGate's own isStaff (see useCampusView).
 *
 * WP-7: an account the server allows (staff, or one listed) may preview another account type from the top bar's account chip;
 * the campus then draws that audience. `realAudience` stays the account's own.
 *
 * C13 (round 3): the account's own audience is the SERVER's (GET /api/portal/campus/audience), asked once per page load while the
 * campus is on. Before, each signal resolved on its own, so an org manager who is also staff drew the business campus first (and,
 * with a slow management read, kept it). `ready` says when the answer is in; until then the home draws nothing audience-specific.
 * A failed read falls back to the local signals below, so the campus never waits forever.
 */
let cached: Promise<CampusAudience | null> | null = null;
export function serverAudience(): Promise<CampusAudience | null> {
  if (!cached) cached = (async () => { try { return await fetchCampusAudience(); } catch { return null; } })();
  return cached;
}
/** Test seam. */
export function __resetServerAudienceForTests(): void { cached = null; }
export function useCampusAudience(): CampusAudienceResult {
  const { isStaff: pageStaff } = useEntitlement();
  const isMgmt = useIsMgmt();
  const isStaff = pageStaff || isMgmt;
  const { isManager } = useOrgManager();
  const isExplorer = useIsExplorer();
  const { isIntern } = useInternshipNav();
  const { audienceSwitch, viewAs, active = false } = useAudienceSwitchState();
  const [server, setServer] = useState<{ done: boolean; audience: CampusAudience | null }>({ done: false, audience: null });
  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    void serverAudience().then((a) => { if (alive) setServer({ done: true, audience: a }); });
    return () => { alive = false; };
  }, [active]);
  return useMemo(() => {
    const local = deriveCampusAudience({ isStaff, isOrgManager: isManager, isExplorer, isIntern });
    const own = server.audience ?? local.audience;
    return { ...local, audience: effectiveAudience(own, audienceSwitch, viewAs), realAudience: own, ready: !active || server.done };
  }, [isStaff, isManager, isExplorer, isIntern, audienceSwitch, viewAs, server, active]);
}
