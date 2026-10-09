import {
  createPlaybackAdapter,
  GrantResponse,
  PlaybackSnapshot,
} from '../broadcastPlaybackAdapter';

/**
 * Shared rig for the broadcast playback adapter suites.
 *
 * WHY IT LIVES OUTSIDE `__tests__/`. CRA's `testMatch` collects EVERY file under a
 * `__tests__/` directory as a suite, so a helper placed there fails the run with "Your test
 * suite must contain at least one test" — which is exactly what
 * `src/pages/portal/today/__tests__/testEnv/intersectionObserverMock.ts` does today. A module
 * here matches neither `__tests__/**` nor `*.{spec,test}.*`, so it is importable and never
 * collected. It is only ever imported by test files, so it does not reach the bundle.
 *
 * Time and timers are INJECTED rather than faked globally, so every assertion about "when" is
 * an exact number rather than a tolerance. There is no DOM here and no renderer: the adapter
 * is deliberately React-free, and a test that needed a component to check a backoff curve
 * would be testing the wrong thing.
 */

export const OCC = '11111111-2222-4333-8444-555555555555';
export const ASSET = 'replay.mp4';
export const T0 = 1_700_000_000_000;
export const SIG = 'c2lnbmF0dXJlLWJ5dGVz';

/** The NotAllowedError a browser raises when it wants a user gesture before playing. */
export const refusal = (): Error => Object.assign(
  new Error('play() failed because the user didn\'t interact with the document first'),
  { name: 'NotAllowedError' },
);

export function grant(over: Partial<GrantResponse> = {}): GrantResponse {
  return {
    url: `/bm/broadcast/${OCC}/${ASSET}?e=${T0 + 120_000}&s=${SIG}`,
    expires_at: T0 + 120_000,
    ttl_seconds: 120,
    grant: 'full',
    preview_seconds_remaining: null,
    ...over,
  };
}

/** Flush pending microtasks — the adapter's acquire() is async. */
export const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export function harness() {
  let nowMs = T0;
  const timers: Array<{ id: number; fn: () => void; ms: number; at: number }> = [];
  let nextId = 1;

  const listeners: Record<string, Array<() => void>> = {};
  const media = {
    src: '',
    currentTime: 0,
    paused: false,
    play: jest.fn(() => Promise.resolve()),
    addEventListener: (type: string, fn: () => void) => {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    removeEventListener: (type: string, fn: () => void) => {
      listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
    },
  };

  const snapshots: PlaybackSnapshot[] = [];
  const logs: string[] = [];
  const fetchGrant = jest.fn<Promise<GrantResponse>, [string, string]>();

  const adapter = createPlaybackAdapter(OCC, ASSET, {
    fetchGrant,
    media,
    onChange: (s) => snapshots.push({ ...s }),
    now: () => nowMs,
    setTimer: (fn, ms) => {
      const t = { id: nextId++, fn, ms, at: nowMs + ms };
      timers.push(t);
      return t.id;
    },
    clearTimer: (h) => {
      const i = timers.findIndex((t) => t.id === h);
      if (i >= 0) timers.splice(i, 1);
    },
    log: (l) => logs.push(l),
  });

  return {
    adapter, media, snapshots, logs, fetchGrant, listeners,
    get pending() { return timers.map((t) => t.ms); },
    advanceTo(ms: number) { nowMs = ms; },
    /** Fire the single pending timer, as the real scheduler eventually would. */
    async fire() {
      const t = timers.shift();
      if (!t) throw new Error('no timer pending');
      nowMs = t.at;
      t.fn();
      await flush();
    },
    emitMedia(type: string) {
      [...(listeners[type] || [])].forEach((fn) => fn());
    },
  };
}
