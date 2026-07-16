/**
 * watchProgressMath — the PURE, dependency-free core of the video watch gate.
 * No model / service imports, so it is trivially unit-testable and never drags
 * the heavy Timeline graph into jest. `watchProgressService` composes these with
 * the DB (findOrCreate, JSONB merge). Trust model: clamp every client delta,
 * ratchet all totals monotonically, derive the percentage server-side.
 */

export const DEFAULT_WATCH_PCT = 0.75;
/** Beats arrive ~every 15s of play; anything above this per beat is clamped. */
export const MAX_DELTA_PER_BEAT_S = 45;

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

/** PURE — fold one clamped beat into the stored state (monotonic ratchet). */
export function accumulateWatch(prev: WatchState | null | undefined, beat: WatchBeat, nowIso?: string): WatchState {
  const p: WatchState = prev && typeof prev === 'object'
    ? { watched_s: Number(prev.watched_s) || 0, max_position_s: Number(prev.max_position_s) || 0, duration_s: Number(prev.duration_s) || 0, watched_pct: Number(prev.watched_pct) || 0, provider: prev.provider ?? null }
    : { watched_s: 0, max_position_s: 0, duration_s: 0, watched_pct: 0, provider: null };

  const delta = Math.min(Math.max(Number(beat.delta_s) || 0, 0), MAX_DELTA_PER_BEAT_S);
  const position = Math.max(Number(beat.position_s) || 0, 0);
  const duration = Math.max(Number(beat.duration_s) || 0, 0);

  const watched_s = p.watched_s + delta;
  const max_position_s = Math.max(p.max_position_s, position);
  const duration_s = Math.max(p.duration_s, duration);
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
