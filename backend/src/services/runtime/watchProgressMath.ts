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

/** A half-open span of the media that has actually been played, in seconds. */
export type WatchSegment = [number, number];

export interface WatchState {
  watched_s: number;
  max_position_s: number;
  duration_s: number;              // 0 = never measurable
  watched_pct: number;             // 0..100, derived server-side
  provider?: string | null;
  last_beat_at?: string;
  /** Merged, sorted, disjoint spans actually played. Absent on rows written
   *  before coverage existed — see `accumulateWatch` for how those are handled. */
  segments?: WatchSegment[];
  /** Sum of `segments` lengths. Stored so a read does not have to re-fold them. */
  covered_s?: number;
}

/** Spans this close together are treated as one. Beats land every ~15s of play
 *  and each covers [position - delta, position], so continuous play produces
 *  spans that touch exactly; the tolerance only absorbs rounding jitter. */
const SEGMENT_JOIN_EPSILON_S = 0.5;

/** Bound on stored spans, so a student who seeks constantly cannot grow the
 *  JSONB without limit. On reaching it the two spans separated by the SMALLEST
 *  gap are joined, which credits that gap. That is deliberate: over-crediting a
 *  fraction of a second is a smaller wrong than deleting time a student really
 *  watched, and continuous play never approaches this number anyway. */
const MAX_SEGMENTS = 200;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** PURE — fold one span into a merged, sorted, disjoint set. */
export function mergeSegment(existing: readonly WatchSegment[] | undefined, add: WatchSegment): WatchSegment[] {
  const all = [...(existing ?? []), add]
    .map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as WatchSegment)
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((x, y) => x[0] - y[0]);

  const merged: WatchSegment[] = [];
  for (const [a, b] of all) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1] + SEGMENT_JOIN_EPSILON_S) {
      last[1] = Math.max(last[1], b);
    } else {
      merged.push([a, b]);
    }
  }

  // Over the cap: repeatedly close the narrowest gap. Never drops a span.
  while (merged.length > MAX_SEGMENTS) {
    let at = 0;
    let smallest = Infinity;
    for (let i = 0; i < merged.length - 1; i += 1) {
      const gap = merged[i + 1][0] - merged[i][1];
      if (gap < smallest) { smallest = gap; at = i; }
    }
    merged[at] = [merged[at][0], Math.max(merged[at][1], merged[at + 1][1])];
    merged.splice(at + 1, 1);
  }

  return merged.map(([a, b]) => [round1(a), round1(b)] as WatchSegment);
}

/** PURE — total seconds covered by a disjoint span set. */
export function coveredSeconds(segments: readonly WatchSegment[] | undefined): number {
  if (!Array.isArray(segments)) return 0;
  return round1(segments.reduce((sum, [a, b]) => sum + Math.max(0, b - a), 0));
}

/**
 * PURE — the span set to start from for a row written BEFORE coverage existed.
 *
 * Those rows have no `segments`, and treating them as zero coverage would be a
 * disaster: a student who had honestly watched a whole video would crater from
 * 100% to nothing the moment they pressed play again, and be told to watch it
 * all over. Ratcheting the percentage instead would be worse in the other
 * direction - it would preserve the replay credit this change exists to remove,
 * for every row already in the table, so the new rule would apply to nobody.
 *
 * The seed is `[0, min(max_position_s, watched_s)]`, built only from what was
 * already recorded. Neither bound can over-credit: a student cannot have covered
 * more of the media than the seconds they actually played, nor further than the
 * furthest point they ever reached. It lands exactly where it should on both
 * ends of the honesty range -
 *
 *   watched straight through : max_position ~ duration, watched_s ~ duration
 *                              -> seeded with the whole video, keeps 100%
 *   replayed the first half  : max_position ~ duration/2, watched_s ~ duration
 *                              -> seeded with half, drops to 50%, correctly
 *
 * so the migration needs no backfill and no special case at the call sites.
 */
function seedLegacySegments(watch: Pick<WatchState, 'max_position_s' | 'watched_s'> | null | undefined): WatchSegment[] {
  const reached = Math.max(0, Number(watch?.max_position_s) || 0);
  const played = Math.max(0, Number(watch?.watched_s) || 0);
  const end = Math.min(reached, played);
  return end > 0 ? [[0, round1(end)]] : [];
}

/** PURE — the prior span set: stored spans when present, otherwise the legacy seed. */
function priorSegmentsOf(watch: WatchState | null | undefined, durationS: number): WatchSegment[] {
  const stored = Array.isArray(watch?.segments) ? watch!.segments : seedLegacySegments(watch);
  return clampSegments(stored, durationS);
}

/** PURE — clamp a span set into [0, duration], dropping anything past the end.
 *  Needed when ground truth arrives late, or when a card's video is replaced. */
function clampSegments(segments: readonly WatchSegment[] | undefined, durationS: number): WatchSegment[] {
  if (!Array.isArray(segments) || durationS <= 0) return Array.isArray(segments) ? [...segments] : [];
  return segments
    .map(([a, b]) => [Math.max(0, Math.min(a, durationS)), Math.max(0, Math.min(b, durationS))] as WatchSegment)
    .filter(([a, b]) => b - a > 0);
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
  // Does this player report a real playhead? Coverage is only meaningful if it
  // does. A provider that reports none (an audio element with no position, a
  // dwell beat) keeps the original time-based behaviour rather than being
  // credited 0% forever, which would trap the student on a gate they cannot pass.
  const rawPosition = Number(beat.position_s);
  const hasPlayhead = Number.isFinite(rawPosition) && rawPosition > 0;
  // Ground truth wins outright (pinned, not ratcheted) when known; otherwise the
  // original client-trust ratchet — ANY reported value can only grow, never shrink.
  const duration_s = hasAuthoritative ? authoritative : Math.max(p.duration_s, duration);
  // The playhead ratchet is monotonic, which is correct for ONE video and wrong the
  // moment a card's video is REPLACED: the old media's furthest position outlives it
  // and sits on the new one forever. C118 swapped this card's 213s YouTube video for
  // a 109s mp4 and left 104 of 107 rows claiming a playhead past the end of a video
  // that no longer exists — including one row whose duration_s had already been
  // re-pinned to 109 while max_position_s stayed at 213, which is this ratchet caught
  // in the act. That clamp matters more than it did: `seedLegacySegments` now reads
  // this field to migrate a pre-coverage row, so a playhead left over from a replaced
  // video would seed coverage for a video nobody watched. It still blocks nobody
  // directly - no student-facing code reads it - but it is no longer inert; it did
  // make an audit of this very card reach a false conclusion, which is what an audit
  // field is for. Clamp to ground truth when ground truth is known, and leave the
  // plain ratchet alone when it is not (Loom/Wistia/unverified have no ceiling).
  const ratcheted_position_s = Math.max(p.max_position_s, position);
  const max_position_s = hasAuthoritative ? Math.min(ratcheted_position_s, authoritative) : ratcheted_position_s;
  // Never let accumulated time exceed a known duration by more than 2x (replays
  // are fine, runaway clients are not); pct caps at 100 regardless.
  const capped_watched_s = duration_s > 0 ? Math.min(watched_s, duration_s * 2) : watched_s;

  // ── COVERAGE ──────────────────────────────────────────────────────────────
  // The span this beat actually played is [position - delta, position]. A seek
  // moves `position` without inflating `delta`, so the skipped region is never
  // credited and "scrubbing to the end earns nothing" still holds. Replaying a
  // span already covered adds nothing, which is the whole point of this change:
  // `watched_s` counts seconds spent, and counting those against duration let a
  // student clear a 75% gate having seen only the first half, twice.
  const priorSegments = priorSegmentsOf(prev, duration_s);
  const segments = hasPlayhead
    ? clampSegments(mergeSegment(priorSegments, [Math.max(0, position - delta), position]), duration_s)
    : priorSegments;
  const covered_s = coveredSeconds(segments);

  const coverage_pct = duration_s > 0 ? Math.min(100, Math.round((covered_s / duration_s) * 100)) : 0;
  const time_pct = duration_s > 0 ? Math.min(100, Math.round((capped_watched_s / duration_s) * 100)) : 0;

  // Coverage governs once any span is known. A player that has never reported a
  // playhead produces none, and keeps the time reading rather than being pinned
  // at 0% on a gate it could never pass.
  const watched_pct = segments.length > 0 ? coverage_pct : time_pct;

  return {
    watched_s: round1(capped_watched_s),
    max_position_s: round1(max_position_s),
    duration_s: round1(duration_s),
    watched_pct,
    provider: beat.provider || p.provider || null,
    last_beat_at: nowIso || new Date().toISOString(),
    segments,
    covered_s,
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
 *  card's behavior is unchanged.
 *
 *  `max_position_s` is clamped here for the same reason `accumulateWatch` clamps it:
 *  a state carried over from a replaced video can hold a playhead past the end of
 *  the one now on the card. `watched_s` is deliberately NOT reduced — it is the
 *  student's earned credit, and this function's job is to re-express it against the
 *  real duration, never to take it away. */
export function withAuthoritativeDuration(watch: WatchState | null | undefined, authoritativeDurationS?: number | null): WatchState | null {
  if (!watch || typeof watch !== 'object') return watch ?? null;
  const authoritative = Number(authoritativeDurationS);
  if (!Number.isFinite(authoritative) || authoritative <= 0) return watch;
  const watched_s = Number(watch.watched_s) || 0;
  const capped_watched_s = Math.min(watched_s, authoritative * 2);
  const time_pct = Math.min(100, Math.round((capped_watched_s / authoritative) * 100));
  const max_position_s = Math.min(Number(watch.max_position_s) || 0, authoritative);
  // Re-express coverage against the real duration too, for the same reason the
  // percentage is re-expressed: spans recorded against a wrong (or replaced)
  // duration can sit past the end of the video now on the card.
  const segments = priorSegmentsOf(watch, authoritative);
  const covered_s = coveredSeconds(segments);
  const coverage_pct = Math.min(100, Math.round((covered_s / authoritative) * 100));
  const watched_pct = segments.length > 0 ? coverage_pct : time_pct;
  return {
    ...watch,
    duration_s: round1(authoritative),
    max_position_s: round1(max_position_s),
    watched_pct,
    segments,
    covered_s,
  };
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
