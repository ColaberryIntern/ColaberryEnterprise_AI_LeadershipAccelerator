import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchCampusFlags } from './campusApi';
import type { CampusPresence, CampusPerson } from './campusApi';
import { useCampusPresencePoll } from './useCampusPresencePoll';
import { useStaffDesks } from './useStaffDesks';
import { useCampusPlan } from './useCampusPlan';
import { useCampusLook } from './useCampusLook';
import { useCampusTour } from './useCampusTour';
import type { TourProgress } from './useCampusTour';
import type { CompleteResult } from './campusPlanApi';
import type { CampusLook } from './campusApi';
import type { PlanStop } from './campusPlan';
import { useCampusDmToasts, DmToast, ToastHold } from './useCampusDmToasts';
import type { StaffDesk } from './campusPeopleApi';
import { useParticipantAuth } from '../../contexts/ParticipantAuthContext';
import type { BuildingId } from './campusMap';
import { CampusSettings, CampusSettingsView, readCampusSettings, writeCampusSettings } from './campusSettings';
import { useEffectiveReduceMotion } from './useEffectiveReduceMotion';
import './campusTokens.css'; // C11: contrast tokens on :root; the provider wraps every portal route, so every campus surface has them

/**
 * CampusContext - the one place campus state lives (Basecamp C1).
 *
 * It is designed to sit BESIDE <Outlet/> in routes/portalRoutes.tsx (mounted in
 * C3), like LiveMiniPlayer, because ~18 pages render their own PortalShell and
 * remount it on every navigation. Nothing persistent can live inside the shell.
 *
 * THE PROVIDER RENDERS ONLY ITS CHILDREN. No wrapper element, no portal, no
 * effect on layout. With the campus off, wrapping the portal in this provider
 * changes nothing a learner can see - __tests__/campusNoChange.test.tsx proves
 * the HTML is byte-identical.
 *
 * The flag is fetched once per mount and fails closed (see campusApi.ts).
 * `active` is the only value later phases should branch on: the server says the
 * campus is available AND the learner has not chosen classic nav.
 */

export interface CampusState {
  /** Server answer for this participant; false until it arrives. */
  enabled: boolean;
  /** True once the flag request has settled (either way). */
  ready: boolean;
  /** Stored choices plus `reduceMotion`, the effective value (choice, else the live device preference). */
  settings: CampusSettingsView;
  /** enabled && settings.nav === 'campus'. */
  active: boolean;
  updateSettings: (patch: Partial<CampusSettings>) => void;
  /** Which full-screen campus layer is open (C2): the walkable map, the list view, or none. */
  layer: CampusLayer;
  /** Building the map should walk to when it opens, if any. */
  mapFocus: BuildingId | null;
  /** WP-1: how the campus home takes mapFocus: walk there, or stand inside it at once (Step outside from a page). */
  mapHow: MapHow;
  /** WP-1: every map request lands on the campus home (/portal/campus), which acknowledges it with ackMap. */
  openMap: (focus?: BuildingId, how?: MapHow) => void;
  ackMap: () => void;
  /** WP-1: the building you are at (kept for the browser session, so a page visit does not send you back to the gate). */
  here: BuildingId | null;
  setHere: (id: BuildingId | null) => void;
  /** WP-1: the tour's progress for this account (localStorage): where an unfinished tour stopped, and whether it was finished. */
  tourProgress: TourProgress;
  /** Starts the tour at stop `from` (Resume passes the paused stop). */
  resumeTour: (from: number) => void;
  /** The last stop is done: the tour counts as taken. */
  finishTour: () => void;
  openList: () => void;
  closeLayer: () => void;
  /** C4: who is in each building (null until the first read), and whether the last read failed. */
  presence: CampusPresence | null;
  presenceError: boolean;
  /** C3: a door transition in progress (CampusDoorTransition plays it), or null. */
  door: DoorState | null;
  /** Zoom through a building's door into a real page (instant with reduce motion). */
  enterThroughDoor: (route: string, from: DoorRect | null) => void;
  /** Step back outside: open the map at this building, zooming out to its door (instant with reduce motion). */
  stepOutside: (buildingId: BuildingId | null) => void;
  clearDoor: () => void;
  /** C5: the AI staff desks this viewer may see (empty until read, or when the read failed). */
  staffDesks: StaffDesk[];
  staffDesksError: boolean;
  /** C5: the person card open on the map (from a token or a Who's here chip), or null. */
  personCard: PersonCardTarget | null;
  openPersonCard: (t: PersonCardTarget) => void;
  closePersonCard: () => void;
  /** C5: the current "new message" toast (polled here, so it survives navigation), and its dismiss. */
  dmToast: DmToast | null;
  dismissDmToast: () => void;
  /** C11: pause / resume the toast's auto-hide while it has focus or the pointer. */
  holdDmToast: (why: ToastHold) => void;
  releaseDmToast: (why: ToastHold) => void;
  /** C8: today's plan as campus stops (null when the plan is off, failed, or the campus is off). */
  planStops: PlanStop[] | null;
  /** WP-2: the plan's own total minutes, and marking a step done (Today's collect path; the step stays, ticked). */
  planMinutes: number | null;
  completePlanStop: (stop: PlanStop) => Promise<CompleteResult>;
  /** WP-2: the tour was just finished (the side panel's lead says so until the next tour). */
  justToured: boolean;
  /** C7: the guided tour's position (null = no tour; stops.length = the end card). Starting opens the map; closing the map ends it. */
  tourIndex: number | null;
  startTour: () => void;
  setTourIndex: (i: number) => void;
  endTour: () => void;
  /** C9: my look (read once while active), whether the locker is open, and saving the complete set. */
  look: CampusLook | null;
  lookError: boolean;
  saveLook: (equipped: Record<string, string | null>) => Promise<CampusLook>;
  lockerOpen: boolean;
  openLocker: () => void;
  closeLocker: () => void;
}

export interface PersonCardTarget { person: CampusPerson; buildingId: BuildingId }

export type CampusLayer = 'none' | 'map' | 'list';
export type MapHow = 'walk' | 'inside';
export type { TourProgress } from './useCampusTour';
export { tourKey } from './useCampusTour';
export const HERE_KEY = 'colaberry.campus.here';
function readHere(): BuildingId | null { try { return (window.sessionStorage.getItem(HERE_KEY) as BuildingId | null) || null; } catch { return null; } }
export interface DoorRect { left: number; top: number; width: number; height: number }
export type DoorState =
  | { phase: 'in'; route: string; from: DoorRect | null; id: number }
  | { phase: 'out'; buildingId: BuildingId | null; id: number };

const noop = () => { /* no provider */ };
const OFF: CampusState = {
  enabled: false, ready: false, active: false,
  settings: { nav: 'campus', workplaceNames: false, motion: 'device', reduceMotion: false },
  updateSettings: noop, layer: 'none', mapFocus: null, mapHow: 'walk', openMap: noop, ackMap: noop, here: null, setHere: noop,
  tourProgress: { paused: null, toured: false }, resumeTour: noop, finishTour: noop, openList: noop, closeLayer: noop,
  presence: null, presenceError: false, door: null, enterThroughDoor: noop, stepOutside: noop, clearDoor: noop,
  staffDesks: [], staffDesksError: false, personCard: null, openPersonCard: noop, closePersonCard: noop,
  dmToast: null, dismissDmToast: noop, holdDmToast: noop, releaseDmToast: noop, planStops: null, planMinutes: null,
  completePlanStop: () => Promise.resolve({ ok: false, reason: 'failed', message: 'The campus is off' }), justToured: false, tourIndex: null, startTour: noop, setTourIndex: noop, endTour: noop,
  look: null, lookError: false, saveLook: () => Promise.reject(new Error('The campus is off')), lockerOpen: false, openLocker: noop, closeLocker: noop,
};

const Ctx = createContext<CampusState>(OFF);

export function CampusProvider({ children }: { children?: React.ReactNode }): React.ReactElement {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [stored, setStored] = useState<CampusSettings>(() => readCampusSettings());

  // Signed out (login, signup, verify, handoff, class-checkin all share this layout): no request at
  // all, campus off. Re-runs when sign-in state changes, so signing in without a reload still reads
  // the flag, and signing out turns the campus off.
  const { isAuthenticated } = useParticipantAuth();
  useEffect(() => {
    if (!isAuthenticated) { setEnabled(false); setReady(true); return undefined; }
    let alive = true;
    fetchCampusFlags().then((f) => { if (alive) { setEnabled(f.campus); setReady(true); } });
    return () => { alive = false; };
  }, [isAuthenticated]);

  const updateSettings = useCallback((patch: Partial<CampusSettings>) => {
    setStored((prev) => { const next = { ...prev, ...patch }; writeCampusSettings(next); return next; });
  }, []);

  const [layer, setLayer] = useState<CampusLayer>('none');
  const [personCard, setPersonCard] = useState<PersonCardTarget | null>(null); // C5; closing the map closes it too
  const [mapFocus, setMapFocus] = useState<BuildingId | null>(null);
  const [mapHow, setMapHow] = useState<MapHow>('walk');
  const openMap = useCallback((focus?: BuildingId, how: MapHow = 'walk') => { setMapFocus(focus ?? null); setMapHow(how); setLayer('map'); }, []);
  const ackMap = useCallback(() => { setLayer((l) => (l === 'map' ? 'none' : l)); setMapFocus(null); }, []);
  const openList = useCallback(() => setLayer('list'), []);
  const [here, setHereState] = useState<BuildingId | null>(() => readHere());
  const setHere = useCallback((id: BuildingId | null) => {
    setHereState(id);
    try { if (id) window.sessionStorage.setItem(HERE_KEY, id); else window.sessionStorage.removeItem(HERE_KEY); } catch { /* no storage */ }
  }, []);
  const [lockerOpen, setLockerOpen] = useState(false);
  const { tourIndex, tourProgress, justToured, resumeTour, startTour, setTourIndex, endTour, finishTour, clearTour } = useCampusTour(
    useCallback(() => { setPersonCard(null); setMapFocus(null); setLockerOpen(false); setLayer('map'); }, []));
  const closeLayer = useCallback(() => { setLayer('none'); setMapFocus(null); setPersonCard(null); endTour(); setLockerOpen(false); }, [endTour]);
  const openLocker = useCallback(() => { setPersonCard(null); clearTour(); setLockerOpen(true); setLayer('map'); }, [clearTour]);
  const closeLocker = useCallback(() => setLockerOpen(false), []);

  const active = enabled && stored.nav === 'campus';
  const reduceMotion = useEffectiveReduceMotion(stored.motion, active);
  const settings = useMemo<CampusSettingsView>(() => ({ ...stored, reduceMotion }), [stored, reduceMotion]);
  const { presence, presenceError } = useCampusPresencePoll(active);

  // C3 door transitions. The context only records the request; CampusDoorTransition (inside the router)
  // plays it and performs the navigation, so this provider never needs router context.
  const [door, setDoor] = useState<DoorState | null>(null);
  const doorSeq = React.useRef(0);
  const enterThroughDoor = useCallback((route: string, from: DoorRect | null) => {
    doorSeq.current += 1; setDoor({ phase: 'in', route, from, id: doorSeq.current });
  }, []);
  const stepOutside = useCallback((buildingId: BuildingId | null) => {
    doorSeq.current += 1; setDoor({ phase: 'out', buildingId, id: doorSeq.current });
  }, []);
  const clearDoor = useCallback(() => setDoor(null), []);

  // C5: AI staff desks (read once while active) and the open person card.
  const { staffDesks, staffDesksError } = useStaffDesks(active);
  const { toast: dmToast, dismiss: dismissDmToast, hold: holdDmToast, release: releaseDmToast } = useCampusDmToasts(active);
  const { look, lookError, saveLook, reloadLook } = useCampusLook(active);
  const { stops: planStops, minutes: planMinutes, complete: completePlanStop } = useCampusPlan(active, layer === 'map', reloadLook);
  const openPersonCard = useCallback((t: PersonCardTarget) => setPersonCard(t), []);
  const closePersonCard = useCallback(() => setPersonCard(null), []);

  const value = useMemo<CampusState>(
    () => ({ enabled, ready, settings, active, updateSettings, layer, mapFocus, mapHow, openMap, ackMap, here, setHere, tourProgress, resumeTour, finishTour, openList, closeLayer, presence, presenceError,
      door, enterThroughDoor, stepOutside, clearDoor, staffDesks, staffDesksError, personCard, openPersonCard, closePersonCard, dmToast, dismissDmToast, holdDmToast, releaseDmToast, planStops, planMinutes, completePlanStop, justToured, tourIndex, startTour, setTourIndex, endTour, look, lookError, saveLook, lockerOpen, openLocker, closeLocker }),
    [enabled, ready, settings, active, updateSettings, layer, mapFocus, mapHow, openMap, ackMap, here, setHere, tourProgress, resumeTour, finishTour, openList, closeLayer, presence, presenceError,
      door, enterThroughDoor, stepOutside, clearDoor, staffDesks, staffDesksError, personCard, openPersonCard, closePersonCard, dmToast, dismissDmToast, holdDmToast, releaseDmToast, planStops, planMinutes, completePlanStop, justToured, tourIndex, startTour, setTourIndex, endTour, look, lookError, saveLook, lockerOpen, openLocker, closeLocker],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Campus state; outside a provider it reads as off, so any component can call it safely. */
export function useCampus(): CampusState {
  return useContext(Ctx);
}
