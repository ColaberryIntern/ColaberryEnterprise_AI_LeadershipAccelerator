/**
 * C116 (Ali, 2026-11-07): a lesson video collects its points by itself the moment the learner crosses the watch bar, instead
 * of waiting for a click on "Collect points".
 *
 * Production, 7 Nov: an Explorer watched 100% of the Week 0 program video and got no credit, because YouTube and Vimeo players
 * cannot fire `onEnded` the way a direct file does, so their cards only complete through the button, which that learner never
 * pressed. This collects with the same call the button makes.
 *
 * It fires only on a crossing seen in THIS drawer session: the verdict was below the bar and a heartbeat brought it over. A video
 * that is already met when the drawer opens is left to the (lit) button, so reopening a lesson to rewatch it never completes it
 * behind the learner's back. It fires at most once per open; if the collect fails, the button is still there.
 */
import { useEffect, useRef } from 'react';
import type { WatchVerdict } from './useWatchVerdict';

/** Pure: did this verdict change cross the bar? Only an explicit below-the-bar verdict followed by a met one counts. */
export function crossedWatchBar(prev: WatchVerdict | null, next: WatchVerdict | null): boolean {
  return !!prev && prev.required_pct != null && !prev.met && !!next && next.met;
}

export function useAutoCollectOnWatchMet(watch: WatchVerdict | null, enabled: boolean, collect: () => void | Promise<void>): void {
  const prevRef = useRef<WatchVerdict | null>(null);
  const firedRef = useRef(false);
  const collectRef = useRef(collect);
  collectRef.current = collect;
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = watch;
    if (watch == null) { firedRef.current = false; return; }   // a new card opened (useWatchVerdict resets to null)
    if (!enabled || firedRef.current || !crossedWatchBar(prev, watch)) return;
    firedRef.current = true;
    void collectRef.current();
  }, [watch, enabled]);
}
