/**
 * blogTagger — PURE match-ready tags + scoring for blog posts (sibling of
 * services/podcast/podcastTagger.ts). Tags come from the SAME rule vocabulary
 * the student-signal side uses (networkVideoMatch.USER_TAG_RULES) plus
 * curriculum-topic rules, so post tags, student tags, and week tags all live in
 * one vocabulary and overlap scoring works across all three.
 */
import { USER_TAG_RULES, matchScore } from '../timeline/networkVideoMatch';

/** Curriculum-topic vocabulary — what a WEEK is about / what a post teaches. */
export const BLOG_TOPIC_RULES: Array<[RegExp, string]> = [
  [/claude|anthropic/i, 'claude'],
  [/prompt/i, 'prompt-engineering'],
  [/\bagent(s|ic)?\b/i, 'agents'],
  [/\bmcp\b|model context protocol/i, 'mcp'],
  [/workflow|automation|automat/i, 'automation'],
  [/strateg|roadmap|leadership|executive/i, 'ai-strategy'],
  [/ai system|system design|architect/i, 'ai-systems'],
  [/\bintern(s|ship)?\b/i, 'interns'],
  [/career|job|hiring|hired|layoff|resume|interview/i, 'career'],
  [/data analy|analytics|analyst/i, 'data-analytics'],
  [/\bapi\b/i, 'api'],
  [/\bskills?\b/i, 'skills'],
  [/future of work/i, 'future-of-work'],
  [/grading|classroom|education|bootcamp|student/i, 'education'],
  [/business|company|companies|coo|operations/i, 'business'],
];

/** PURE — derive stored tags for one post (rule hits only — clean, no raw tokens;
 *  free-text matching happens at select time via matchScore's text pass). */
export function deriveBlogTags(title: string, excerpt?: string | null): string[] {
  const hay = `${title || ''} ${excerpt || ''}`;
  const tags = new Set<string>(['blog']);
  for (const [re, tag] of USER_TAG_RULES) if (re.test(hay)) tags.add(tag);
  for (const [re, tag] of BLOG_TOPIC_RULES) if (re.test(hay)) tags.add(tag);
  return [...tags];
}

/**
 * PURE — deterministic score of one post for one student on one week.
 * Week match is weighted ABOVE student match (Ali: pick "matched to the
 * student/week the student is on"); a mild recency bonus (≤1, fading over
 * ~2 years) breaks ties toward newer posts. Jitter is added by the caller.
 */
export function scoreBlogPost(
  tags: string[],
  text: string,
  userTags: Set<string>,
  weekTags: Set<string>,
  publishedAt?: string | Date | null,
  nowMs: number = Date.now(),
): number {
  const user = matchScore(tags, text, userTags);
  const week = matchScore(tags, text, weekTags);
  let recency = 0;
  if (publishedAt) {
    const ageDays = (nowMs - new Date(publishedAt).getTime()) / 86_400_000;
    if (Number.isFinite(ageDays)) recency = Math.max(0, 1 - ageDays / 730);
  }
  return user + 1.5 * week + recency;
}
