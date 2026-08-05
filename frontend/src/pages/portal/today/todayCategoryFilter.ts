/**
 * todayCategoryFilter — CAPE Phase 5 (design doc §11 "Timeline header", §16
 * Phase 5) real filter-chip classification, replacing the hardcoded-`0`
 * decorative `CATEGORY_LABELS` chips. Pure, no React, no I/O — per
 * frontend/CLAUDE.md's `utils/` convention.
 *
 * Category definitions (grounded against real `type`/`surface`/`kind` values
 * confirmed in `backend/src/services/timeline/typeRegistry.ts` this session
 * — no invented slugs):
 *   - ai_pulse:   the 10 Intelligence Pipeline types (design doc §7 "AI
 *                 Pulse" policy group).
 *   - projects:   `home_surface === 'project'` types (implementation_task,
 *                 project_task, build_story, internship_activity, setup_lab,
 *                 artifact_submission).
 *   - community:  `home_surface === 'community'` types (community_discussion,
 *                 discussion, study_session, community_live_session).
 *   - review:     live/event delivery types (live_class, event,
 *                 demo_tuesday, kes_wednesday, marketing_friday) — session
 *                 replays and scheduled live moments a learner may want to
 *                 revisit, distinct from ongoing community discussion.
 *   - classroom:  a NARROW subset of `my_path` — only the core
 *                 knowledge/instructional curriculum types (deep_dive,
 *                 warmup, knowledge_check, survey, question, reflection,
 *                 announcement). (`overview` was deliberately NOT included —
 *                 that type was fully retired from the registry/DB on
 *                 2026-07-21, see memory `project_overview_type_removal.md`;
 *                 including it would be a dead, unverifiable slug.)
 *   - my_path:    a BROAD bucket — every real, week-bound anchored
 *                 curriculum item (kind==='anchored'), INCLUDING classroom
 *                 items. Logged design decision: "My Path" and "Classroom"
 *                 are not mutually exclusive by design — My Path is "your
 *                 whole personalized path," Classroom is "just the lesson
 *                 content within it." An item can (and often will) belong to
 *                 both; `classifyCategories` returns an array so callers can
 *                 test membership via `.includes()` rather than assuming one
 *                 category per item.
 *
 * An item matching none of the 6 (e.g. an ambient blog/podcast/testimonial)
 * simply has an empty categories array — it still shows under the default
 * "All" filter, just not under any specific chip. This is correct filtering
 * behavior, not a bug.
 */
import type { TodayFeedItem } from './todayFeedApi';

export type Category = 'my_path' | 'ai_pulse' | 'classroom' | 'projects' | 'community' | 'review';
export const ALL_CATEGORIES: Category[] = ['my_path', 'ai_pulse', 'classroom', 'projects', 'community', 'review'];

const AI_PULSE_TYPES = new Set([
  'ai_news_flash', 'ai_research_digest', 'ai_tool_of_the_day', 'ai_video_stream',
  'ai_quote_of_the_day', 'ai_architecture_breakdown', 'build_breakdown',
  'mcp_server_spotlight', 'claude_code_technique', 'market_intelligence',
]);
const PROJECT_TYPES = new Set([
  'implementation_task', 'project_task', 'build_story', 'internship_activity',
  'setup_lab', 'artifact_submission',
]);
const COMMUNITY_TYPES = new Set([
  'community_discussion', 'discussion', 'study_session', 'community_live_session',
]);
const REVIEW_TYPES = new Set([
  'live_class', 'event', 'demo_tuesday', 'kes_wednesday', 'marketing_friday',
]);
const CLASSROOM_TYPES = new Set([
  'deep_dive', 'warmup', 'knowledge_check', 'survey', 'question',
  'reflection', 'announcement',
]);

/** Every category a candidate belongs to (may be more than one — see the
 * my_path/classroom overlap note above; may be empty for unclassified ambient
 * content). */
export function classifyCategories(item: Pick<TodayFeedItem, 'type' | 'kind'>): Category[] {
  const categories: Category[] = [];
  if (AI_PULSE_TYPES.has(item.type)) categories.push('ai_pulse');
  if (PROJECT_TYPES.has(item.type)) categories.push('projects');
  if (COMMUNITY_TYPES.has(item.type)) categories.push('community');
  if (REVIEW_TYPES.has(item.type)) categories.push('review');
  if (item.kind === 'anchored') {
    categories.push('my_path');
    if (CLASSROOM_TYPES.has(item.type)) categories.push('classroom');
  }
  return categories;
}

/** Live counts of `items` per category, for the filter-chip badges. Callers
 * are responsible for labeling these as "currently loaded" counts, not an
 * all-time total across the bottomless feed (execution-contract.md
 * Assumption 7). */
export function countByCategory(items: Array<Pick<TodayFeedItem, 'type' | 'kind'>>): Record<Category, number> {
  const counts: Record<Category, number> = { my_path: 0, ai_pulse: 0, classroom: 0, projects: 0, community: 0, review: 0 };
  for (const item of items) {
    for (const cat of classifyCategories(item)) counts[cat] += 1;
  }
  return counts;
}
