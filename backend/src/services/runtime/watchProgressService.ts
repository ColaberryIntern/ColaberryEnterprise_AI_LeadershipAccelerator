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
import { accumulateWatch, requiredWatchPct, meetsWatchRequirement, WatchBeat, WatchState } from './watchProgressMath';

export { DEFAULT_WATCH_PCT, MAX_DELTA_PER_BEAT_S, accumulateWatch, requiredWatchPct, meetsWatchRequirement, isWatchableCard } from './watchProgressMath';
export type { WatchBeat, WatchState } from './watchProgressMath';

/** Record one heartbeat and return the gate status for the UI. */
export async function recordWatchBeat(enrollmentId: string, cardId: string, beat: WatchBeat) {
  const card = await TimelineCard.findByPk(cardId);
  if (!card || card.visibility !== 'published') throw Object.assign(new Error('Card not available'), { status: 404 });

  const [progress] = await TimelineCardProgress.findOrCreate({
    where: { card_id: cardId, enrollment_id: enrollmentId },
    defaults: { card_id: cardId, enrollment_id: enrollmentId, status: 'available' },
  });

  // Read-merge-update the analytics blob (certificateService pattern).
  const analytics = progress.analytics && typeof progress.analytics === 'object' ? { ...progress.analytics } : {};
  const watch = accumulateWatch(analytics.watch, beat);
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

/**
 * The completion gate — called by onCardCompleted BEFORE the status flip.
 * Throws { status: 422 } with a student-readable message when the requirement
 * is not met. Idempotent completions (already completed) never re-gate.
 */
export async function assertWatchRequirement(enrollmentId: string, card: TimelineCard): Promise<void> {
  const required = requiredWatchPct(card, await typeCompletionRules(card.type));
  if (required == null) return;

  const progress = await TimelineCardProgress.findOne({ where: { card_id: card.id, enrollment_id: enrollmentId } });
  if (progress?.status === 'completed') return;   // re-complete stays idempotent, never re-gated

  const watch = (progress?.analytics && typeof progress.analytics === 'object' ? progress.analytics.watch : null) as WatchState | null;
  const verdict = meetsWatchRequirement(watch, required);
  if (verdict.met) return;

  const requiredPct = Math.round(required * 100);
  throw Object.assign(
    new Error(`Watch at least ${requiredPct}% to collect your points — you're at ${verdict.watched_pct}%.`),
    { status: 422, code: 'watch_requirement', watched_pct: verdict.watched_pct, required_pct: requiredPct },
  );
}
