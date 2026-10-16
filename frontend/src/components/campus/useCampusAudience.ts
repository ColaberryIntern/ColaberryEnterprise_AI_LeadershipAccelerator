import { useMemo } from 'react';
import { useEntitlement } from '../../pages/portal/useEntitlement';
import { useOrgManager } from '../../pages/portal/useIsOrgManager';
import { useIsExplorer } from '../../pages/portal/useIsExplorer';
import { useInternshipNav } from '../../pages/portal/useInternshipNav';
import { deriveCampusAudience, CampusAudienceResult } from './campusAudience';

/**
 * The signed-in learner's campus audience. Reuses the exact hooks PortalShell
 * already calls (useEntitlement and useIsExplorer share one cached schedule
 * fetch), so mounting this beside the shell adds no network round trip.
 */
export function useCampusAudience(): CampusAudienceResult {
  const { isStaff } = useEntitlement();
  const { isManager } = useOrgManager();
  const isExplorer = useIsExplorer();
  const { isIntern } = useInternshipNav();
  return useMemo(
    () => deriveCampusAudience({ isStaff, isOrgManager: isManager, isExplorer, isIntern }),
    [isStaff, isManager, isExplorer, isIntern],
  );
}
