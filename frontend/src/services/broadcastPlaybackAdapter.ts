import portalApi from '../utils/portalApi';

/**
 * broadcastPlaybackAdapter — drives one `<video>` against the signed `/bm/` route.
 *
 * WHY AN ADAPTER AND NOT JUST A `src`. A playback credential lives 120 seconds
 * (`GRANT_TTL_MS`), and a class replay runs ninety minutes. So the credential WILL expire
 * mid-playback, every time, and something has to renew it without losing the viewer's place.
 * That is this module's whole reason to exist.
 *
 * WHY NOT JUST ISSUE A LONGER TOKEN. Because P6-02b's criterion is that unpublishing a replay
 * "revokes playback within one token TTL" — revocation is only as fast as the shortest live
 * token, since a signed URL cannot be recalled once minted. Lengthening the TTL to spare the
 * client this work would directly weaken that guarantee. Renewing on the client is the
 * cheaper side of that trade.
 *
 * REACT-FREE ON PURPOSE. No hooks, no component, no renderer needed to test it. P3-02's
 * player wraps it; every state transition here is exercised without a DOM.
 *
 * THE RULE THAT SHAPES THE ERROR HANDLING: a signed URL must never reach an error surface.
 * It carries an HMAC that grants access to paid content for its remaining lifetime, and an
 * error surface is the one place a URL reliably gets copied into a bug report, a log
 * aggregator or a screenshot. So `PlaybackSnapshot` carries stable CODES, never sentences and
 * never URLs, and every diagnostic goes through `redactMediaUrl`.
 */

/** Stable codes. Deliberately not sentences: the UI owns the wording, this owns the meaning. */
export type PlaybackReason =
  // Terminal — the server said no. Retrying is not going to change its mind.
  | 'not_entitled'
  | 'preview_expired'
  | 'not_watchable'
  | 'not_room_eligible'
  | 'not_found'
  // Recoverable, within the attempt budget.
  | 'credential_expired'
  | 'upstream_unavailable'
  | 'media_error'
  // Budget spent.
  | 'retries_exhausted';

export type PlaybackPhase =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'renewing'
  | 'ended'
  | 'denied'
  | 'failed';

export interface PlaybackSnapshot {
  phase: PlaybackPhase;
  reason: PlaybackReason | null;
  offerUpgrade: boolean;
  previewSecondsRemaining: number | null;
  /** Consecutive recovery attempts spent. Resets on any success. */
  attempt: number;
  /** Epoch ms at which the current credential dies; null when there is none. */
  credentialExpiresAt: number | null;
  /**
   * The browser refused to start playback without a user gesture.
   *
   * NOT an error phase: the element is loaded, seeked and ready — it is simply paused, and
   * only a real gesture can un-pause it. The UI should render a labelled control and call
   * `resume()` from that click's handler.
   *
   * CORRECTED. This comment used to end "Nothing else clears this", which was false when
   * written and is the misconception that produced a real defect: a reader of this contract
   * concludes no other clearing path is needed, and the first version of the feature indeed
   * had none — so a viewer who pressed the element's OWN play button (the element renders
   * native `controls`, so that is the gesture they actually make) kept a "Play" button and a
   * "playback was blocked" message on screen for the rest of the replay.
   *
   * The adapter clears this flag at SIX places, and the UI must not assume otherwise:
   * the `play` listener (playback started by any means, including native controls),
   * `onEnded`, `deny`, `giveUp`, `stop`, and a successful `startPlayback`.
   * `blockPlayback` is the only thing that raises it.
   */
  autoplayBlocked: boolean;
}

/** Shape of POST /api/portal/broadcasts/:id/playback on success. */
export interface GrantResponse {
  url: string;
  expires_at: number;
  ttl_seconds: number;
  grant: 'full' | 'preview';
  preview_seconds_remaining: number | null;
  /**
   * Whether this credential points at a LIVE stream rather than a replay.
   *
   * The server is the authority: it knows the occurrence's editorial state, and the client
   * must not infer liveness from the url shape. Optional so an older server that omits it is
   * treated as a replay, which is the behaviour that existed before this field and the safe
   * default — restoring a position on a replay is merely redundant, while failing to restore
   * one would lose the viewer's place.
   */
  is_live?: boolean;
  /**
   * Whether this viewer may end the broadcast.
   *
   * Server-decided from the same staff context the producer commands use. Optional, and
   * absent means NO: an older server that omits it must not grant a capability, and the
   * control it gates is irreversible. The safe default here is the opposite of `is_live`'s
   * precisely because the consequences are opposite — a missing replay-restore loses a
   * viewer's place, while a wrongly-offered End button ends a class in front of everyone.
   */
  is_producer?: boolean;
  /**
   * The occurrence version, for a version-guarded producer command. Optional: without it the
   * End control simply is not offered, which is the correct degradation — a command sent with
   * a guessed version would either be refused or, worse, act on a state the producer has not
   * seen.
   */
  version?: number;
}

/** The subset of HTMLVideoElement this adapter touches. */
export interface MediaTarget {
  src: string;
  currentTime: number;
  paused: boolean;
  play(): Promise<void> | void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface AdapterDeps {
  /** Injected so tests need neither axios nor a server. */
  fetchGrant: (occurrenceId: string, asset: string) => Promise<GrantResponse>;
  media: MediaTarget;
  onChange: (snapshot: PlaybackSnapshot) => void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Diagnostics sink. Receives redacted context only. */
  log?: (line: string) => void;
}

/** Renew this far ahead of expiry, so a slow network does not become a stall. */
export const RENEW_LEAD_MS = 20_000;
/** Never schedule a renewal closer than this, or a short credential busy-loops. */
export const MIN_RENEW_DELAY_MS = 1_000;
/** Bounded, per CLAUDE.md: an unbounded retry loop is a prohibited pattern. */
export const MAX_RECOVERY_ATTEMPTS = 4;
export const BACKOFF_BASE_MS = 500;
export const BACKOFF_CAP_MS = 8_000;

/** Terminal server verdicts. Retrying a `denied` is how a paywall becomes a formality. */
const TERMINAL_REASONS: ReadonlySet<PlaybackReason> = new Set<PlaybackReason>([
  'not_entitled', 'preview_expired', 'not_watchable', 'not_room_eligible', 'not_found',
]);

/**
 * Strip the signature and expiry from anything about to be logged. Returns the KEY only,
 * which is safe: it names the asset but grants nothing without a valid `s`.
 */
export function redactMediaUrl(url: string): string {
  if (!url) return '(none)';
  const [path] = url.split('?');
  return `${path}?e=<redacted>&s=<redacted>`;
}

/** Capped exponential backoff. attempt is 1-based. */
export function backoffMs(attempt: number): number {
  return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1));
}

/**
 * When to renew, given an expiry. Clamped at MIN_RENEW_DELAY_MS so a credential that is
 * already inside the lead window renews soon rather than immediately-and-forever.
 */
export function renewDelayMs(expiresAt: number, nowMs: number): number {
  return Math.max(MIN_RENEW_DELAY_MS, expiresAt - RENEW_LEAD_MS - nowMs);
}

/** Map a failed grant request to a reason. Anything unrecognised is treated as recoverable. */
export function reasonFromGrantError(err: unknown): { reason: PlaybackReason; offerUpgrade: boolean } {
  const res = (err as { response?: { status?: number; data?: Record<string, unknown> } })?.response;
  const status = res?.status;
  const data = res?.data ?? {};
  const offerUpgrade = data.offer_upgrade === true;

  if (status === 403) {
    const raw = typeof data.reason === 'string' ? data.reason : '';
    const known: PlaybackReason[] = ['preview_expired', 'not_watchable', 'not_room_eligible'];
    const match = known.find((k) => k === raw);
    return { reason: match ?? 'not_entitled', offerUpgrade };
  }
  if (status === 404) return { reason: 'not_found', offerUpgrade: false };
  // 429, 5xx, network failure, timeout. The viewer may well be entitled; the system is not
  // answering. That is a retry, not a denial.
  return { reason: 'upstream_unavailable', offerUpgrade: false };
}

export interface PlaybackAdapter {
  start(): void;
  stop(): void;
  /** Retry after `autoplayBlocked`. Only meaningful inside a user-gesture handler. */
  resume(): void;
  snapshot(): PlaybackSnapshot;
}

export function createPlaybackAdapter(
  occurrenceId: string,
  asset: string,
  deps: AdapterDeps,
): PlaybackAdapter {
  const now = deps.now ?? (() => Date.now());
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const log = deps.log ?? (() => undefined);
  const { media } = deps;

  let state: PlaybackSnapshot = {
    phase: 'idle', reason: null, offerUpgrade: false,
    previewSecondsRemaining: null, attempt: 0, credentialExpiresAt: null,
    autoplayBlocked: false,
  };
  let timer: unknown = null;
  let stopped = false;
  /**
   * The pending `loadedmetadata` restore, held so `stop()` can detach it.
   *
   * Without this it survived teardown and then called `media.play()` on a `src` that `stop()`
   * had just cleared. Harmless to the snapshot — `blockPlayback` guards on `stopped` — but it
   * is a listener left on an element that deliberately outlives every state change, and it
   * made the detachment test's title ("DETACHES every listener") broader than its body.
   */
  let pendingRestore: (() => void) | null = null;
  /** Guards against a late response from a superseded request landing on current state. */
  let generation = 0;

  function emit(next: Partial<PlaybackSnapshot>): void {
    state = { ...state, ...next };
    deps.onChange(state);
  }

  function cancelTimer(): void {
    if (timer !== null) { clearTimer(timer); timer = null; }
  }

  function cancelPendingRestore(): void {
    if (pendingRestore) {
      media.removeEventListener('loadedmetadata', pendingRestore);
      pendingRestore = null;
    }
  }

  function schedule(fn: () => void, ms: number): void {
    cancelTimer();
    timer = setTimer(fn, ms);
  }

  /** A terminal verdict clears the credential: nothing should keep requesting ranges. */
  function deny(reason: PlaybackReason, offerUpgrade: boolean, previewLeft: number | null): void {
    cancelTimer();
    media.src = '';
    emit({
      phase: 'denied', reason, offerUpgrade,
      previewSecondsRemaining: previewLeft, credentialExpiresAt: null,
      // `media.src` is cleared above, so there is nothing a gesture could start. Leaving the
      // flag up would offer a Play button beside "you do not have access".
      autoplayBlocked: false,
    });
  }

  function giveUp(): void {
    cancelTimer();
    media.src = '';
    emit({
      phase: 'failed', reason: 'retries_exhausted', credentialExpiresAt: null,
      autoplayBlocked: false,
    });
  }

  /** Recoverable failure: back off and try again, or give up when the budget is spent. */
  function recover(reason: PlaybackReason): void {
    const attempt = state.attempt + 1;
    if (attempt > MAX_RECOVERY_ATTEMPTS) {
      log(`broadcast_playback_exhausted reason=${reason} attempts=${state.attempt}`);
      giveUp();
      return;
    }
    emit({ reason, attempt });
    log(`broadcast_playback_recovering reason=${reason} attempt=${attempt}`);
    schedule(() => void acquire(true), backoffMs(attempt));
  }

  /**
   * Start playback and SURVIVE a refusal.
   *
   * `media.play()` returns a promise that REJECTS with NotAllowedError when the browser
   * requires a user gesture. Chrome and Safari both refuse unmuted autoplay by default, so
   * this is the ordinary path for a first-time viewer, not an edge case.
   *
   * Two call sites reach here and the second one is why this matters. A fresh load refusing
   * is survivable — the viewer clicked something to get to the player and will click again.
   * But a RENEWAL also swaps `src`, which reloads the element, and a refusal there stops a
   * replay the viewer was already watching, ninety minutes in, with the UI still showing
   * `phase: 'playing'`. That is the failure this flag exists to make visible.
   *
   * The rejection is reported, never rethrown: a refusal is not a playback failure, and
   * spending a recovery attempt on it would burn the budget on something no retry can fix.
   */
  function startPlayback(context: 'load' | 'renewal'): void {
    let result: Promise<void> | void;
    try {
      result = media.play();
    } catch (err) {
      // Older elements threw synchronously instead of rejecting.
      blockPlayback(context, err);
      return;
    }
    if (!result || typeof result.then !== 'function') {
      // A void-returning element (or a test double) gives us nothing to observe. Treat it as
      // started — the `error` listener still covers a genuine media failure.
      if (state.autoplayBlocked) emit({ autoplayBlocked: false });
      return;
    }
    result.then(
      () => {
        if (stopped) return;
        if (state.autoplayBlocked) emit({ autoplayBlocked: false });
      },
      (err: unknown) => blockPlayback(context, err),
    );
  }

  function blockPlayback(context: 'load' | 'renewal', err: unknown): void {
    if (stopped) return;
    // The error NAME is the only part worth keeping. A `message` is browser-worded and, on a
    // media element, has been seen to quote the source URL — which carries a live HMAC.
    const name = (err as { name?: string } | null)?.name ?? 'unknown';
    log(`broadcast_playback_autoplay_blocked context=${context} error=${name}`);
    emit({ autoplayBlocked: true });
  }

  /**
   * Fetch a credential and point the element at it.
   *
   * `isRenewal` preserves the viewer's position. Swapping `src` reloads the element, so the
   * position is restored on the next `loadedmetadata` and playback resumes only if it was
   * not paused — a renewal must not un-pause a video the viewer deliberately paused.
   */
  async function acquire(isRenewal: boolean): Promise<void> {
    if (stopped) return;
    const mine = ++generation;
    const resumeAt = isRenewal ? media.currentTime : 0;
    const wasPlaying = isRenewal ? !media.paused : true;

    emit({ phase: isRenewal ? 'renewing' : 'loading' });

    let grant: GrantResponse;
    try {
      grant = await deps.fetchGrant(occurrenceId, asset);
    } catch (err) {
      if (stopped || mine !== generation) return;
      const { reason, offerUpgrade } = reasonFromGrantError(err);
      if (TERMINAL_REASONS.has(reason)) {
        log(`broadcast_playback_denied reason=${reason}`);
        deny(reason, offerUpgrade, null);
        return;
      }
      recover(reason);
      return;
    }

    if (stopped || mine !== generation) return;

    media.src = grant.url;

    /**
     * A LIVE STREAM MUST NOT HAVE ITS POSITION RESTORED.
     *
     * Swapping `src` reloads the element, and a live manifest's timeline restarts on reload.
     * Restoring the viewer's old `currentTime` therefore seeks BACKWARDS into the DVR buffer
     * and replays the last stretch — every renewal, which is roughly every 100 seconds,
     * forever. The viewer hears the same minute and a half on a loop and never reaches the
     * live edge again.
     *
     * Found in the first production airing, 15 October 2026, and reported independently by
     * two viewers as "the last lines keep repeating". No unit test caught it because the
     * replay behaviour it was modelled on is correct: for a REPLAY the timeline is stable, so
     * restoring is exactly right. The two cases are genuinely different, and the server is
     * the one that knows which this is.
     *
     * Live still resumes playback — it just resumes at the live edge, which is the only
     * position on a live stream that means anything.
     */
    const restorePosition = resumeAt > 0 && grant.is_live !== true;
    if (restorePosition) {
      const restore = (): void => {
        media.removeEventListener('loadedmetadata', restore);
        pendingRestore = null;
        media.currentTime = resumeAt;
        if (wasPlaying) startPlayback('renewal');
      };
      // Any earlier pending restore is dropped first: two of them would mean the older
      // `resumeAt` wins the second time `loadedmetadata` fires, seeking the viewer backwards.
      cancelPendingRestore();
      pendingRestore = restore;
      media.addEventListener('loadedmetadata', restore);
    } else if (wasPlaying) {
      // A pending restore from an EARLIER acquisition would otherwise still fire and seek a
      // live viewer backwards, which is the whole defect this branch exists to prevent.
      cancelPendingRestore();
      startPlayback(isRenewal ? 'renewal' : 'load');
    }

    // A successful acquisition clears the recovery budget: the next failure gets a full set
    // of attempts rather than inheriting an old one.
    emit({
      phase: 'playing', reason: null, attempt: 0, offerUpgrade: false,
      previewSecondsRemaining: grant.preview_seconds_remaining,
      credentialExpiresAt: grant.expires_at,
    });
    log(`broadcast_playback_acquired grant=${grant.grant} url=${redactMediaUrl(grant.url)}`);

    schedule(() => void acquire(true), renewDelayMs(grant.expires_at, now()));
  }

  function onMediaError(): void {
    if (stopped || state.phase === 'denied' || state.phase === 'ended') return;
    // The element cannot tell us WHY a range request failed — a 410 past expiry and a
    // transport drop look identical from here. Both are answered the same way: get a fresh
    // credential, within the budget. An expired credential is the likelier cause, so the
    // reason reflects that when the expiry has in fact passed.
    const expired = state.credentialExpiresAt !== null && now() >= state.credentialExpiresAt;
    recover(expired ? 'credential_expired' : 'media_error');
  }

  /**
   * Playback started — and the gesture that started it probably never came through here.
   *
   * THE ELEMENT CARRIES NATIVE `controls`. So the obvious thing a viewer does when they see a
   * paused video is press the element's own play button, which bypasses `resume()` entirely.
   * Without this listener `autoplayBlocked` stayed true for the rest of the replay: the
   * labelled "Play" control and the "your browser blocked playback" live-region message sat on
   * screen for ninety minutes of a video that was playing fine, and then survived into
   * `phase: 'ended'`, where they suppressed the real status line ("Finished.").
   *
   * FOUND BY AN INDEPENDENT CHECK, and the deeper mistake is worth recording: an earlier pass
   * deleted the component's `phase !== 'ended'` guard because removing it broke no test, and
   * read that as "the state is unreachable". The other reading — "the state is reachable and
   * untested" — was the correct one. `play` is the right event rather than `playing`: it
   * fires when playback is no longer being refused, which is exactly what the flag tracks,
   * and it does not wait for buffering.
   */
  function onPlay(): void {
    if (stopped) return;
    if (state.autoplayBlocked) emit({ autoplayBlocked: false });
  }

  function onEnded(): void {
    if (stopped) return;
    cancelTimer();
    // Cleared here too, so the flag cannot outlive the playback it describes even if the
    // `play` event was never seen (a `src` that ends without ever starting, say).
    emit({
      phase: 'ended', reason: null, credentialExpiresAt: null, autoplayBlocked: false,
    });
  }

  return {
    start(): void {
      if (!stopped && state.phase !== 'idle') return;
      stopped = false;
      media.addEventListener('error', onMediaError);
      media.addEventListener('ended', onEnded);
      media.addEventListener('play', onPlay);
      // Guarded, not unconditional: an unconditional emit here publishes an extra `idle`
      // snapshot on every start, which is noise for every subscriber.
      if (state.autoplayBlocked) emit({ autoplayBlocked: false });
      void acquire(false);
    },
    stop(): void {
      stopped = true;
      generation += 1;
      cancelTimer();
      media.removeEventListener('error', onMediaError);
      media.removeEventListener('ended', onEnded);
      media.removeEventListener('play', onPlay);
      cancelPendingRestore();
      // Clear the source so no in-flight range request carries a live credential onward.
      media.src = '';
      emit({
        phase: 'idle', reason: null, attempt: 0, credentialExpiresAt: null,
        autoplayBlocked: false,
      });
    },
    /**
     * Retry playback from inside a user gesture.
     *
     * MUST be called synchronously from a real event handler — a click, a key, a tap. Called
     * from a timer or a promise callback the browser will refuse again, because the gesture
     * is what it is checking for. There is deliberately no automatic retry for that reason.
     */
    resume(): void {
      if (stopped || state.phase === 'denied' || state.phase === 'failed') return;
      startPlayback('load');
    },
    snapshot(): PlaybackSnapshot {
      return state;
    },
  };
}

/**
 * The real grant request.
 *
 * The media URL comes back RELATIVE (`/bm/...`) because the portal and the API share an
 * origin in every shipped build — `nginx/Dockerfile` hardcodes `REACT_APP_API_URL=` empty.
 * It is resolved against portalApi's own baseURL anyway, so that a configured base cannot
 * silently send `<video>` to the frontend host while the API lives elsewhere.
 */
export async function requestPlaybackGrant(occurrenceId: string, asset: string): Promise<GrantResponse> {
  const res = await portalApi.post(`/api/portal/broadcasts/${occurrenceId}/playback`, { asset });
  const data = res.data as GrantResponse;
  return { ...data, url: resolveAgainstApiBase(data.url) };
}

export function resolveAgainstApiBase(url: string, base?: string): string {
  const configured = base ?? (portalApi.defaults.baseURL || '');
  if (!configured || /^https?:\/\//i.test(url)) return url;
  return `${configured.replace(/\/$/, '')}${url}`;
}
