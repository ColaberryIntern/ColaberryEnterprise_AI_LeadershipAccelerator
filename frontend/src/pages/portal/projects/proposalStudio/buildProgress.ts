import { useCallback, useEffect, useRef, useState } from 'react';
import type { StudentGovProjectView } from '../../../../services/govProjectPortalApi';

/**
 * buildProgress - live feedback for the async build pipeline. "Build all documents" and per-document "Build it" are
 * fire-and-forget on the backend: they create a review-run row and return immediately, then draft/judge/revise in the
 * background. The UI used to re-pull the projection exactly once, so a build looked like nothing happened until a
 * manual refresh. This poller re-pulls the whole cockpit projection on a short interval while any document is building
 * (or was just kicked), so the rows, readiness and agent feed advance on their own, and stops when nothing is running.
 */

export const BUILD_POLL_MS = 3500;
/** Keep polling this long after a build is requested even before the first run row shows `running`, so a click that
 *  is slow to register still shows motion instead of sitting there. */
export const BUILD_KICK_GRACE_MS = 30000;

/** How many documents are mid-build right now (their review cycle is running). */
export function runningDocCount(view: StudentGovProjectView): number {
  return (view.proposalDocuments ?? []).filter((d) => d.cycle?.status === 'running').length;
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
  /** Increments on every poll; panels that fetch their own data (the agent feed) refetch when it changes. */
  buildPulse: number;
}

export function useBuildProgress(view: StudentGovProjectView, onReload: () => void): BuildProgress {
  const runningCount = runningDocCount(view);
  const anyBuildRunning = runningCount > 0;
  const [kickedAt, setKickedAt] = useState(0);
  const [buildPulse, setBuildPulse] = useState(0);
  const runningRef = useRef(anyBuildRunning);
  runningRef.current = anyBuildRunning;
  const onReloadRef = useRef(onReload);
  onReloadRef.current = onReload;

  const notifyBuildKicked = useCallback(() => setKickedAt(Date.now()), []);

  // Start (or keep) the poll alive whenever a build is running - including when the page loads mid-build with no click.
  useEffect(() => { if (anyBuildRunning) setKickedAt(Date.now()); }, [anyBuildRunning]);

  useEffect(() => {
    if (!kickedAt) return undefined;
    const start = Date.now();
    const id = window.setInterval(() => {
      onReloadRef.current();
      setBuildPulse((p) => p + 1);
      if (!shouldKeepPolling(runningRef.current, start, Date.now())) window.clearInterval(id);
    }, BUILD_POLL_MS);
    return () => window.clearInterval(id);
  }, [kickedAt]);

  return { anyBuildRunning, runningCount, notifyBuildKicked, buildPulse };
}
