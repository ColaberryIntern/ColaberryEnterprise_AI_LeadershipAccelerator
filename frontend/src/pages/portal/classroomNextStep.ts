import { TimelineFeedCard } from '../../components/timeline/TimelineCard';

/**
 * The first not-yet-completed card in an already section-ordered list (the
 * same order ClassroomPage's weekCards feed renders) — pure so it's
 * unit-testable without a component mount.
 */
export function nextIncompleteCard(weekCards: TimelineFeedCard[]): TimelineFeedCard | null {
  return weekCards.find((c) => c.status !== 'completed') ?? null;
}
