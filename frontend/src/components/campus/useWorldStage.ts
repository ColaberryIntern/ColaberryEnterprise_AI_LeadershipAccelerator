import { useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { BuildingId, CampusAudience } from './campusMap';
import type { StaffDesk } from './campusPeopleApi';
import { mayaAllowedFor } from './campusPeople';
import { ROOMS } from './interior/roomModel';
import type { CameraApi, InsetsOf } from './useCampusCamera';
import type { Viewport } from './campusCamera';
import type { MapDesk } from './art/StaffTokens';
import { readParticipant } from '../../pages/portal/today/shellUtils';

/**
 * C11b staging for CampusWorld, kept out of it so the component stays readable: the camera's framing, the desks and your initials
 * for the map, and the door reveal.
 */

/** The camera: the caller's panel insets for the whole campus, and the arrival card's (right 400 px wide; 55% of a phone's height). */
export function useMapStage(staffDesks: StaffDesk[] | undefined, audience: CampusAudience, insets: InsetsOf | undefined): {
  camApi: MutableRefObject<CameraApi | null>; camera: { apiRef: MutableRefObject<CameraApi | null>; insets?: InsetsOf; focusInsets: InsetsOf };
  mapDesks: MapDesk[]; meInitials: string;
} {
  const camApi = useRef<CameraApi | null>(null);
  const camera = useMemo(() => ({ apiRef: camApi, insets,
    focusInsets: (v: Viewport) => (v.W <= 760 ? { left: 0, top: 0, right: 0, bottom: v.H * 0.55 } : { left: 0, top: 0, right: 400, bottom: 0 }) }), [insets]);
  // The desks on duty for this viewer (Maya only where the audience rule allows), and your initials for the pin.
  const mapDesks = useMemo(() => (staffDesks ?? []).filter((d) => d.on_duty && (d.id !== 'maya' || mayaAllowedFor(audience)))
    .map((d) => ({ id: d.id, name: d.name, building: d.building })), [staffDesks, audience]);
  const meInitials = useMemo(() => readParticipant().initials, []);
  return { camApi, camera, mapDesks, meInitials };
}

export const GOING_MS = 900;

/**
 * The door reveal (the prototype's "going"): through the glowing back door, the room zooms in under "Opening...", then the existing
 * door transition opens the page. Only from inside a building with a room, and never with reduce motion.
 */
export function useDoorReveal(onEnterRoom: ((route: string, from: DOMRect | null) => void) | undefined, reduceMotion: boolean): {
  going: string | null; enter: (route: string, building: BuildingId, rect: DOMRect | null) => void;
} {
  const [going, setGoing] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);
  const enter = (route: string, building: BuildingId, rect: DOMRect | null) => {
    if (!onEnterRoom) return;
    if (reduceMotion || !ROOMS[building]) { onEnterRoom(route, rect); return; }
    setGoing(route);
    timer.current = window.setTimeout(() => { timer.current = null; setGoing(null); onEnterRoom(route, rect); }, GOING_MS);
  };
  return { going, enter };
}
