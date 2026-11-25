import { useEffect, useRef } from 'react';
import type { CampusAudience } from '../campusMap';
import type { Hq } from './hqModel';
import { START_PREP, takeHqIntent } from './hqIntent';
import { isCareerPrepFloor, isPrepAudience, type CareerPrepFloorState } from './careerPrepDoors';

/**
 * Campus HQ: take the pending ride request (hqIntent) as the HQ opens. A floor number rides there at once. Career
 * Prep v27 (CP5.2): the 'prep' start intent (goStart('prep')) waits until the member's Career Prep floor is known
 * (the flag loads after the HQ opens), then rides to it, or opens the lobby when the badge does not open it.
 */
export function useHqStartIntent(active: boolean, hq: Hq, audience: CampusAudience, careerPrep: CareerPrepFloorState | undefined, ride: (num: string) => void, toLobby: () => void): void {
  const rideRef = useRef(ride);
  rideRef.current = ride;
  const lobbyRef = useRef(toLobby);
  lobbyRef.current = toLobby;
  const startPrep = useRef(false);
  useEffect(() => {
    if (!active) return;
    const f = takeHqIntent();
    if (f === START_PREP) startPrep.current = true;
    else if (f) rideRef.current(f);
  }, [active]);
  useEffect(() => {
    if (!active || !startPrep.current || (isPrepAudience(audience) && careerPrep === undefined)) return;
    startPrep.current = false;
    const prep = hq.floors.find(isCareerPrepFloor);
    if (prep && prep.access !== 'none') rideRef.current(prep.num); else lobbyRef.current();
  }, [active, hq, audience, careerPrep]);
}
