import { TimelineFeedCard } from '../../components/timeline/TimelineCard';

/**
 * The first not-yet-completed card in an already section-ordered list (the
 * same order ClassroomPage's weekCards feed renders) — pure so it's
 * unit-testable without a component mount.
 */
export function nextIncompleteCard(weekCards: TimelineFeedCard[]): TimelineFeedCard | null {
  return weekCards.find((c) => c.status !== 'completed') ?? null;
}

/** Section-bucket rank (pre_class -> learn -> ... -> reflect -> share ->
 *  advance), falling back to the end for an unknown bucket. */
export function bucketOrderIndex(bucket: string, buckets: string[]): number {
  const i = buckets.indexOf(bucket);
  return i < 0 ? buckets.length : i;
}

/** The same section-then-order comparator ClassroomPage sorts a week's cards
 *  with — shared so Today's "active next step" and Classroom's own default
 *  week/card selection can never quietly diverge. */
export function bySectionOrder(buckets: string[]) {
  return (a: TimelineFeedCard, b: TimelineFeedCard): number =>
    bucketOrderIndex(a.bucket, buckets) - bucketOrderIndex(b.bucket, buckets) || a.order - b.order;
}

/**
 * The single card an ENROLLED (non-explorer) student should do next, across
 * the whole curriculum: the same "first week that still has something left,
 * in section order" Classroom itself defaults to when a student opens it —
 * so Today's CTA and Classroom's own next-step card always agree.
 */
export function findActiveNextCard(cards: TimelineFeedCard[], buckets: string[]): TimelineFeedCard | null {
  const weeks = Array.from(
    new Set(cards.filter((c) => typeof c.week === 'number' && c.week! > 0).map((c) => c.week as number)),
  ).sort((a, b) => a - b);
  const activeWeek = weeks.find((w) => cards.some((c) => c.week === w && c.status !== 'completed'));
  if (activeWeek == null) return null;
  const weekCards = cards.filter((c) => c.week === activeWeek).sort(bySectionOrder(buckets));
  return nextIncompleteCard(weekCards);
}

/** Total points across the learning/builder/community buckets — the single
 *  "+N pts" figure shown on a next-step card to make finishing it enticing. */
export function sumCardPoints(points: TimelineFeedCard['points'] | null | undefined): number {
  if (!points) return 0;
  return (points.learning ?? 0) + (points.builder ?? 0) + (points.community ?? 0);
}
