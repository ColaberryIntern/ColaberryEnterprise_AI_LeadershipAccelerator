import { useMemo } from 'react';
import { useEntitlement } from '../../pages/portal/useEntitlement';
import { useCampusAudience } from './useCampusAudience';
import { buildingsFor, careerBuildingFor } from './campusMap';
import type { CampusAudience, CampusBuilding } from './campusMap';

export interface CampusView {
  audience: CampusAudience;
  hasFullAccess: boolean;
  /** The buildings this viewer sees, with the career building showing its audience face. */
  buildings: CampusBuilding[];
}

/** Pure part, so the audience faces are testable without hooks. */
export function campusBuildingsFor(audience: CampusAudience): CampusBuilding[] {
  return buildingsFor(audience).map((b) => (b.id === 'career' ? { ...b, ...careerBuildingFor(audience) } : b));
}

/** Everything the campus views need about the signed-in learner (Campus C2). */
export function useCampusView(): CampusView {
  const { audience } = useCampusAudience();
  const { hasFullAccess } = useEntitlement();
  return useMemo(() => ({ audience, hasFullAccess, buildings: campusBuildingsFor(audience) }), [audience, hasFullAccess]);
}
