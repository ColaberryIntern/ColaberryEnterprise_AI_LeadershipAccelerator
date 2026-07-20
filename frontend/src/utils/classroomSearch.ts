import type { TimelineFeedCard } from '../components/timeline/TimelineCard';

/**
 * classroomSearch — pure, testable filtering for the Classroom week feed.
 *
 * The feed can run long (19+ cards per week), so a named item like "Prompt Lab"
 * sits far down and is slow to find by scrolling. ClassroomPage wires these
 * helpers to a search box that narrows the feed live as the student types.
 *
 * Kept free of React/DOM so it unit-tests without a renderer.
 */

/**
 * The lowercase searchable text for a card: every field a student would
 * plausibly type to find it — its label, title, subtitle, type, and the nested
 * lesson/course/blog/week titles. Body copy is deliberately excluded so results
 * stay name-tight instead of surfacing every card that merely mentions the word.
 */
export function cardHaystack(c: TimelineFeedCard): string {
  return [
    c.student_label,
    c.title,
    c.subtitle,
    c.type.replace(/_/g, ' '),
    c.content?.title,
    c.course?.name,
    c.blog?.title,
    c.week_title,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Split a raw query into lowercase search tokens (whitespace-separated, empties dropped). */
export function tokenizeQuery(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Every token must appear (AND match) so "prompt lab" finds a card labelled
 * "Prompt Lab" even when the words live in separate fields. An empty token list
 * matches every card (no active query ⇒ show the full feed).
 */
export function cardMatchesTokens(c: TimelineFeedCard, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const hay = cardHaystack(c);
  return tokens.every((t) => hay.includes(t));
}

/** Filter a card list by a raw query string. Empty/whitespace query returns the list unchanged. */
export function filterCardsByQuery(cards: TimelineFeedCard[], query: string): TimelineFeedCard[] {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return cards;
  return cards.filter((c) => cardMatchesTokens(c, tokens));
}
