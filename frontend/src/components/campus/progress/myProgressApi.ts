import { useEffect, useState } from 'react';
import portalApi from '../../../utils/portalApi';

/**
 * C120: the My Progress room's celebration of the signed-in learner, read from GET /api/portal/campus/my-progress (the server
 * takes the enrollment from the token; this client sends nothing). The shape mirrors the backend's strict MyProgressResponse.
 *
 * One shared read for the room's screen and the arrival panel's "Tell us your story" card, so an upload in the panel refreshes
 * the screen too (refreshMyProgress). A failed read is remembered as `error`, never as invented zeros; the next open retries.
 */
export interface MyProgress {
  firstName: string | null;
  week: { current: number; total: number; cohortName: string | null; cardsDoneThisWeek: number; cardsThisWeek: number } | null;
  points: { total: number; level: number | null; levelName: string | null; builder: number; learning: number; community: number };
  latestWin: { title: string; date: string } | null;
  milestones: { earned: Array<{ key: string; label: string; date: string | null }>; next: { key: string; label: string; detail: string } | null };
  background: { title: string | null; company: string | null; industry: string | null; years: string | null; skills: string[]; education: string | null } | null;
  goal: string | null;
  hasResume: boolean;
}
export const MY_PROGRESS_PATH = '/api/portal/campus/my-progress';
export const MY_PROGRESS_TIMEOUT_MS = 10_000;

/** The minimum the screen relies on; anything else malformed is a failed read (the screen then shows its plain sign). */
export function asMyProgress(d: unknown): MyProgress {
  const x = d && typeof d === 'object' ? (d as Partial<MyProgress>) : {};
  if (!x.points || typeof x.points.total !== 'number' || !x.milestones || !Array.isArray(x.milestones.earned) || typeof x.hasResume !== 'boolean') {
    throw new Error('Malformed my-progress answer');
  }
  return x as MyProgress;
}

export async function fetchMyProgress(): Promise<MyProgress> {
  const { data } = await portalApi.get<unknown>(MY_PROGRESS_PATH, { timeout: MY_PROGRESS_TIMEOUT_MS });
  return asMyProgress(data);
}

export interface MyProgressState { data: MyProgress | null; error: boolean; loading: boolean }
let state: MyProgressState = { data: null, error: false, loading: false };
let inflight: Promise<void> | null = null;
const listeners = new Set<(s: MyProgressState) => void>();
const emit = (s: MyProgressState) => { state = s; listeners.forEach((l) => l(s)); };

/** Read (or re-read) the celebration; concurrent callers share one request. */
export function refreshMyProgress(): Promise<void> {
  if (inflight) return inflight;
  emit({ ...state, loading: true });
  inflight = fetchMyProgress()
    .then((data) => emit({ data, error: false, loading: false }), () => emit({ data: state.data, error: true, loading: false }))
    .finally(() => { inflight = null; });
  return inflight;
}
/** Tests: forget everything. */
export function resetMyProgress(): void { state = { data: null, error: false, loading: false }; inflight = null; listeners.clear(); }

/** The shared state, read while `enabled` (the room is open); fetched once per open. */
export function useMyProgress(enabled: boolean): MyProgressState {
  const [s, setS] = useState<MyProgressState>(state);
  useEffect(() => {
    if (!enabled) return undefined;
    listeners.add(setS);
    void refreshMyProgress();
    return () => { listeners.delete(setS); };
  }, [enabled]);
  return enabled ? s : { data: null, error: false, loading: false };
}
