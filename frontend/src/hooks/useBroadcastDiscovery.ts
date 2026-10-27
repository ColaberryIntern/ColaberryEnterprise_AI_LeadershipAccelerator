import { useCallback, useEffect, useRef, useState } from 'react';
import portalApi from '../utils/portalApi';

/**
 * Polls "what is airing" at the cadence the SERVER chooses.
 *
 * WHY POLLING AT ALL — the P3-09 decision, recorded in `rollout-runbook.md`. The only realtime
 * transport in this app is `useRealtimeAwareness`, an `EventSource` for the ADMIN stream that
 * authenticates with cookies. `EventSource` cannot send an Authorization header, and the
 * portal authenticates with a Bearer JWT, so SSE here would mean putting the token in a query
 * string — where it lands in access logs — or minting a cookie session for the portal. Both
 * are worse than a 45-second poll of a payload measured in hundreds of bytes.
 *
 * THREE THINGS KEEP THIS FROM BECOMING A LOAD PROBLEM, and each is asserted by a test:
 *
 *  - The interval comes from `poll_after_ms` in the response, so an operator can slow every
 *    client with an env change instead of a frontend deploy. It is still clamped CLIENT-side,
 *    because a compromised or stale server answer must not be able to drive a one-second loop.
 *  - A hidden tab does not poll. This is the largest saving available: most open portal tabs
 *    are in a background window, and a badge nobody can see does not need refreshing. It
 *    refreshes once on becoming visible again, so the first thing a returning viewer sees is
 *    current.
 *  - A failing endpoint backs off, capped, and never spins. A 503 from discovery means the
 *    server could not work out what is airing; hammering it is the wrong response.
 *
 * NOT EVERY FAILURE IS AN OUTAGE, and the first version of this hook treated them alike.
 * That was caught by an independent check, and it was the worst defect of Phase 3:
 *
 *   404 — the feature is off. `broadcastRoutes` gates on BROADCAST_ENABLED before auth and
 *         answers a clean 404, which is the documented default. Reported as "unavailable",
 *         that rendered a permanent fake outage panel on every portal page the moment the
 *         frontend deployed. A disabled feature must render NOTHING and stop polling.
 *   401 — not signed in. `portalApi`'s interceptor reacts to a 401 by clearing the token and
 *         setting `window.location.href = loginHrefPreserving(pathname)`, and on
 *         `/portal/login` that function returns `/portal/login` — the page redirects to
 *         itself, forever. `portalLoginHref.ts`'s own header records two production
 *         incidents of this class (2026-08-03, 7 students; 2026-08-24, 18 students). So a
 *         401 is terminal here too, and the badge is additionally gated on an authenticated
 *         participant so the request is never made.
 *   503, 5xx, network — reachable but unresolved. THIS is the honest-outage case the
 *         "unavailable" panel exists for, and the only one that keeps polling.
 */

export interface DiscoveryBroadcast {
  id: string;
  title: string;
  access_mode: 'free' | 'paid' | 'preview' | 'private';
  editorial_state: string;
  room_id: string | null;
  content_started_at: number | null;
  scheduled_start_at: number | null;
  can_watch: boolean;
  reason: string;
  offer_upgrade: boolean;
  preview_seconds_remaining: number | null;
  /** The class session this broadcast airs, or null. Optional: an older backend does not send it. */
  session_id?: string | null;
}

export interface DiscoveryResponse {
  states: string[];
  broadcasts: DiscoveryBroadcast[];
  poll_after_ms: number;
}

/** Mirrors the server's clamp. A client must not trust a cadence it was handed. */
export const CLIENT_MIN_POLL_MS = 15_000;
export const CLIENT_MAX_POLL_MS = 300_000;
export const CLIENT_DEFAULT_POLL_MS = 45_000;
/** Backoff when discovery is unavailable: 1, 2, 4 … capped. */
export const BACKOFF_CAP_MS = 300_000;

export function clampPollMs(value: unknown): number {
  const n = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(n)) return CLIENT_DEFAULT_POLL_MS;
  return Math.min(CLIENT_MAX_POLL_MS, Math.max(CLIENT_MIN_POLL_MS, n));
}

export function backoffMs(consecutiveFailures: number, base: number): number {
  const factor = 2 ** Math.max(0, consecutiveFailures - 1);
  return Math.min(BACKOFF_CAP_MS, base * factor);
}

/** 404 or 401: there is nothing to show and nothing to retry. */
export function isTerminalDiscoveryError(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status;
  return status === 404 || status === 401;
}

export interface DiscoveryState {
  /** Empty while loading, and empty when genuinely nothing is airing — see `unavailable`. */
  broadcasts: DiscoveryBroadcast[];
  /**
   * The feature is off, or this viewer is not signed in. Render nothing at all: a disabled
   * feature is not an outage, and saying otherwise is a fabricated failure in the same family
   * as a fabricated zero.
   */
  disabled: boolean;
  /**
   * True when the server could not work out what is airing. Distinct from an empty list on
   * purpose: "nothing is live" and "we cannot tell" must not render identically, or an outage
   * reads as a quiet evening.
   */
  unavailable: boolean;
  loading: boolean;
  /**
   * Discovery has come back at least once, whatever it said.
   *
   * `disabled` starts false, because on mount nothing yet says the feature is off. That is the
   * right default for an affordance that should stay hidden until there is something to show —
   * the badge renders nothing with an empty list either way. It is the WRONG default for
   * anything that treats `!disabled` as "broadcasting exists", because for the first moment of
   * every page load that is a guess, and with the flag dark it is a wrong one. A nav tab gated
   * that way appears on load and vanishes when the 404 lands.
   *
   * So the positive signal is separate from the absence of the negative one. Gate on
   * `answered && !disabled` to mean "we asked, and broadcasting is on".
   */
  answered: boolean;
  refresh: () => void;
}

export interface DiscoveryDeps {
  fetchDiscovery?: () => Promise<DiscoveryResponse>;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Injected so a test can drive visibility without a real document. */
  isVisible?: () => boolean;
  subscribeVisibility?: (fn: () => void) => () => void;
}

async function defaultFetch(): Promise<DiscoveryResponse> {
  const res = await portalApi.get('/api/portal/broadcasts/active');
  return res.data as DiscoveryResponse;
}

/**
 * THE DEFAULTS LIVE AT MODULE SCOPE, AND THAT IS LOAD-BEARING.
 *
 * They used to be inline arrows — `deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms))` — which
 * minted a NEW function on every render. `tick` is a useCallback depending on them, so `tick`
 * changed identity every render; the effect depends on `tick`, so it re-ran every render; and
 * re-running it calls `tick()`, which sets state, which renders again. An infinite loop, in
 * the DEFAULT path only.
 *
 * Every test that injected deps missed it, because an injected `setTimer` parks the callback
 * in an array and never fires it, so nothing re-rendered. It surfaced the moment a test
 * mounted the REAL route tree — which is exactly what the positive control in
 * `liveNowBadge.gating.test.tsx` was added to force.
 */
function defaultSetTimer(fn: () => void, ms: number): unknown {
  return setTimeout(fn, ms);
}

function defaultClearTimer(handle: unknown): void {
  clearTimeout(handle as ReturnType<typeof setTimeout>);
}

function defaultIsVisible(): boolean {
  if (typeof document === 'undefined') return true;
  return document.visibilityState !== 'hidden';
}

function defaultSubscribeVisibility(fn: () => void): () => void {
  if (typeof document === 'undefined') return () => undefined;
  document.addEventListener('visibilitychange', fn);
  return () => document.removeEventListener('visibilitychange', fn);
}

export function useBroadcastDiscovery(enabled: boolean, deps: DiscoveryDeps = {}): DiscoveryState {
  // Captured once. Dependencies are injected by tests at mount and never change at runtime,
  // and holding them in a ref is what keeps the callbacks below stable: a caller that builds
  // its deps object inline — as the real tree does by passing nothing at all — would
  // otherwise hand this hook a fresh identity on every render.
  const injected = useRef(deps);
  const fetchDiscovery = injected.current.fetchDiscovery ?? defaultFetch;
  const setTimer = injected.current.setTimer ?? defaultSetTimer;
  const clearTimer = injected.current.clearTimer ?? defaultClearTimer;
  const isVisible = injected.current.isVisible ?? defaultIsVisible;
  const subscribeVisibility = injected.current.subscribeVisibility ?? defaultSubscribeVisibility;

  const [broadcasts, setBroadcasts] = useState<DiscoveryBroadcast[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [answered, setAnswered] = useState(false);

  const timer = useRef<unknown>(null);
  const failures = useRef(0);
  const cadence = useRef(CLIENT_DEFAULT_POLL_MS);
  const stopped = useRef(false);
  /** Guards a late response from a superseded request landing on current state. */
  const generation = useRef(0);

  const clear = useCallback(() => {
    if (timer.current !== null) { clearTimer(timer.current); timer.current = null; }
  }, [clearTimer]);

  const tick = useCallback(async () => {
    if (stopped.current) return;
    // A hidden tab arms no timer; this is the belt to that braces.
    if (!isVisible()) return;

    const mine = ++generation.current;
    setLoading(true);
    try {
      const data = await fetchDiscovery();
      if (stopped.current || mine !== generation.current) return;
      failures.current = 0;
      cadence.current = clampPollMs(data?.poll_after_ms);
      setBroadcasts(Array.isArray(data?.broadcasts) ? data.broadcasts : []);
      setUnavailable(false);
      setDisabled(false);
      setAnswered(true);
    } catch (err) {
      if (stopped.current || mine !== generation.current) return;
      // Answered either way: a 404 is an answer, and it is the one a nav gate most needs.
      setAnswered(true);

      if (isTerminalDiscoveryError(err)) {
        // Off, or not signed in. Show nothing, and stop: there is no state that retrying can
        // discover, and on a 401 each retry triggers the interceptor's redirect.
        stopped.current = true;
        clear();
        setDisabled(true);
        setUnavailable(false);
        setBroadcasts([]);
        return;
      }

      failures.current += 1;
      // The list is NOT cleared. A viewer mid-poll keeps seeing what was airing a minute ago,
      // flagged as stale by `unavailable`, rather than watching the badge vanish because one
      // request failed.
      setUnavailable(true);
    } finally {
      if (!stopped.current && mine === generation.current) setLoading(false);
    }

    if (stopped.current || !isVisible()) return;
    const delay = failures.current > 0
      ? backoffMs(failures.current, cadence.current)
      : cadence.current;
    clear();
    timer.current = setTimer(() => { void tick(); }, delay);
  }, [fetchDiscovery, isVisible, setTimer, clear]);

  const refresh = useCallback(() => { void tick(); }, [tick]);

  useEffect(() => {
    if (!enabled) return undefined;
    stopped.current = false;
    void tick();

    const unsubscribe = subscribeVisibility(() => {
      if (isVisible()) {
        // Becoming visible refreshes immediately: the first thing a returning viewer sees
        // should be current, not up to a cadence out of date.
        void tick();
      } else {
        clear();
      }
    });

    return () => {
      stopped.current = true;
      generation.current += 1;
      clear();
      unsubscribe();
    };
  }, [enabled, tick, subscribeVisibility, isVisible, clear]);

  return { broadcasts, unavailable, disabled, loading, answered, refresh };
}
