/**
 * watchProgressMath — the PURE, dependency-free core of the video watch gate.
 * No model / service imports, so it is trivially unit-testable and never drags
 * the heavy Timeline graph into jest. `watchProgressService` composes these with
 * the DB (findOrCreate, JSONB merge). Trust model: clamp every client delta,
 * ratchet all totals monotonically, derive the percentage server-side.
 */

export const DEFAULT_WATCH_PCT = 0.75;
/** Floor for a single beat's credit. Beats arrive ~every 15s of play, so this
 *  is generous for a foreground tab; `beatCeilingS` raises it when the clock
 *  shows the gap was real. */
export const MAX_DELTA_PER_BEAT_S = 45;
/** Fastest playback credited at face value (YouTube's own ceiling is 2x). */
export const MAX_PLAYBACK_RATE = 2.5;
/** Hard ceiling for one beat however long the client was away — bounds what a
 *  forged beat can claim, while still clearing any real throttled gap. */
export const MAX_BEAT_CEILING_S = 900;

/**
 * How much one beat may claim.
 *
 * A flat 45s ceiling silently capped the very gaps this gate most needs to
 * credit: a backgrounded tab is throttled to roughly one sample a minute (the
 * sibling blog and dwell gates already allow 90s for exactly this reason), so
 * a student watching a long video in another tab lost a quarter of every
 * recovered minute. The honest bound is the clock: a client can never have
 * played more than the time that has passed since its previous beat. That is
 * also strictly harder to game than the old constant, which let a caller post
 * 45s as fast as it could open sockets.
 */
export function beatCeilingS(prevLastBeatAt: string | undefined, nowMs: number): number {
  const prevMs = Date.parse(prevLastBeatAt ?? '');
  if (!Number.isFinite(prevMs) || !Number.isFinite(nowMs) || nowMs <= prevMs) return MAX_DELTA_PER_BEAT_S;
  const elapsedS = (nowMs - prevMs) / 1000;
  return Math.min(MAX_BEAT_CEILING_S, Math.max(MAX_DELTA_PER_BEAT_S, elapsedS * MAX_PLAYBACK_RATE));
}

export interface WatchBeat {
  delta_s: number;                 // seconds actually played since the last beat
  position_s?: number | null;      // current playhead
  duration_s?: number | null;      // media duration when the player knows it
  provider?: string | null;        // youtube | vimeo | file | audio | dwell | ...
}

export interface WatchState {
  watched_s: number;
  max_position_s: number;
  duration_s: number;              // 0 = never measurable
  watched_pct: number;             // 0..100, derived server-side
  provider?: string | null;
  last_beat_at?: string;
}

/** PURE — fold one clamped beat into the stored state (monotonic ratchet).
 *
 *  `authoritativeDurationS` — when the server already knows a card's REAL duration
 *  (provider API, not client-reported), pass it here. It PINS duration_s to that
 *  value every call instead of ratcheting the client-reported/fallback duration —
 *  so a bad value recorded before ground truth was known (or before this fix
 *  shipped) can never stay locked in, and the percentage is always computed against
 *  reality. Omitted/0/non-finite: behavior is byte-for-byte identical to before this
 *  parameter existed (the client-trust ratchet), which is the only path Loom/Wistia/
 *  unverified videos ever had and still have. */
export function accumulateWatch(prev: WatchState | null | undefined, beat: WatchBeat, nowIso?: string, authoritativeDurationS?: number | null): WatchState {
  const p: WatchState = prev && typeof prev === 'object'
    ? { watched_s: Number(prev.watched_s) || 0, max_position_s: Number(prev.max_position_s) || 0, duration_s: Number(prev.duration_s) || 0, watched_pct: Number(prev.watched_pct) || 0, provider: prev.provider ?? null }
    : { watched_s: 0, max_position_s: 0, duration_s: 0, watched_pct: 0, provider: null };

  const nowMs = nowIso ? Date.parse(nowIso) : Date.now();
  const ceiling = beatCeilingS(prev?.last_beat_at, nowMs);
  const delta = Math.min(Math.max(Number(beat.delta_s) || 0, 0), ceiling);
  const position = Math.max(Number(beat.position_s) || 0, 0);
  const duration = Math.max(Number(beat.duration_s) || 0, 0);
  const authoritative = Number(authoritativeDurationS);
  const hasAuthoritative = Number.isFinite(authoritative) && authoritative > 0;

  const watched_s = p.watched_s + delta;
  const max_position_s = Math.max(p.max_position_s, position);
  // Ground truth wins outright (pinned, not ratcheted) when known; otherwise the
  // original client-trust ratchet — ANY reported value can only grow, never shrink.
  const duration_s = hasAuthoritative ? authoritative : Math.max(p.duration_s, duration);
  // Never let accumulated time exceed a known duration by more than 2x (replays
  // are fine, runaway clients are not); pct caps at 100 regardless.
  const capped_watched_s = duration_s > 0 ? Math.min(watched_s, duration_s * 2) : watched_s;
  const watched_pct = duration_s > 0 ? Math.min(100, Math.round((capped_watched_s / duration_s) * 100)) : 0;

  return {
    watched_s: Math.round(capped_watched_s * 10) / 10,
    max_position_s: Math.round(max_position_s * 10) / 10,
    duration_s: Math.round(duration_s * 10) / 10,
    watched_pct,
    provider: beat.provider || p.provider || null,
    last_beat_at: nowIso || new Date().toISOString(),
  };
}

/** PURE — true when a card's metadata carries a playable video URL. Mirrors
 *  timelineService.videoFromMetadata's truthiness without importing it. */
export function hasVideoMetadata(metadata: any): boolean {
  const v = metadata && typeof metadata === 'object' ? metadata.video : null;
  return !!(v && typeof v === 'object' && typeof v.url === 'string' && v.url.trim());
}

/** PURE — recompute watched_pct against a newly-known authoritative duration
 *  WITHOUT requiring a new beat. Used at completion-check time so a card whose
 *  stored duration_s was poisoned (by the pre-fix fallback-ratchet bug, or simply
 *  because ground truth wasn't known yet) self-heals the moment ground truth becomes
 *  available — even if the student isn't actively watching right now. No-op when no
 *  authoritative duration is given (or the state is null), so an ungated/unknown
 *  card's behavior is unchanged. */
export function withAuthoritativeDuration(watch: WatchState | null | undefined, authoritativeDurationS?: number | null): WatchState | null {
  if (!watch || typeof watch !== 'object') return watch ?? null;
  const authoritative = Number(authoritativeDurationS);
  if (!Number.isFinite(authoritative) || authoritative <= 0) return watch;
  const watched_s = Number(watch.watched_s) || 0;
  const capped_watched_s = Math.min(watched_s, authoritative * 2);
  const watched_pct = Math.min(100, Math.round((capped_watched_s / authoritative) * 100));
  return { ...watch, duration_s: Math.round(authoritative * 10) / 10, watched_pct };
}

/** PURE — is this card one whose completion requires watching? */
export function isWatchableCard(card: { type: string; metadata?: any }): boolean {
  if (hasVideoMetadata(card.metadata)) return true;
  return card.type === 'testimonial' || card.type === 'podcast';   // per-student resolved media
}

/** PURE — the required watched share (0..1) for a card, or null when ungated.
 *  Precedence: card.completion_rules.video_watched → type completion_rules → default. */
export function requiredWatchPct(
  card: { type: string; metadata?: any; completion_rules?: any },
  typeCompletionRules?: any,
): number | null {
  if (!isWatchableCard(card)) return null;
  const fromCard = Number(card.completion_rules?.video_watched);
  if (Number.isFinite(fromCard) && fromCard > 0 && fromCard <= 1) return fromCard;
  const fromType = Number(typeCompletionRules?.video_watched);
  if (Number.isFinite(fromType) && fromType > 0 && fromType <= 1) return fromType;
  return DEFAULT_WATCH_PCT;
}

/** PURE — does the recorded state satisfy the requirement? Fail-open when no
 *  duration was ever measurable (duration_s === 0 with real accumulated time). */
export function meetsWatchRequirement(watch: WatchState | null | undefined, requiredPct: number): { met: boolean; watched_pct: number; fail_open: boolean } {
  if (!watch || typeof watch !== 'object') return { met: false, watched_pct: 0, fail_open: false };
  const pct = Number(watch.watched_pct) || 0;
  if ((Number(watch.duration_s) || 0) <= 0 && (Number(watch.watched_s) || 0) > 0) {
    return { met: true, watched_pct: pct, fail_open: true };   // unmeasurable player — never trap the student
  }
  return { met: pct >= Math.round(requiredPct * 100), watched_pct: pct, fail_open: false };
}
