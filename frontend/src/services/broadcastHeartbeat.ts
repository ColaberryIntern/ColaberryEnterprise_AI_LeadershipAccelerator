/**
 * The playback heartbeat caller.
 *
 * L4.6 shipped the ingestion route, the schema, the bounded upsert and the
 * unavailable-never-zero audience read, with thirteen tests — and nothing on the client ever
 * called it. Test 2 aired for twenty minutes with real viewers and recorded zero rows, so
 * "nobody watched" and "collection is broken" were indistinguishable, which is the exact
 * failure L4.6 existed to prevent. This is the missing half.
 *
 * It lives in its own module rather than inside broadcastPlaybackAdapter.ts because that file
 * is already at 510 lines — the hard ceiling in CLAUDE.md — where the rule is that the next
 * change splits before it adds.
 *
 * MEASUREMENT MUST NEVER AFFECT PLAYBACK. Every send is fire-and-forget and every failure is
 * swallowed after logging. A viewer whose stream stutters because a metric could not be
 * recorded would be a far worse bug than the missing metric.
 */

import portalApi from '../utils/portalApi';

export type BeatState = 'playing' | 'paused' | 'buffering' | 'ended';
export type BeatIntent = 'deliberate' | 'auto';

/** Exactly what the server's `.strict()` schema accepts. Nothing else may be added here. */
export interface HeartbeatBody {
  session_id: string;
  state: BeatState;
  intent: BeatIntent;
}

/**
 * Matches the server default (`playbackHeartbeatSeconds`, 15s, bounds 5-120). The server also
 * holds a viewer-expiry window of two beats plus a margin, so one lost beat does not drop a
 * viewer out of the count.
 *
 * The cadence is operator-configurable server-side and is NOT published to the client, so this
 * is a duplicated constant rather than a derived one. If an operator lowers the expiry window
 * below twice this, viewers will flicker. Publishing the value on the grant response would
 * remove the duplication; that is a backend contract change and deliberately not done here.
 */
export const DEFAULT_HEARTBEAT_MS = 15_000;

export interface HeartbeatDeps {
  /** Injected so tests need neither axios nor a server, matching the adapter's shape. */
  post: (body: HeartbeatBody) => Promise<unknown>;
  /** Per TAB. Supplied in tests; generated otherwise. */
  sessionId?: string;
  intervalMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** True when the tab is backgrounded. A hidden tab is not a viewer. */
  isHidden?: () => boolean;
  log?: (line: string) => void;
}

export interface PlaybackHeartbeat {
  /** Report a state change. Beats immediately, and keeps beating while `playing`. */
  report(state: BeatState, intent?: BeatIntent): void;
  /** Stop beating. Best-effort final `ended` beat. */
  stop(): void;
  readonly sessionId: string;
}

/**
 * An opaque per-tab id satisfying the server's `^[A-Za-z0-9_-]{8,64}$`.
 *
 * Opaque on purpose: it identifies a TAB, never a person. The server resolves identity from
 * the JWT, and `enrollment_id` is on the forbidden-client-supplied list precisely so a client
 * cannot assert who it is.
 */
export function newSessionId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, '');
  let out = '';
  while (out.length < 32) out += Math.random().toString(36).slice(2);
  return out.slice(0, 32);
}

/**
 * The real transport. Separate from the factory so every test can inject instead, and so the
 * component has one obvious thing to pass.
 */
export async function postPlaybackHeartbeat(occurrenceId: string, body: HeartbeatBody): Promise<void> {
  await portalApi.post(`/api/portal/broadcasts/${occurrenceId}/heartbeat`, body);
}

export function createPlaybackHeartbeat(deps: HeartbeatDeps): PlaybackHeartbeat {
  const sessionId = deps.sessionId ?? newSessionId();
  const intervalMs = deps.intervalMs ?? DEFAULT_HEARTBEAT_MS;
  const setTimer = deps.setTimer ?? ((fn, ms) => setInterval(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));
  const isHidden = deps.isHidden ?? (() => typeof document !== 'undefined' && document.visibilityState === 'hidden');
  const log = deps.log ?? (() => undefined);

  let timer: unknown = null;
  let last: BeatState | null = null;
  let stopped = false;

  function send(state: BeatState, intent: BeatIntent): void {
    if (stopped) return;
    // Never throws into the caller: a rejected promise here must not reach the player.
    Promise.resolve()
      .then(() => deps.post({ session_id: sessionId, state, intent }))
      .catch((err: unknown) => {
        log(`heartbeat ${state} failed: ${(err as Error)?.message ?? 'unknown'}`);
      });
  }

  function stopTimer(): void {
    if (timer !== null) { clearTimer(timer); timer = null; }
  }

  function startTimer(): void {
    if (timer !== null) return;
    timer = setTimer(() => {
      // Checked at beat time rather than only on the visibility event: a tab backgrounded
      // while playing keeps its media element "playing", and counting it would inflate the
      // audience with people who are not watching.
      if (isHidden()) return;
      send('playing', 'auto');
    }, intervalMs);
  }

  return {
    sessionId,
    report(state: BeatState, intent: BeatIntent = 'deliberate'): void {
      if (stopped) return;
      // Every transition is reported, because the shape of a session (played, paused, resumed)
      // is the thing a periodic beat alone cannot reconstruct.
      if (state !== last) {
        last = state;
        send(state, intent);
      }
      if (state === 'playing') startTimer(); else stopTimer();
    },
    stop(): void {
      if (stopped) return;
      stopTimer();
      // Best-effort only. On a real page close this will not arrive, and it does not need to:
      // the server expires a viewer after a window of two missed beats, which is the mechanism
      // that handles someone who simply vanishes.
      if (last !== null && last !== 'ended') send('ended', 'auto');
      stopped = true;
      last = 'ended';
    },
  };
}
