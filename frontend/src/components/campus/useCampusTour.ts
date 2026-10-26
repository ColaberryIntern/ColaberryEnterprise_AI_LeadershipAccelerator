import { useCallback, useRef, useState } from 'react';
import { readParticipant } from '../../pages/portal/today/shellUtils';
import { VIEW_AS_TOKEN_KEY } from '../../utils/participantToken';

/**
 * The guided tour's state (WP-1, moved out of CampusContext in WP-2 so the provider stays readable): the stop on screen, and the
 * progress kept per account in localStorage (where an unfinished tour stopped, and whether it was taken).
 *
 *  - Leaving a tour before its end PAUSES it where it was (Resume picks it up there); finishing marks it taken.
 *  - `justToured` is true from the moment the tour is finished until the next one starts: the side panel's lead then says so (the
 *    prototype's finishTour lead).
 *  - C13 (round 3): a paused tour EXPIRES after 7 days (an old "Tour in progress" is noise, not a reminder) and can be dismissed
 *    with ×; leaving on the last stop counts as finished (the card, which knows the tour's length, reads it so).
 */
export interface TourProgress { paused: number | null; toured: boolean; pausedAt?: number }
export const PAUSE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const tourKey = (): string => `colaberry.campus.tour.${readParticipant().email || 'anon'}`;
/**
 * Where the progress lives. Staff "Viewing as" a learner (a read-only, tab-scoped session) keep it in sessionStorage: the tour they
 * click through in someone else's view must neither show up as that learner's progress in this browser later, nor show this browser's
 * earlier tours as the learner's (Ali, 2026-10-26: "Tour in progress, stop 5 of 8" while viewing a learner who had never had the campus).
 */
function tourStore(): Storage {
  return window.sessionStorage.getItem(VIEW_AS_TOKEN_KEY) ? window.sessionStorage : window.localStorage;
}
export function readTour(now: number = Date.now()): TourProgress {
  try {
    const v = JSON.parse(tourStore().getItem(tourKey()) || 'null');
    if (v && typeof v === 'object') {
      const pausedAt = typeof v.pausedAt === 'number' ? v.pausedAt : undefined;
      // A pause with no time (stored before C13) or older than a week has expired.
      const fresh = typeof v.paused === 'number' && pausedAt !== undefined && now - pausedAt < PAUSE_TTL_MS;
      return { paused: fresh ? v.paused : null, toured: v.toured === true, ...(fresh ? { pausedAt } : {}) };
    }
  } catch { /* nothing stored */ }
  return { paused: null, toured: false };
}
function writeTour(p: TourProgress): void { try { tourStore().setItem(tourKey(), JSON.stringify(p)); } catch { /* no storage */ } }

export interface CampusTourState {
  tourIndex: number | null;
  tourProgress: TourProgress;
  justToured: boolean;
  resumeTour: (from: number) => void;
  startTour: () => void;
  setTourIndex: (i: number) => void;
  /** Pause (End tour, Esc, leaving the map). */
  endTour: () => void;
  finishTour: () => void;
  /** Drop the tour from the screen without touching its progress (the locker opening over it). */
  clearTour: () => void;
  /** C13: × on a paused tour: forget where it stopped (the card goes back to the offer). */
  dismissTour: () => void;
}

/** `onBegin` runs when a tour starts or resumes (the caller closes other cards and opens the map). */
export function useCampusTour(onBegin: () => void): CampusTourState {
  const [tourProgress, setTourProgress] = useState<TourProgress>(() => readTour());
  const [tourIndex, setTourIndexState] = useState<number | null>(null);
  const [justToured, setJustToured] = useState(false);
  const save = useCallback((p: TourProgress) => { setTourProgress(p); writeTour(p); }, []);
  const at = useRef<number | null>(null);
  at.current = tourIndex;
  const begin = useRef(onBegin);
  begin.current = onBegin;

  const endTour = useCallback(() => {
    if (at.current !== null) save({ ...readTour(), paused: at.current, pausedAt: Date.now() });
    setTourIndexState(null);
  }, [save]);
  const resumeTour = useCallback((from: number) => { begin.current(); setJustToured(false); setTourIndexState(Math.max(0, from)); }, []);
  const startTour = useCallback(() => resumeTour(0), [resumeTour]);
  const setTourIndex = useCallback((i: number) => setTourIndexState(Math.max(0, i)), []);
  const finishTour = useCallback(() => { save({ paused: null, toured: true }); setTourIndexState(null); setJustToured(true); }, [save]);
  const clearTour = useCallback(() => setTourIndexState(null), []);
  const dismissTour = useCallback(() => { const p = readTour(); save({ paused: null, toured: p.toured }); }, [save]);
  return { tourIndex, tourProgress, justToured, resumeTour, startTour, setTourIndex, endTour, finishTour, clearTour, dismissTour };
}
