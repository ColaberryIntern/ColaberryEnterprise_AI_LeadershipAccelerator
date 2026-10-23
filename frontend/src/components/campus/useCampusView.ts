import { useMemo } from 'react';
import { useEntitlement } from '../../pages/portal/useEntitlement';
import { useIsExplorer } from '../../pages/portal/useIsExplorer';
import { useCampusAudience } from './useCampusAudience';
import { buildingsFor, careerBuildingFor } from './campusMap';
import type { CampusAudience, CampusBuilding, ExplorerAccess } from './campusMap';
import { buildingState, AccessSignals } from './campusAccess';

export interface CampusView {
  audience: CampusAudience;
  hasFullAccess: boolean;
  /** The buildings this viewer sees, with the career building showing its audience face. */
  buildings: CampusBuilding[];
  /** C6: each building's state for this viewer, from the pages' own signals (campusAccess.buildingState). */
  accessOf: (b: CampusBuilding) => ExplorerAccess;
  /** C6: the portal's is_explorer (useIsExplorer), for Explorer-only surfaces such as the path to enrolling. */
  isExplorer: boolean;
}

/** Pure part, so the audience faces are testable without hooks. */
export function campusBuildingsFor(audience: CampusAudience): CampusBuilding[] {
  return buildingsFor(audience).map((b) => (b.id === 'career' ? { ...b, ...careerBuildingFor(audience) } : b));
}

/** Pure: the whole view for an audience and the page signals (the hook below uses it; tests build views with it too). */
export function campusViewFor(audience: CampusAudience, s: AccessSignals): CampusView {
  return { audience, hasFullAccess: s.hasFullAccess, buildings: campusBuildingsFor(audience), accessOf: (b) => buildingState(b, s), isExplorer: s.isExplorer };
}

/**
 * WP-7: the lock signals a previewed account type is drawn with (an Explorer sees the locks, a member does not, staff see every
 * building). Drawing only: opening a page still goes through PageGate with the real account.
 */
export const PREVIEW_SIGNALS: Record<CampusAudience, AccessSignals> = {
  member: { isStaff: false, hasFullAccess: true, isExplorer: false },
  explorer: { isStaff: false, hasFullAccess: false, isExplorer: true },
  business: { isStaff: false, hasFullAccess: true, isExplorer: false },
  staff: { isStaff: true, hasFullAccess: true, isExplorer: false },
};

/** Everything the campus views need about the signed-in learner (Campus C2; C6 adds accessOf and isExplorer). */
export function useCampusView(): CampusView {
  const { audience, realAudience } = useCampusAudience();
  const { isStaff, hasFullAccess } = useEntitlement(); // PageGate's own signals, not the campus's wider staff
  const isExplorer = useIsExplorer();
  const previewing = !!realAudience && realAudience !== audience;
  return useMemo(() => campusViewFor(audience, previewing ? PREVIEW_SIGNALS[audience] : { isStaff, hasFullAccess, isExplorer }),
    [audience, previewing, isStaff, hasFullAccess, isExplorer]);
}
