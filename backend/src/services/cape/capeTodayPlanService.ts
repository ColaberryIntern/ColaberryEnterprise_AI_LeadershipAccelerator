/**
 * capeTodayPlanService — CAPE Phase 5 finite "Today Plan" assembly (design
 * doc §10, §16 Phase 5). Reuses the EXISTING Today feed composer for
 * candidate retrieval (execution-contract.md Assumption 5) — this file adds
 * a classification/selection layer on TOP of `getTodayPage`'s real output,
 * never a second/parallel query path.
 *
 * 5 slots, per §10:
 *   1. next_best   — exactly one primary recommendation (the first anchored/
 *                     week-bound candidate, in the composer's own order —
 *                     ranked by Phase 4 when it's on, else the composer's
 *                     current ordering, per the task's explicit fallback
 *                     instruction).
 *   2. foundation   — one foundation/bridge item (a second anchored item;
 *                     cohort learners may get a real week-bound item here
 *                     too — see the cohort note below).
 *   3. practice     — one practice/check/build item.
 *   4. ai_pulse     — one current AI Pulse item.
 *   5. review       — one review/community/live item.
 *
 * A slot is OMITTED (not padded) when no candidate qualifies — a learner who
 * has completed everything available gets a shorter (possibly empty) plan,
 * never a throw (Build-Break-Harden boundary case).
 *
 * Cohort note (Assumption 1's documented simplification): for a non-Explorer
 * (`enrollment_type !== 'explorer'`) enrollment, if no AI-Pulse/practice/
 * community-typed candidate exists to naturally fill the foundation slot, a
 * SECOND week-bound anchored item fills it instead — implementing "a cohort
 * learner's plan includes time-sensitive Classroom work and may be longer".
 *
 * CAPE Phase 6 (design doc §12 "Pacing controls"): 2 previously-nonexistent
 * knobs are now read from `capeGovernancePolicyService.getCurrentGovernancePolicy()`
 * (fail-soft — degrades to the byte-identical defaults on any read failure):
 *   - `review_slot_share` / `ai_pulse_slot_share`: 0 deterministically skips
 *     that slot's `pickFirst` call entirely; the default (1) reproduces the
 *     exact prior unconditional-attempt behavior.
 *   - `daily_plan_target_minutes`: after the plan is assembled, trailing
 *     slots are dropped (review, then ai_pulse, then practice — next_best and
 *     foundation are NEVER dropped) until `estimated_total_minutes` is at or
 *     under the target. The default (999) is high enough that no realistic
 *     real plan can exceed it, so this is a no-op until an admin lowers it.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { getTodayPage, extractCapeExplanation, type TodayFeedItem } from '../timeline/todayFeedComposer';
import { getLifecycleMode, type LifecycleMode } from './capeLifecycleModeService';
import { enrichCard, type CardChips } from './capeCardEnrichmentService';
import { getCurrentGovernancePolicy } from './capeGovernancePolicyService';

const CANDIDATE_BATCH_SIZE = 30;

const AI_PULSE_TYPES = new Set([
  'ai_news_flash', 'ai_research_digest', 'ai_tool_of_the_day', 'ai_video_stream',
  'ai_quote_of_the_day', 'ai_architecture_breakdown', 'build_breakdown',
  'mcp_server_spotlight', 'claude_code_technique', 'market_intelligence',
]);
const PRACTICE_TYPES = new Set([
  'knowledge_check', 'survey', 'question', 'evaluation', 'certification_exercise',
  'prompt_lab', 'prompt_challenge', 'implementation_task', 'setup_lab',
  'artifact_submission', 'project_task', 'build_story', 'internship_activity',
]);
const REVIEW_TYPES = new Set([
  'discussion', 'community_discussion', 'study_session', 'community_live_session',
  'live_class', 'event', 'demo_tuesday', 'kes_wednesday', 'marketing_friday',
]);

export type TodayPlanSlot = 'next_best' | 'foundation' | 'practice' | 'ai_pulse' | 'review';

export interface TodayPlanItem extends TodayFeedItem {
  slot: TodayPlanSlot;
  chips: CardChips;
}

export interface TodayPlanResponse {
  mode: LifecycleMode;
  items: TodayPlanItem[];
  estimated_total_minutes: number;
}

async function isCohortLearner(enrollmentId: string): Promise<boolean> {
  try {
    const rows = await sequelize.query<{ enrollment_type: string | null }>(
      `SELECT enrollment_type FROM enrollments WHERE id = :eid`,
      { replacements: { eid: enrollmentId }, type: QueryTypes.SELECT },
    );
    return rows[0]?.enrollment_type !== 'explorer';
  } catch {
    return false; // fail-soft: unknown -> treat as free/Explorer (the more conservative, shorter plan)
  }
}

/**
 * Pick the first not-yet-used candidate matching `predicate`, in composer
 * order. Marks it used (mutates `used`) so later slots never double-pick it.
 */
function pickFirst(
  candidates: TodayFeedItem[],
  used: Set<number>,
  predicate: (item: TodayFeedItem) => boolean,
): TodayFeedItem | null {
  for (const item of candidates) {
    if (used.has(item.position)) continue;
    if (predicate(item)) {
      used.add(item.position);
      return item;
    }
  }
  return null;
}

export async function getTodayPlan(enrollmentId: string): Promise<TodayPlanResponse> {
  const [{ mode }, page, cohort, pacing] = await Promise.all([
    getLifecycleMode(enrollmentId),
    getTodayPage(enrollmentId, 0, CANDIDATE_BATCH_SIZE),
    isCohortLearner(enrollmentId),
    getCurrentGovernancePolicy(),
  ]);
  const candidates = page.items;
  const used = new Set<number>();

  const nextBest = pickFirst(candidates, used, (i) => i.kind === 'anchored');
  let foundation = pickFirst(candidates, used, (i) => i.kind === 'anchored');
  const practice = pickFirst(candidates, used, (i) => PRACTICE_TYPES.has(i.type));
  // CAPE Phase 6 pacing knobs: a 0 share deterministically skips this slot
  // entirely (never attempted); the default (1) reproduces the exact prior
  // unconditional pickFirst call.
  const aiPulse = pacing.ai_pulse_slot_share > 0
    ? pickFirst(candidates, used, (i) => AI_PULSE_TYPES.has(i.type))
    : null;
  let review = pacing.review_slot_share > 0
    ? pickFirst(candidates, used, (i) => REVIEW_TYPES.has(i.type))
    : null;

  // Cohort note: if the foundation slot came up empty (e.g. only 1 anchored
  // item total) and this is a cohort learner, let a 3rd anchored item cover
  // it — a cohort learner's plan may run longer with time-sensitive
  // Classroom work (§10). Never applies to a free/Explorer learner.
  if (!foundation && cohort) {
    foundation = pickFirst(candidates, used, (i) => i.kind === 'anchored');
  }
  // Same cohort allowance for review, since community/live content may not
  // exist in every candidate batch. Still respects review_slot_share === 0.
  if (!review && cohort && pacing.review_slot_share > 0) {
    review = pickFirst(candidates, used, (i) => i.kind === 'anchored');
  }

  const slotted: Array<{ slot: TodayPlanSlot; item: TodayFeedItem | null }> = [
    { slot: 'next_best', item: nextBest },
    { slot: 'foundation', item: foundation },
    { slot: 'practice', item: practice },
    { slot: 'ai_pulse', item: aiPulse },
    { slot: 'review', item: review },
  ];

  let items: TodayPlanItem[] = [];
  for (const { slot, item } of slotted) {
    if (!item) continue; // omitted, not padded — Build-Break-Harden boundary case
    const chips = await enrichCard(enrollmentId, item, extractCapeExplanation(item));
    items.push({ ...item, slot, chips });
  }

  // CAPE Phase 6 pacing knob: trim trailing slots (review, then ai_pulse, then
  // practice — next_best/foundation are NEVER dropped) if the assembled plan
  // exceeds daily_plan_target_minutes. Default (999) makes this a no-op for
  // any realistic real plan — unchanged behavior until an admin lowers it.
  const dropOrder: TodayPlanSlot[] = ['review', 'ai_pulse', 'practice'];
  let dropIdx = 0;
  const totalMinutes = () => items.reduce((sum, i) => sum + (i.estimated_time ?? 0), 0);
  while (totalMinutes() > pacing.daily_plan_target_minutes && dropIdx < dropOrder.length) {
    const slotToDrop = dropOrder[dropIdx];
    items = items.filter((i) => i.slot !== slotToDrop);
    dropIdx += 1;
  }

  const estimated_total_minutes = totalMinutes();

  return { mode, items, estimated_total_minutes };
}
