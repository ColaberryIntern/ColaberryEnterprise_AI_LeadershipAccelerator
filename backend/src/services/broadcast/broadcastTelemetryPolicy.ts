/**
 * broadcastTelemetryPolicy.ts — every measurement rule, as pure functions.
 *
 * WHY THE RULES LIVE APART FROM THE WRITES. This is the one write path in the build whose
 * volume scales with AUDIENCE rather than with producers, and the rules governing it are the
 * ones most easily got wrong in a way nobody notices: a viewer counted twice because they
 * opened a second tab, watch time credited for an hour the viewer spent asleep, a staff
 * account inflating a business number. None of that needs a database to be decided, so none
 * of it is decided near one. Everything here is total, synchronous and fixture-testable.
 *
 * THE RULE THAT SHAPES THE WHOLE MODULE: a client may never supply its own identity, role,
 * paid status or an authoritative count (metrics dictionary, rule 3). A heartbeat carries only
 * what the browser legitimately knows — which occurrence, which tab, what the element is
 * doing, and whether the viewer asked for this — and every other field is derived server-side
 * from the authenticated session. `rejectUntrustedFields` exists so a client that tries
 * anyway gets an error instead of being silently ignored, because silence looks like success.
 *
 * WHAT THESE NUMBERS ARE NOT. Observed playback signals, never attention. A fresh heartbeat
 * means an element reported itself playing, not that a person watched. Nothing here is
 * entitlement truth or billing truth; `access_mode` is recorded as the SERVER's decision at
 * measurement time purely so the splits can be reported, and it is derived telemetry that may
 * be deleted by occurrence id at any time.
 */

/** What the element is doing. The client's only legitimate state claim. */
export type PlaybackBeatState = 'playing' | 'buffering' | 'paused' | 'ended';

/**
 * Why playback is happening. `deliberate` requires an explicit act — pressing Watch, Play,
 * unmute, expand. `auto` is a player that began muted on its own. The metrics dictionary
 * forbids merging these: auto exposure is never reported as audience interest.
 */
export type ViewerIntent = 'deliberate' | 'auto';

/** The server's entitlement decision at measurement time. Never a client assertion. */
export type MeasuredAccessMode = 'free' | 'preview' | 'paid' | 'private';

export interface TelemetryConfig {
  appHeartbeatSeconds: number;
  appActiveWindowSeconds: number;
  playbackHeartbeatSeconds: number;
  viewerExpirySeconds: number;
  bufferingGraceSeconds: number;
}

/**
 * Bounds for the settings above.
 *
 * These are settings so load can be re-evaluated without a deploy (metrics dictionary), which
 * makes an operator typo the realistic failure mode, and both directions hurt: a 1-second
 * heartbeat turns every viewer into a load test, and a 3600-second expiry leaves "watching
 * now" an hour stale while still claiming to be now.
 */
export const TELEMETRY_BOUNDS = {
  appHeartbeatSeconds: { min: 10, max: 300, def: 30 },
  appActiveWindowSeconds: { min: 30, max: 900, def: 90 },
  playbackHeartbeatSeconds: { min: 5, max: 120, def: 15 },
  viewerExpirySeconds: { min: 15, max: 600, def: 45 },
  bufferingGraceSeconds: { min: 0, max: 120, def: 20 },
} as const;

export const TELEMETRY_SETTING_KEYS: Record<keyof TelemetryConfig, string> = {
  appHeartbeatSeconds: 'live_app_heartbeat_seconds',
  appActiveWindowSeconds: 'live_app_active_window_seconds',
  playbackHeartbeatSeconds: 'live_playback_heartbeat_seconds',
  viewerExpirySeconds: 'live_viewer_expiry_seconds',
  bufferingGraceSeconds: 'live_buffering_grace_seconds',
};

/** One setting, clamped, with NaN treated as absent rather than as a number. */
export function resolveSeconds(raw: unknown, bound: { min: number; max: number; def: number }): number {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
  // NaN survives Math.min/Math.max untouched, so without this an unparseable setting would
  // propagate a NaN window and every freshness comparison would quietly answer false.
  if (!Number.isFinite(n)) return bound.def;
  return Math.min(bound.max, Math.max(bound.min, Math.trunc(n)));
}

/**
 * Build the config from whatever `settingsService` returns.
 *
 * Deliberately total: no throw, no rejection. A broken setting degrades to its documented
 * default rather than taking measurement down, because telemetry must never be able to break
 * the thing it measures.
 */
export function resolveTelemetryConfig(raw: Record<string, unknown> = {}): TelemetryConfig {
  const out = {} as TelemetryConfig;
  (Object.keys(TELEMETRY_BOUNDS) as Array<keyof TelemetryConfig>).forEach((field) => {
    out[field] = resolveSeconds(raw[TELEMETRY_SETTING_KEYS[field]], TELEMETRY_BOUNDS[field]);
  });
  /**
   * The expiry window must outlast the heartbeat that refreshes it, or a viewer who is
   * watching perfectly normally expires between beats and "watching now" oscillates. An
   * operator can set these independently, so the relationship is repaired here rather than
   * trusted — two beats plus a margin is the smallest window that survives one lost beat.
   */
  const floor = out.playbackHeartbeatSeconds * 2 + 5;
  if (out.viewerExpirySeconds < floor) {
    out.viewerExpirySeconds = Math.min(TELEMETRY_BOUNDS.viewerExpirySeconds.max, floor);
  }
  const appFloor = out.appHeartbeatSeconds * 2 + 5;
  if (out.appActiveWindowSeconds < appFloor) {
    out.appActiveWindowSeconds = Math.min(TELEMETRY_BOUNDS.appActiveWindowSeconds.max, appFloor);
  }
  return out;
}

/** Fields a client is never allowed to assert. Named so the error can say which. */
export const UNTRUSTED_FIELDS = [
  'person_id', 'personId', 'enrollment_id', 'enrollmentId', 'user_id', 'userId',
  'is_staff', 'isStaff', 'role', 'access_mode', 'accessMode', 'paid', 'is_paid',
  'entitlement', 'grant', 'count', 'viewers', 'watching_now', 'watch_seconds',
  'watchSeconds', 'peak', 'unique_attendees',
] as const;

/**
 * Reject a payload that tries to supply its own identity, entitlement or counts.
 *
 * Returns the offending field names, empty when clean. The caller answers 400 and names them:
 * a client that believes it is reporting paid viewers must be TOLD it is not, because a
 * silently dropped field is indistinguishable from an accepted one and the number it inflates
 * would be believed.
 */
export function rejectUntrustedFields(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const keys = Object.keys(payload as Record<string, unknown>);
  return UNTRUSTED_FIELDS.filter((f) => keys.includes(f));
}

export interface SessionSnapshot {
  state: PlaybackBeatState;
  /** Epoch ms of the last accepted beat for this tab. */
  lastBeatAt: number;
  /** Epoch ms the element last reported `playing`; null if it never has. */
  lastPlayingAt: number | null;
}

/**
 * Is this tab still to be counted at all?
 *
 * Expiry is the honest half of "watching now": a tab that stops reporting has not told us it
 * stopped watching — the laptop closed, the tunnel dropped, the process died — so after
 * `viewerExpirySeconds` it stops counting rather than counting for ever.
 */
export function isFresh(s: SessionSnapshot, nowMs: number, cfg: TelemetryConfig): boolean {
  const ageSeconds = (nowMs - s.lastBeatAt) / 1000;
  if (!Number.isFinite(ageSeconds) || ageSeconds < 0) return false;
  return ageSeconds <= cfg.viewerExpirySeconds;
}

/**
 * Does this tab count toward `watching_now`?
 *
 * `playing` counts. `paused` and `ended` never do — the dictionary excludes them explicitly,
 * and counting a paused tab is how a "live audience" becomes a count of open browsers.
 * `buffering` counts only within the grace window measured from the last real `playing`,
 * because a viewer fighting a bad connection is still watching, and one who left mid-stall
 * is not.
 */
export function countsAsWatching(s: SessionSnapshot, nowMs: number, cfg: TelemetryConfig): boolean {
  if (!isFresh(s, nowMs, cfg)) return false;
  if (s.state === 'playing') return true;
  if (s.state === 'paused' || s.state === 'ended') return false;
  if (s.lastPlayingAt === null) return false;
  const stalledSeconds = (nowMs - s.lastPlayingAt) / 1000;
  return Number.isFinite(stalledSeconds) && stalledSeconds >= 0
    && stalledSeconds <= cfg.bufferingGraceSeconds;
}

/**
 * Seconds of watch time to credit this person for this beat — the dedup rule.
 *
 * MEASURED FROM THE PERSON, NOT THE TAB, and that single choice is what stops two tabs
 * counting double. The gap since this PERSON was last credited is the only elapsed time that
 * can be claimed, so a second tab beating 1s after the first credits 1s, not another full
 * period. Over a minute, one tab and three tabs both yield about 60 seconds.
 *
 * Capped at two heartbeat periods, which bounds the other direction: a viewer who closes the
 * lid for an hour and returns must not be credited with the hour. It is wall-clock between
 * two observations, deliberately attributed to the smaller of "what elapsed" and "what one
 * missed beat could explain".
 */
export function creditSeconds(
  lastCreditedAt: number | null, nowMs: number, cfg: TelemetryConfig,
): number {
  const cap = cfg.playbackHeartbeatSeconds * 2;
  if (lastCreditedAt === null) return 0; // first beat establishes a baseline, credits nothing
  const gap = (nowMs - lastCreditedAt) / 1000;
  if (!Number.isFinite(gap) || gap <= 0) return 0;
  return Math.min(gap, cap);
}

/**
 * Intent is STICKY once deliberate.
 *
 * A viewer who presses Play and is later auto-resumed by a credential renewal has not become
 * an accidental viewer. Downgrading them would move a real tune-in into the auto-exposure
 * bucket, which the dictionary says must never be reported as interest — so the error would
 * understate the number people actually care about, in the direction that looks modest and is
 * still wrong.
 */
export function resolveIntent(stored: ViewerIntent | null, incoming: ViewerIntent): ViewerIntent {
  return stored === 'deliberate' || incoming === 'deliberate' ? 'deliberate' : 'auto';
}

/**
 * Excluded from business reporting?
 *
 * Staff and test accounts are excluded BY DEFAULT and visible only in diagnostic mode
 * (dictionary rule 1). The exclusion is applied at read time rather than by refusing the
 * write, so a producer watching their own broadcast still sees themselves in diagnostics
 * while never appearing in the audience number they report upward.
 */
export function excludedFromReporting(
  row: { isStaff: boolean; isTest: boolean }, diagnostic = false,
): boolean {
  if (diagnostic) return false;
  return row.isStaff || row.isTest;
}
