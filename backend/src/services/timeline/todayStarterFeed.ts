/**
 * todayStarterFeed — C107 (C98 recommendation 1, approved by Ali 2026-11-03).
 *
 * Until an Explorer's first win, Today serves five beginner-safe items instead of the bottomless feed: the first
 * lesson, the Week 0 warmup, one short video, one testimonial and one blog post. No paging, no variety stream. After
 * the first win the full feed comes back unchanged.
 *
 * Why (C98 audit, Nov 2026): the server generated 21 to 40 items for 400 of 405 new Explorers in their first hour,
 * about 17 of them videos, and 3 of 14,049 were ever opened. Volume was not buying attention.
 *
 * This is a SERVE-time selection over the already-materialised feed, never a change to what is generated: the
 * impression rows, their positions and the Explorer Growth signals read from them stay exactly as before. Production,
 * 3 Nov: all 166 Explorers who started in the previous week had every starter type in their first 14 rows.
 *
 * Not established: that five items will be opened more than thirty-five. This is a test; C98's feed query is the
 * baseline and C107's `today_card_events` (seen + opened) is how the result is read.
 *
 * Failure: every gate input fails toward the FULL feed. A failed first-win read (null), a failed tier read, or the
 * kill switch (TODAY_EXPLORER_STARTER_FEED=false) all serve the page exactly as before C107.
 */
import { env } from '../../config/env';
import { isFreePreviewTier } from '../access/contentEntitlement';
import { hasFirstWin } from '../explorerFirstWin';
import type { TodayFeedItem } from './todayFeedTypes';

export const STARTER_FEED_SIZE = 5;

/** Anchored card types that are not "the first lesson": they fill their own slot, or are not learning. */
const NOT_A_LESSON = new Set(['warmup', 'video', 'announcement', 'community_discussion']);

const pointsOf = (it: TodayFeedItem) =>
  Object.values(it.points || {}).reduce((n: number, v) => n + (typeof v === 'number' ? v : 0), 0);
const isCard = (it: TodayFeedItem) => it.kind === 'anchored' && !!it.card_id && it.status !== 'completed';
const byPosition = (a: TodayFeedItem, b: TodayFeedItem) => a.position - b.position;

/** First lesson: one already started, otherwise the earliest week's first point-bearing card (same rule as the banner). */
function pickLesson(items: TodayFeedItem[]): TodayFeedItem | undefined {
  const lessons = items.filter((it) => isCard(it) && !NOT_A_LESSON.has(it.type) && pointsOf(it) > 0);
  const started = lessons.filter((it) => it.status === 'in_progress').sort(byPosition)[0];
  if (started) return started;
  const week = (it: TodayFeedItem) => (typeof it.week === 'number' ? it.week : Number.MAX_SAFE_INTEGER);
  return [...lessons].sort((a, b) => week(a) - week(b) || byPosition(a, b))[0];
}

/** One short video: the shortest by estimated time (unknown counts as longest), then the earliest placed. */
function pickVideo(items: TodayFeedItem[]): TodayFeedItem | undefined {
  const mins = (it: TodayFeedItem) => (typeof it.estimated_time === 'number' ? it.estimated_time : Number.MAX_SAFE_INTEGER);
  return items.filter((it) => isCard(it) && it.type === 'video').sort((a, b) => mins(a) - mins(b) || byPosition(a, b))[0];
}

const firstOfType = (items: TodayFeedItem[], type: string, kind: TodayFeedItem['kind']) =>
  items.filter((it) => it.type === type && it.kind === kind && it.status !== 'completed').sort(byPosition)[0];

/**
 * Pure: the starter lineup from the served (already filtered) items, in a fixed order whatever the visit's shuffle.
 * A slot with no candidate is skipped, so this returns at most five and never invents an item.
 */
export function pickStarterItems(served: TodayFeedItem[]): TodayFeedItem[] {
  const slots = [
    pickLesson(served),
    firstOfType(served, 'warmup', 'anchored'),
    pickVideo(served),
    firstOfType(served, 'testimonial', 'ambient'),
    firstOfType(served, 'blog', 'ambient'),
  ];
  const seen = new Set<string>();
  return slots.filter((it): it is TodayFeedItem => {
    if (!it || seen.has(it.ref)) return false;
    seen.add(it.ref);
    return true;
  }).slice(0, STARTER_FEED_SIZE);
}

/** True only for an Explorer the server positively knows has no first win yet. Anything unknown means the full feed. */
export async function isStarterFeedLearner(enrollmentId: string): Promise<boolean> {
  if (!env.todayExplorerStarterFeed) return false;
  const [explorer, firstWin] = await Promise.all([isFreePreviewTier(enrollmentId), hasFirstWin(enrollmentId)]);
  return explorer === true && firstWin === false;
}
