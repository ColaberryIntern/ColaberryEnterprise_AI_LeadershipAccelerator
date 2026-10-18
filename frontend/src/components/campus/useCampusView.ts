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

/** Everything the campus views need about the signed-in learner (Campus C2; C6 adds accessOf and isExplorer). */
export function useCampusView(): CampusView {
  const { audience } = useCampusAudience();
  const { isStaff, hasFullAccess } = useEntitlement(); // PageGate's own signals, not the campus's wider staff
  const isExplorer = useIsExplorer();
  return useMemo(() => campusViewFor(audience, { isStaff, hasFullAccess, isExplorer }), [audience, isStaff, hasFullAccess, isExplorer]);
}
