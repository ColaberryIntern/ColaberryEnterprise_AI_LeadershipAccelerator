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
}

/** Shape of POST /api/portal/broadcasts/:id/playback on success. */
export interface GrantResponse {
  url: string;
  expires_at: number;
  ttl_seconds: number;
  grant: 'full' | 'preview';
  preview_seconds_remaining: number | null;
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
  };
  let timer: unknown = null;
  let stopped = false;
  /** Guards against a late response from a superseded request landing on current state. */
  let generation = 0;

  function emit(next: Partial<PlaybackSnapshot>): void {
    state = { ...state, ...next };
    deps.onChange(state);
  }

  function cancelTimer(): void {
    if (timer !== null) { clearTimer(timer); timer = null; }
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
    });
  }

  function giveUp(): void {
    cancelTimer();
    media.src = '';
    emit({ phase: 'failed', reason: 'retries_exhausted', credentialExpiresAt: null });
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
    if (resumeAt > 0) {
      const restore = (): void => {
        media.removeEventListener('loadedmetadata', restore);
        media.currentTime = resumeAt;
        if (wasPlaying) void media.play();
      };
      media.addEventListener('loadedmetadata', restore);
    } else if (wasPlaying) {
      void media.play();
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

  function onEnded(): void {
    if (stopped) return;
    cancelTimer();
    emit({ phase: 'ended', reason: null, credentialExpiresAt: null });
  }

  return {
    start(): void {
      if (!stopped && state.phase !== 'idle') return;
      stopped = false;
      media.addEventListener('error', onMediaError);
      media.addEventListener('ended', onEnded);
      void acquire(false);
    },
    stop(): void {
      stopped = true;
      generation += 1;
      cancelTimer();
      media.removeEventListener('error', onMediaError);
      media.removeEventListener('ended', onEnded);
      // Clear the source so no in-flight range request carries a live credential onward.
      media.src = '';
      emit({ phase: 'idle', reason: null, attempt: 0, credentialExpiresAt: null });
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
