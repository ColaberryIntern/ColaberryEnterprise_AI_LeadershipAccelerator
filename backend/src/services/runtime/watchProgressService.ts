/**
 * watchProgressService — server-side truth for "how much of this card's video
 * (or podcast audio) has this student actually watched", and the completion
 * gate that blocks point collection until the required share (default 75%)
 * is reached.
 *
 * The pure math (clamp/ratchet/threshold) lives in watchProgressMath (no model
 * imports, unit-tested there); this module composes it with the DB. Trust model
 * (mirrors communityService presence): the client reports small play-time
 * deltas; the server clamps + ratchets — a client can never submit a percentage,
 * rewind the counter, or leap ahead. Scrubbing to the end earns nothing.
 *
 * Storage: `timeline_card_progress.analytics.watch` (JSONB, previously unused)
 * via the certificateService read-merge-update pattern. Threshold source: the
 * card's `completion_rules.video_watched` → the type's DB `completion_rules`
 * → DEFAULT_WATCH_PCT. Fail-open: when no duration was ever measurable the
 * gate does not block (nobody gets stuck on an unmeasurable player).
 */
import TimelineCard from '../../models/TimelineCard';
import TimelineCardProgress from '../../models/TimelineCardProgress';
import CurriculumTypeDefinition from '../../models/CurriculumTypeDefinition';
import { videoFromMetadata } from '../timeline/timelineService';
import { getAssignedTestimonialDurationS } from '../timeline/networkVideoService';
import { getAssignedPodcastDurationS } from '../timeline/podcastMediaService';
import { accumulateWatch, requiredWatchPct, meetsWatchRequirement, withAuthoritativeDuration, WatchBeat, WatchState } from './watchProgressMath';
import { isCardServable } from '../timeline/curriculumScope';

export { DEFAULT_WATCH_PCT, MAX_DELTA_PER_BEAT_S, accumulateWatch, requiredWatchPct, meetsWatchRequirement, isWatchableCard } from './watchProgressMath';
export type { WatchBeat, WatchState } from './watchProgressMath';

/**
 * Ground truth for this (card, enrollment)'s video, when known: a fixed authored
 * video's real provider duration, else the specific testimonial/podcast this
 * student was assigned. Null when nothing authoritative is known yet (Loom/Wistia,
 * unverified videos, or the card isn't a video at all) — the gate then falls back
 * to the original client-trust ratchet, unchanged.
 */
export async function resolveAuthoritativeDurationS(card: TimelineCard, enrollmentId: string): Promise<number | null> {
  const fixed = videoFromMetadata(card.metadata);
  if (fixed?.duration_seconds) return fixed.duration_seconds;
  if (card.type === 'testimonial') return getAssignedTestimonialDurationS(enrollmentId, card.id);
  if (card.type === 'podcast') return getAssignedPodcastDurationS(enrollmentId, card.id);
  return null;
}

/** Record one heartbeat and return the gate status for the UI. */
export async function recordWatchBeat(enrollmentId: string, cardId: string, beat: WatchBeat) {
  const card = await TimelineCard.findByPk(cardId);
  if (!card || !isCardServable(card.visibility)) throw Object.assign(new Error('Card not available'), { status: 404 });

  const [progress] = await TimelineCardProgress.findOrCreate({
    where: { card_id: cardId, enrollment_id: enrollmentId },
    defaults: { card_id: cardId, enrollment_id: enrollmentId, status: 'available' },
  });

  const authoritativeDurationS = await resolveAuthoritativeDurationS(card, enrollmentId);

  // Read-merge-update the analytics blob (certificateService pattern).
  const analytics = progress.analytics && typeof progress.analytics === 'object' ? { ...progress.analytics } : {};
  const watch = accumulateWatch(analytics.watch, beat, undefined, authoritativeDurationS);
  analytics.watch = watch;
  await progress.update({ analytics, started_at: progress.started_at || new Date() });

  const required = requiredWatchPct(card, await typeCompletionRules(card.type));
  if (required == null) return { watched_pct: watch.watched_pct, required_pct: null, met: true };
  const verdict = meetsWatchRequirement(watch, required);
  return { watched_pct: verdict.watched_pct, required_pct: Math.round(required * 100), met: verdict.met };
}

async function typeCompletionRules(slug: string): Promise<any> {
  try {
    const def = await CurriculumTypeDefinition.findOne({ where: { slug }, attributes: ['completion_rules'] });
    return (def as any)?.completion_rules ?? null;
  } catch {
    return null;
  }
}

export interface WatchVerdict { watched_pct: number; required_pct: number | null; met: boolean }

/**
 * The one verdict both the UI and the completion gate read, so the button can
 * never say "go" while the server says "no". required_pct null = type isn't
 * watch-gated; a completed card is always met (never re-gated).
 */
export async function watchVerdictFor(enrollmentId: string, card: TimelineCard): Promise<WatchVerdict> {
  const required = requiredWatchPct(card, await typeCompletionRules(card.type));
  if (required == null) return { watched_pct: 0, required_pct: null, met: true };
  const requiredPct = Math.round(required * 100);

  const progress = await TimelineCardProgress.findOne({ where: { card_id: card.id, enrollment_id: enrollmentId } });
  if (progress?.status === 'completed') return { watched_pct: requiredPct, required_pct: requiredPct, met: true };

  const storedWatch = (progress?.analytics && typeof progress.analytics === 'object' ? progress.analytics.watch : null) as WatchState | null;
  // Recompute against ground truth at check time too — not just on the next beat —
  // so a card poisoned by a stale/incorrect duration self-heals the moment an
  // authoritative duration is known, even if the student isn't actively watching
  // right now (e.g. they finished earlier and are completing the card later).
  const authoritativeDurationS = await resolveAuthoritativeDurationS(card, enrollmentId);
  const watch = withAuthoritativeDuration(storedWatch, authoritativeDurationS);
  const verdict = meetsWatchRequirement(watch, required);
  return { watched_pct: verdict.watched_pct, required_pct: requiredPct, met: verdict.met };
}

/** Current verdict for a card, no write — the UI hydrates its button from this on open. */
export async function getWatchVerdict(enrollmentId: string, cardId: string): Promise<WatchVerdict> {
  const card = await TimelineCard.findByPk(cardId);
  if (!card || !isCardServable(card.visibility)) throw Object.assign(new Error('Card not available'), { status: 404 });
  return watchVerdictFor(enrollmentId, card);
}

/**
 * The completion gate — called by onCardCompleted BEFORE the status flip.
 * Throws { status: 422 } with a student-readable message when the requirement
 * is not met. Idempotent completions (already completed) never re-gate.
 */
export async function assertWatchRequirement(enrollmentId: string, card: TimelineCard): Promise<void> {
  const verdict = await watchVerdictFor(enrollmentId, card);
  if (verdict.met) return;
  throw Object.assign(
    new Error(`Watch at least ${verdict.required_pct}% to collect your points — you're at ${verdict.watched_pct}%.`),
    { status: 422, code: 'watch_requirement', watched_pct: verdict.watched_pct, required_pct: verdict.required_pct },
  );
}
