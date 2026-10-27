import { useCallback, useEffect, useRef, useState } from 'react';
import portalApi from '../utils/portalApi';
import { isTerminalDiscoveryError, type DiscoveryBroadcast } from './useBroadcastDiscovery';

/**
 * What this viewer can watch back (L8.3).
 *
 * IT DOES NOT POLL, AND THAT IS THE POINT OF A SEPARATE HOOK. `useBroadcastDiscovery` polls
 * because "what is airing" changes underneath a page that nobody touches — a class starts and
 * the badge has to notice. A list of finished classes does not: a replay becomes available
 * once, when a producer promotes it, and a student who opens this page is reading history. So
 * this fetches on mount and on an explicit refresh, which keeps the capacity table in
 * `docs/broadcast/ROLLOUT_RUNBOOK.md` true — that projection counts discovery requests per
 * tab per cadence, and a second poller would have silently doubled it.
 *
 * THE THREE FAILURES ARE NOT ALIKE, and the classification is IMPORTED rather than rewritten.
 * `isTerminalDiscoveryError` is the live hook's hard-won rule: a 404 means the feature is off
 * (the documented default, and reporting it as an outage once put a permanent fake error
 * panel on the login screen), a 401 means signed out (and retrying it drives `portalApi`'s
 * interceptor into the login-redirects-to-itself loop that `portalLoginHref.ts` records twice
 * in production). Both are terminal and render NOTHING. Only a 503 or a network failure is an
 * honest outage, and only that one is allowed to say so.
 *
 * `unavailable` IS NOT AN EMPTY LIST. "You have no recordings" and "we could not work out
 * what you can watch back" are different facts, and showing the second as the first tells a
 * student their class was never recorded. The server already refuses to conflate them — it
 * answers 503 rather than `[]` — and throwing that distinction away on the client would undo
 * the decision at the last step.
 */

/** A replay carries the live projection plus the one field a past class needs. */
export interface ReplayBroadcast extends DiscoveryBroadcast {
  /** Epoch ms when the class finished, or null. The list's sort key and its only date. */
  ended_at: number | null;
}

export interface ReplayResponse {
  states: string[];
  replays: ReplayBroadcast[];
}

export interface ReplayState {
  replays: ReplayBroadcast[];
  /** The feature is off, or nobody is signed in. Render nothing at all. */
  disabled: boolean;
  /** Reachable but unresolved. Distinct from an empty list on purpose. */
  unavailable: boolean;
  loading: boolean;
  refresh: () => void;
}

export interface ReplayDeps {
  fetchReplays?: () => Promise<ReplayResponse>;
}

async function defaultFetch(): Promise<ReplayResponse> {
  const res = await portalApi.get('/api/portal/broadcasts/replays');
  return res.data as ReplayResponse;
}

export function useReplayDiscovery(enabled: boolean, deps: ReplayDeps = {}): ReplayState {
  /**
   * Captured ONCE, and that is load-bearing rather than tidy.
   *
   * `useBroadcastDiscovery`'s header records what happens otherwise: its defaults were inline
   * arrows, so every render minted a new function, so the `useCallback` depending on them
   * changed identity every render, so the effect depending on IT re-ran every render — and
   * re-running it sets state, which renders again. An infinite loop, in the default path only,
   * which every test that injected deps missed.
   *
   * This hook has the mirror-image exposure: `defaultFetch` is already at module scope, so the
   * default path is safe, but a CALLER passing an inline `{ fetchReplays: () => … }` would hand
   * it a fresh identity on every render and get the same loop. Holding the injected object in a
   * ref makes that impossible from either side.
   */
  const injected = useRef(deps);
  const fetchReplays = injected.current.fetchReplays ?? defaultFetch;
  const [replays, setReplays] = useState<ReplayBroadcast[]>([]);
  const [disabled, setDisabled] = useState(!enabled);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(false);
  // A late answer from a fetch started before unmount must not set state. Checked rather than
  // assumed because this hook is mounted by a lazy route, where a fast back-navigation is
  // ordinary rather than exotic.
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  const load = useCallback(async () => {
    if (!enabled) { setDisabled(true); return; }
    setLoading(true);
    try {
      const body = await fetchReplays();
      if (!live.current) return;
      setReplays(Array.isArray(body?.replays) ? body.replays : []);
      setDisabled(false);
      setUnavailable(false);
    } catch (err) {
      if (!live.current) return;
      // Terminal: nothing to show and nothing to retry. Anything else is an honest outage.
      if (isTerminalDiscoveryError(err)) { setDisabled(true); setUnavailable(false); } else { setUnavailable(true); }
      setReplays([]);
    } finally {
      if (live.current) setLoading(false);
    }
  }, [enabled, fetchReplays]);

  useEffect(() => { void load(); }, [load]);

  return { replays, disabled, unavailable, loading, refresh: () => { void load(); } };
}

export default useReplayDiscovery;
