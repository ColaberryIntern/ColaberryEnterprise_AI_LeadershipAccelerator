import { useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { BuildingId, CampusAudience } from './campusMap';
import type { StaffDesk } from './campusPeopleApi';
import { mayaAllowedFor } from './campusPeople';
import { ROOMS } from './interior/roomModel';
import type { CameraApi, InsetsOf } from './useCampusCamera';
import { NO_INSETS } from './campusCamera';
import type { Cam, Viewport } from './campusCamera';
import type { MapDesk } from './art/StaffTokens';
import { readParticipant } from '../../pages/portal/today/shellUtils';

/**
 * C11b staging for CampusWorld, kept out of it so the component stays readable: the camera's framing, the desks and your initials
 * for the map, and the door reveal.
 */

export type Framed = { x: number; y: number; h: number } | null;

/** The arrival card's screen footprint: its rendered left edge when it is up, else the prototype's 400 px card plus gutter. */
export function cardRightInset(v: Viewport): number {
  const el = typeof document !== 'undefined' ? document.querySelector('.cm-world .cm-card') : null;
  const left = el?.getBoundingClientRect().left ?? 0;
  return left > 0 && left < v.W ? v.W - left + 16 : 416;
}

/**
 * The camera: the caller's panel insets for the whole campus, and for a framed building the same panels plus the arrival card
 * (WP-1: the side panel never hides, so the building sits between it and the card; on a phone the card is a sheet over 55%).
 * `camRef` lets the caller drive the camera (the home's gate fly-out); `framedRef` names the building a resize must keep framed.
 */
export function useMapStage(staffDesks: StaffDesk[] | undefined, audience: CampusAudience, insets: InsetsOf | undefined,
  opts: { camRef?: MutableRefObject<CameraApi | null>; framedRef: MutableRefObject<Framed>; startCam?: Cam }): {
  camApi: MutableRefObject<CameraApi | null>;
  camera: { apiRef: MutableRefObject<CameraApi | null>; insets?: InsetsOf; focusInsets: InsetsOf; framed: () => Framed; startCam?: Cam };
  mapDesks: MapDesk[]; meInitials: string;
} {
  const ownRef = useRef<CameraApi | null>(null);
  const camApi = opts.camRef ?? ownRef;
  const { framedRef, startCam } = opts;
  const camera = useMemo(() => ({ apiRef: camApi, insets, startCam, framed: () => framedRef.current,
    focusInsets: (v: Viewport) => {
      const i = typeof insets === 'function' ? insets(v) : insets ?? NO_INSETS;
      return v.W <= 760 ? { left: 0, top: i.top, right: 0, bottom: v.H * 0.55 } : { left: i.left, top: i.top, right: cardRightInset(v), bottom: 0 };
    } }), [camApi, insets, framedRef, startCam]);
  // The desks on duty for this viewer (Maya only where the audience rule allows), and your initials for the pin.
  const mapDesks = useMemo(() => (staffDesks ?? []).filter((d) => d.on_duty && (d.id !== 'maya' || mayaAllowedFor(audience)))
    .map((d) => ({ id: d.id, name: d.name, building: d.building })), [staffDesks, audience]);
  const meInitials = useMemo(() => readParticipant().initials, []);
  return { camApi, camera, mapDesks, meInitials };
}

/**
 * WP-1, the owner rule "the map recenters itself every time": when the last card closes (x, Back to the Quad, Step outside, Esc,
 * the end of the tour, a person card, the locker) the camera eases back to the whole campus; and on the caller's "back to the
 * campus" request (a new `recenter` number: the phone tab bar's Map, a return to the home) every card closes first. A walk that
 * starts as a card closes keeps its follow camera (recenter yields to it).
 */
export function useReturnRecenter(camApi: MutableRefObject<CameraApi | null>, anyCard: boolean, recenter: number | undefined, closeAll: () => void): void {
  const hadCard = useRef(anyCard);
  useEffect(() => { if (hadCard.current && !anyCard) camApi.current?.recenter(); hadCard.current = anyCard; }, [anyCard, camApi]);
  const last = useRef(recenter ?? 0);
  const close = useRef(closeAll);
  close.current = closeAll;
  useEffect(() => {
    if (recenter === undefined || recenter === last.current) return;
    last.current = recenter;
    close.current();
    camApi.current?.recenter();
  }, [recenter, camApi]);
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
