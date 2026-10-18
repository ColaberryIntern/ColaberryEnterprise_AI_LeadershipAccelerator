import { useMemo } from 'react';
import { useEntitlement } from '../../pages/portal/useEntitlement';
import { useOrgManager } from '../../pages/portal/useIsOrgManager';
import { useIsExplorer } from '../../pages/portal/useIsExplorer';
import { useInternshipNav } from '../../pages/portal/useInternshipNav';
import { deriveCampusAudience, CampusAudienceResult } from './campusAudience';
import { useIsMgmt } from './campusMgmt';

/**
 * The signed-in learner's campus audience. Reuses the exact hooks PortalShell
 * already calls (useEntitlement and useIsExplorer share one cached schedule
 * fetch), so mounting this beside the shell adds no network round trip.
 *
 * C6: campus STAFF = is_staff OR the Management Portal bridge's status (role staff AND a valid mgmt_role), because the Staff
 * Office's links only work through that bridge. The backend audience (campusStaffDesks.campusAudienceFor) uses the same pair.
 * Page locks never use this wider staff: they use PageGate's own isStaff (see useCampusView).
 */
export function useCampusAudience(): CampusAudienceResult {
  const { isStaff: pageStaff } = useEntitlement();
  const isMgmt = useIsMgmt();
  const isStaff = pageStaff || isMgmt;
  const { isManager } = useOrgManager();
  const isExplorer = useIsExplorer();
  const { isIntern } = useInternshipNav();
  return useMemo(
    () => deriveCampusAudience({ isStaff, isOrgManager: isManager, isExplorer, isIntern }),
    [isStaff, isManager, isExplorer, isIntern],
  );
}
