import { useCallback, useRef, useState } from 'react';
import { readParticipant } from '../../pages/portal/today/shellUtils';

/**
 * The guided tour's state (WP-1, moved out of CampusContext in WP-2 so the provider stays readable): the stop on screen, and the
 * progress kept per account in localStorage (where an unfinished tour stopped, and whether it was taken).
 *
 *  - Leaving a tour before its end PAUSES it where it was (Resume picks it up there); finishing marks it taken.
 *  - `justToured` is true from the moment the tour is finished until the next one starts: the side panel's lead then says so (the
 *    prototype's finishTour lead).
 */
export interface TourProgress { paused: number | null; toured: boolean }
export const tourKey = (): string => `colaberry.campus.tour.${readParticipant().email || 'anon'}`;
function readTour(): TourProgress {
  try {
    const v = JSON.parse(window.localStorage.getItem(tourKey()) || 'null');
    if (v && typeof v === 'object') return { paused: typeof v.paused === 'number' ? v.paused : null, toured: v.toured === true };
  } catch { /* nothing stored */ }
  return { paused: null, toured: false };
}
function writeTour(p: TourProgress): void { try { window.localStorage.setItem(tourKey(), JSON.stringify(p)); } catch { /* no storage */ } }

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
    if (at.current !== null) save({ ...readTour(), paused: at.current });
    setTourIndexState(null);
  }, [save]);
  const resumeTour = useCallback((from: number) => { begin.current(); setJustToured(false); setTourIndexState(Math.max(0, from)); }, []);
  const startTour = useCallback(() => resumeTour(0), [resumeTour]);
  const setTourIndex = useCallback((i: number) => setTourIndexState(Math.max(0, i)), []);
  const finishTour = useCallback(() => { save({ paused: null, toured: true }); setTourIndexState(null); setJustToured(true); }, [save]);
  const clearTour = useCallback(() => setTourIndexState(null), []);
  return { tourIndex, tourProgress, justToured, resumeTour, startTour, setTourIndex, endTour, finishTour, clearTour };
}
