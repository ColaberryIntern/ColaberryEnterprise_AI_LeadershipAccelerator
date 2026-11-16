import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCampus } from '../CampusContext';
import type { BuildingId } from '../campusMap';
import { setHqIntent, START_PREP } from './hqIntent';

/**
 * Career Prep v27 (CP5.2): goStart('prep') opens the tower already on the Career Prep floor (kit P1 section 6): it
 * records the start intent and opens the HQ building on the campus map; the HQ rides there as it opens (or shows the
 * lobby when the badge does not open the floor). Off the campus (campus not on for this person), it goes to the
 * deep link /portal/career, which lands on the same floor.
 */
export const HQ_BUILDING_ID: BuildingId = 'career';

export function useGoStart(): (where: typeof START_PREP) => void {
  const { enabled, openMap } = useCampus();
  const navigate = useNavigate();
  return useCallback((where: typeof START_PREP) => {
    if (!enabled) { navigate('/portal/career'); return; }
    setHqIntent(where);
    openMap(HQ_BUILDING_ID);
  }, [enabled, openMap, navigate]);
}
