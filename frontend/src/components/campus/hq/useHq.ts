import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CampusAudience } from '../campusMap';
import { useCampusMgmt } from '../campusMgmt';
import { isTypingTarget } from '../campusEsc';
import { buildHq, lockedFloorToast, rideOrder, type Hq, type HqFloor, type HqRoom } from './hqModel';
import { takeHqIntent } from './hqIntent';

/**
 * Campus HQ state (H5): which scene you are in (outside, lobby, elevator, a floor), where the cab is, the hovered button, and
 * the toast. One instance per open HQ building, shared by the scene in the frame and the arrival panel beside it, so the two
 * always agree. Riding: the doors close, the indicator counts through the floors, the doors open on the floor, all under
 * 1.5 s; with reduce motion every step is instant. Esc steps back floor -> elevator -> lobby -> outside, and only from
 * outside does it fall through to the campus (which closes the building).
 */
export type HqScene = 'ext' | 'lobby' | 'cab' | 'floor';
export interface HqState {
  hq: Hq;
  scene: HqScene;
  floor: string | null;
  cabAt: string;
  hover: string | null;
  moving: boolean;
  doorsShut: boolean;
  toast: string | null;
  walkIn: () => void;
  toLobby: () => void;
  toCab: () => void;
  ride: (num: string) => void;
  locked: (f: HqFloor) => void;
  lockedRoom: (r: HqRoom) => void;
  setHover: (num: string | null) => void;
  floorOf: (num: string | null) => HqFloor | null;
}

const TOAST_MS = 3200;
const DOORS_MS = 600;
const SETTLE_MS = 300;
/** The whole ride (doors + counting + settle) fits in 1.5 s, however many floors it crosses. */
export const RIDE_BUDGET_MS = 1500;

/** `active` = the HQ building is the one open: only then does Esc belong to it, and leaving resets it to the outside. */
export function useHq(audience: CampusAudience, reduceMotion: boolean, active = true, careerName?: string): HqState {
  const mgmt = useCampusMgmt();
  const isStaff = audience === 'staff';
  const sectionsKey = mgmt.sections.join(',');
  // rebuilt when the sections change (keyed on their joined list), not on every render
  const hq = useMemo(() => buildHq((s) => mgmt.sections.includes(s), isStaff, audience, undefined, careerName), [sectionsKey, isStaff, audience, careerName]);
  const [scene, setScene] = useState<HqScene>('ext');
  const [floor, setFloor] = useState<string | null>(null);
  const [cabAt, setCabAt] = useState('G');
  const [hover, setHover] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [doorsShut, setDoorsShut] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, reduceMotion ? 0 : ms)); };
  useEffect(() => () => { timers.current.forEach((t) => window.clearTimeout(t)); }, []);

  const say = useCallback((msg: string) => {
    setToast(msg);
    timers.current.push(window.setTimeout(() => setToast((t) => (t === msg ? null : t)), TOAST_MS));
  }, []);
  const floorOf = useCallback((num: string | null) => hq.floors.find((f) => f.num === num) ?? null, [hq]);

  const ride = useCallback((num: string) => {
    if (moving) return;
    const target = num === 'G' ? null : floorOf(num);
    if (target && target.access === 'none') { say(lockedFloorToast(target, isStaff)); return; }
    setScene('cab');
    const order = rideOrder(hq);
    const from = Math.max(0, order.indexOf(cabAt));
    const to = order.indexOf(num);
    if (to < 0) return;
    setMoving(true);
    setDoorsShut(true);
    const steps = Math.abs(to - from);
    const stepMs = steps ? Math.max(40, Math.floor((RIDE_BUDGET_MS - DOORS_MS - SETTLE_MS) / steps)) : 0;
    const arrive = () => { setMoving(false); setDoorsShut(false); setHover(null); setFloor(num); setScene(num === 'G' ? 'lobby' : 'floor'); };
    if (reduceMotion) { setCabAt(num); arrive(); return; }
    let cur = from;
    const step = () => {
      if (cur === to) { later(arrive, SETTLE_MS); return; }
      cur += to > cur ? 1 : -1;
      setCabAt(order[cur]);
      later(step, stepMs);
    };
    later(step, DOORS_MS);
  }, [moving, floorOf, say, isStaff, hq, cabAt, reduceMotion]);

  const back = useCallback((): boolean => {
    if (moving) return true;
    if (scene === 'floor') { setScene('cab'); return true; }
    if (scene === 'cab') { setCabAt('G'); setScene('lobby'); return true; }
    if (scene === 'lobby') { setScene('ext'); return true; }
    return false;
  }, [scene, moving]);

  // A Where-to pick (hqIntent) rides to its floor as the HQ opens.
  const rideRef = useRef(ride);
  rideRef.current = ride;
  useEffect(() => {
    if (!active) return;
    const f = takeHqIntent();
    if (f) rideRef.current(f);
  }, [active]);

  useEffect(() => {
    if (active) return;
    setScene('ext'); setFloor(null); setCabAt('G'); setHover(null); setMoving(false); setDoorsShut(false);
  }, [active]);

  // Esc steps back inside the HQ before the campus may use it to close the building (capture, so it runs first).
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || isTypingTarget(document.activeElement)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      if (back()) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [back, active]);

  return {
    hq, scene, floor, cabAt, hover, moving, doorsShut, toast, floorOf, setHover,
    walkIn: () => setScene('lobby'),
    toLobby: () => { if (!moving) { setCabAt('G'); setScene('lobby'); } },
    toCab: () => { if (!moving) setScene('cab'); },
    ride,
    locked: (f) => say(lockedFloorToast(f, isStaff)),
    lockedRoom: (r) => say(`${r.label} is on this floor, but your badge doesn’t open it.`),
  };
}
