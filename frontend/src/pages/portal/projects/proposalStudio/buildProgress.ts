import { useCallback, useEffect, useRef, useState } from 'react';
import type { StudentGovProjectView } from '../../../../services/govProjectPortalApi';

/**
 * buildProgress - live feedback for the async build pipeline. "Build all documents" and per-document "Build it" are
 * fire-and-forget on the backend: they create a review-run row and return immediately, then draft/judge/revise in the
 * background.
 *
 * The UI learns of progress by polling. The first version re-pulled the WHOLE cockpit projection on every tick, which
 * made the whole screen visibly refresh every few seconds whether or not anything had changed - irritating. This
 * version is CHANGE-DRIVEN: on each tick it reads a tiny progress signature (the latest activity event) and only
 * re-pulls the projection - the only thing that re-renders the screen - when that signature actually changes (the
 * agent started a document, created a Need, or finished one). Between real events the screen holds completely still.
 * Polling still self-stops once nothing is running (and the kick grace has elapsed).
 */

export const BUILD_POLL_MS = 3500;
/** Keep polling this long after a build is requested even before the first run row shows `running`, so a click that
 *  is slow to register still shows motion instead of sitting there. */
export const BUILD_KICK_GRACE_MS = 30000;

/** How many documents are mid-build right now (their review cycle is running). */
export function runningDocCount(view: StudentGovProjectView): number {
  return (view.proposalDocuments ?? []).filter((d) => d.cycle?.status === 'running').length;
}

/** The documents "Build all" targets: everything except the sealed price sheet and superseded rows. */
export function buildableDocs(view: StudentGovProjectView) {
  return (view.proposalDocuments ?? []).filter((d) => d.key !== 'pricing' && !d.superseded);
}

/** How many buildable documents have been built (a draft version exists and it is not mid-build right now). Drives the
 *  build-progress meter, which moves as each document completes - unlike readiness, which only moves when one PASSES. */
export function builtDocCount(view: StudentGovProjectView): number {
  return buildableDocs(view).filter((d) => !!d.latest && d.cycle?.status !== 'running').length;
}

/** PURE: keep polling while a build is running, or within the grace window after a build was kicked. */
export function shouldKeepPolling(anyRunning: boolean, kickedAt: number, now: number, graceMs = BUILD_KICK_GRACE_MS): boolean {
  if (anyRunning) return true;
  return kickedAt > 0 && now - kickedAt < graceMs;
}

export interface BuildProgress {
  anyBuildRunning: boolean;
  runningCount: number;
  /** Called by the Build buttons the instant a build is requested, so polling starts before the first run row exists. */
  notifyBuildKicked: () => void;
  /** Increments only when the build actually advances; panels that fetch their own data (the agent feed) refetch then. */
  buildPulse: number;
}

/**
 * @param view         the current projection (gives the running-doc count + bar).
 * @param onReload     re-pull the whole projection (re-renders the screen). Called ONLY on a detected change.
 * @param fetchSignature a cheap read returning a progress signature (e.g. the latest activity event). When it returns
 *   the same value as last tick, nothing re-renders. Returning null means "unknown this tick" (a failed read never
 *   forces a refresh). Omit it to fall back to the old reload-every-tick behaviour.
 */
export function useBuildProgress(
  view: StudentGovProjectView,
  onReload: () => void,
  fetchSignature?: () => Promise<string | null>,
): BuildProgress {
  const runningCount = runningDocCount(view);
  const anyBuildRunning = runningCount > 0;
  const [kickedAt, setKickedAt] = useState(0);
  const [buildPulse, setBuildPulse] = useState(0);
  const runningRef = useRef(anyBuildRunning);
  runningRef.current = anyBuildRunning;
  const onReloadRef = useRef(onReload);
  onReloadRef.current = onReload;
  const fetchSigRef = useRef(fetchSignature);
  fetchSigRef.current = fetchSignature;
  const lastSigRef = useRef<string | null>(null);

  const notifyBuildKicked = useCallback(() => setKickedAt(Date.now()), []);

  // Start (or keep) the poll alive whenever a build is running - including when the page loads mid-build with no click.
  useEffect(() => { if (anyBuildRunning) setKickedAt(Date.now()); }, [anyBuildRunning]);

  useEffect(() => {
    if (!kickedAt) return undefined;
    const start = Date.now();
    let cancelled = false;
    let id = 0;
    const tick = async () => {
      const fn = fetchSigRef.current;
      if (fn) {
        let sig: string | null = null;
        try { sig = await fn(); } catch { sig = null; }
        if (cancelled) return;
        // Re-render only when the agent has actually moved. Unchanged signal => the screen holds still.
        if (sig !== null && sig !== lastSigRef.current) {
          lastSigRef.current = sig;
          onReloadRef.current();
          setBuildPulse((p) => p + 1);
        }
      } else {
        onReloadRef.current();
        setBuildPulse((p) => p + 1);
      }
      if (!shouldKeepPolling(runningRef.current, start, Date.now())) window.clearInterval(id);
    };
    id = window.setInterval(tick, BUILD_POLL_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [kickedAt]);

  return { anyBuildRunning, runningCount, notifyBuildKicked, buildPulse };
}
