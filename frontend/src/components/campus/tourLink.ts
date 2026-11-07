import { useEffect, useState } from 'react';

/**
 * C123: Maya's "take the campus tour" deep link. Her portal DM reply carries `[Take the campus tour](TOUR_PATH)` (the
 * backend's maya/mayaPortalTools.ts TOUR_PATH, pinned equal by a test). In the chat dock it starts the tour in place when the
 * campus home is mounted (it registers as the host), else it navigates to the campus, which starts the tour from the URL.
 * Either way the tour waits until the learner is past the daily gate, and staff (who have no tour) are left where they are.
 */
export const TOUR_PATH = '/portal/campus?tour=start';
export const TOUR_PARAM = 'tour';
export const TOUR_EVENT = 'cm-start-tour';

let tourHosts = 0;
/** The campus home registers here so the chat dock knows it can start the tour in place. */
export function registerTourHost(): () => void {
  tourHosts += 1;
  let done = false;
  return () => { if (!done) { done = true; tourHosts -= 1; } };
}
export function hasTourHost(): boolean { return tourHosts > 0; }

export function requestTour(): void {
  try { window.dispatchEvent(new Event(TOUR_EVENT)); } catch { /* non-DOM environment */ }
}
export function onTourRequest(cb: () => void): () => void {
  window.addEventListener(TOUR_EVENT, cb);
  return () => window.removeEventListener(TOUR_EVENT, cb);
}

/** True once if the page was opened with `?tour=start`; the parameter is then removed so a reload does not restart it. */
export function takeTourParam(): boolean {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get(TOUR_PARAM) !== 'start') return false;
    url.searchParams.delete(TOUR_PARAM);
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    return true;
  } catch {
    return false;
  }
}

/**
 * The campus home's side of the link: registers as the host, takes `?tour=start` once, listens for a request from the chat
 * dock, and starts the tour when `ready` (past the daily gate). `hasTour` is false for staff, whose campus has no tour: the
 * request is dropped rather than starting an empty one.
 */
export function useTourLinkHost(ready: boolean, hasTour: boolean, start: () => void): void {
  const [asked, setAsked] = useState(() => takeTourParam());
  useEffect(() => {
    const unregister = registerTourHost();
    const off = onTourRequest(() => setAsked(true));
    return () => { off(); unregister(); };
  }, []);
  useEffect(() => {
    if (!asked || !ready) return;
    setAsked(false);
    if (hasTour) start();
  }, [asked, ready, hasTour, start]);
}
