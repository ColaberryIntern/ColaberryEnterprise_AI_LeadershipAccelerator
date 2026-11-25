/**
 * feedWatchState — each feed tile's own watch progress, in the feed payload.
 *
 * Reported by the QA tester 2026-11-24: a tile for a part-watched video showed
 * nothing until it was opened and played again. The cause was that the feed
 * carried no watch state at all: the tile started every render at "nothing
 * recorded" and learned a percentage only from its own playback heartbeat. So
 * progress made yesterday - or made in the drawer a moment ago - was invisible
 * on the card.
 *
 * The fix belongs HERE rather than in a fetch from the tile. The feed already
 * loads every card's progress row to compute `status`, and the watch blob lives
 * on that same row (`analytics.watch`), so the state is already in hand: a tile
 * that fetched its own verdict would mean one request per video card on screen,
 * which is a worse bug than the one being fixed.
 *
 * Only cards with something actually recorded are resolved, so the per-student
 * duration lookups for testimonial/podcast cards are bounded by "videos this
 * student has really started", not by the size of the feed.
 */
// Type-only: this module reads rows it is HANDED, and never queries. That keeps
// it unit-testable without standing up sequelize.
import type TimelineCard from '../../models/TimelineCard';
import type TimelineCardProgress from '../../models/TimelineCardProgress';
import {
  requiredWatchPct,
  meetsWatchRequirement,
  withAuthoritativeDuration,
  WatchState,
} from '../runtime/watchProgressMath';
import { resolveAuthoritativeDurationS } from '../runtime/watchProgressService';
import { resumePointOf } from '../runtime/watchResumePoint';

/** A tile's watch state: how far the gate says they are, and where to resume. */
export interface FeedCardWatch {
  watched_pct: number;
  /** null = this type carries no watch requirement (so there is no bar to reach). */
  required_pct: number | null;
  met: boolean;
  position_s: number | null;
  duration_s: number | null;
}

/** The watch blob stored on a progress row, or null when nothing was recorded. */
function storedWatchOf(progress: TimelineCardProgress | undefined): WatchState | null {
  const analytics = progress?.analytics;
  if (!analytics || typeof analytics !== 'object') return null;
  const watch = (analytics as Record<string, unknown>).watch as WatchState | null | undefined;
  if (!watch || typeof watch !== 'object') return null;
  // A row can exist with an empty blob (created by a beat that credited nothing).
  const played = Number(watch.watched_s) || 0;
  const reached = Number(watch.max_position_s) || 0;
  return played > 0 || reached > 0 ? watch : null;
}

/**
 * Watch state per card id, for the cards that have any. Cards with nothing
 * recorded are absent from the map, so the tile renders exactly as it does
 * today for a video nobody has opened.
 */
export async function buildFeedWatchMap(
  enrollmentId: string,
  cards: TimelineCard[],
  progressByCard: Map<string, TimelineCardProgress>,
  typeRulesBySlug: Map<string, unknown>,
): Promise<Map<string, FeedCardWatch>> {
  const started = cards
    .map((card) => ({ card, stored: storedWatchOf(progressByCard.get(card.id)) }))
    .filter((row): row is { card: TimelineCard; stored: WatchState } => row.stored !== null);

  const resolved = await Promise.all(started.map(async ({ card, stored }): Promise<[string, FeedCardWatch]> => {
    // Same ground-truth self-heal the drawer's verdict applies, so a tile and the
    // card it opens can never quote two different percentages.
    const authoritativeDurationS = await resolveAuthoritativeDurationS(card, enrollmentId);
    const watch = withAuthoritativeDuration(stored, authoritativeDurationS) || stored;
    const required = requiredWatchPct(card, typeRulesBySlug.get(card.type));
    const resume = resumePointOf(watch);

    if (required == null) {
      // Ungated: there is no bar, but there is still a place they left off.
      return [card.id, { watched_pct: Number(watch.watched_pct) || 0, required_pct: null, met: true, ...resume }];
    }
    const verdict = meetsWatchRequirement(watch, required);
    return [card.id, {
      watched_pct: verdict.watched_pct,
      required_pct: Math.round(required * 100),
      met: verdict.met,
      ...resume,
    }];
  }));

  return new Map(resolved);
}
