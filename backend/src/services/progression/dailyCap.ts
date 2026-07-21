/**
 * dailyCap — anti-cheat daily point ceilings (pure / deterministic).
 *
 * Two point categories are farmable by raw volume:
 *   • AMBIENT_LEARNING — the low-value, repeatable "ambient feed" curriculum
 *     types (AI News Flash / Quote of the Day / Tool of the Day / Market
 *     Intelligence / Video Stream / Research Digest). A student could otherwise
 *     grind these for unbounded points. Cap: 100 points/day.
 *   • COMMUNITY — post / comment / like awards. Spam-posting and like-farming
 *     are the classic abuse. Cap: 75 points/day.
 *
 * Everything here is a pure function of its inputs — no I/O, no clock, no model
 * access — so it is trivially unit-testable and deterministic. The caller
 * supplies the running "already awarded today" total for the category (see
 * pointsService.sumPointsTodayByEventTypes) and the clamp math lives here.
 *
 * The mechanism is flag-gated at the call sites (POINTS_DAILY_CAPS_ENABLED,
 * default OFF); this module holds only the constants + the clamp.
 */

/** Max points/day a student can bank from the ambient learning feed. */
export const AMBIENT_LEARNING_CAP = 100;

/** Max points/day a student can bank from community actions. */
export const COMMUNITY_CAP = 75;

/**
 * The low-value, repeatable ambient-feed curriculum TYPE slugs (all
 * home_surface:'today' in the type registry). Membership is by card type, since
 * these are the grindable ones; the higher-value intel types (architecture
 * breakdown, build breakdown, MCP spotlight, Claude Code technique) are
 * deliberately excluded — they are not spam-completable in the same way.
 */
export const AMBIENT_LEARNING_TYPES: readonly string[] = [
  'ai_news_flash',
  'ai_quote_of_the_day',
  'ai_tool_of_the_day',
  'market_intelligence',
  'ai_video_stream',
  'ai_research_digest',
];

/**
 * The dedicated points-ledger event_type an ambient completion banks under when
 * the cap is enabled. A plain 'card_complete' can't be told apart from real
 * coursework, so ambient completions record under this distinct type — that is
 * what makes the day's ambient total measurable in isolation. (Only used on the
 * flag-ON path; with the cap OFF, ambient completions record as 'card_complete'
 * exactly as today.)
 */
export const AMBIENT_LEARNING_EVENT_TYPE = 'ambient_learning';

/** The community-action ledger event_types the COMMUNITY cap sums over. */
export const COMMUNITY_EVENT_TYPES: readonly string[] = [
  'community_post',
  'community_comment',
  'community_like',
];

/** Whether a curriculum type is a capped ambient-learning type. */
export function isAmbientLearningType(type: string): boolean {
  return AMBIENT_LEARNING_TYPES.includes(type);
}

/** Whether a ledger event_type is a capped community-action type. */
export function isCommunityEventType(eventType: string): boolean {
  return COMMUNITY_EVENT_TYPES.includes(eventType);
}

export interface DailyCapInput {
  /** Points already banked today in this category (Central day). */
  alreadyAwardedToday: number;
  /** Points this action would award before the cap is applied. */
  proposedAward: number;
  /** The category's daily ceiling. */
  cap: number;
}

/**
 * Clamp an award so the day's category total never exceeds `cap`. Returns the
 * points that may actually be awarded: the full proposal when there is room, the
 * remaining headroom when only part fits, and 0 once the cap is reached or
 * exceeded. Pure and deterministic; negative inputs are floored to 0 so a bad
 * caller can never produce a negative award.
 */
export function applyDailyCap({ alreadyAwardedToday, proposedAward, cap }: DailyCapInput): number {
  const already = Math.max(0, alreadyAwardedToday);
  const proposed = Math.max(0, proposedAward);
  const remaining = Math.max(0, cap - already);
  return Math.min(proposed, remaining);
}
