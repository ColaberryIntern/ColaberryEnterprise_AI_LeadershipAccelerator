/**
 * storyPoints — ONE answer to "what is a story on this build worth?"
 *
 * Shared by the verifier, which PAYS it (buildVerificationService), and by
 * every surface that SHOWS it before the work is done — the project tree the
 * Projects page renders from, and the Today tile. Ali, 2026-09-11: "the
 * projects should have points instead of the open button, just like the
 * Classroom." A number advertised on a tile has to be the number the student
 * is paid, so the two cannot be computed in two places.
 *
 * The rate is the capstone budget (`points_config` row `project_story_verified`,
 * `award_model = 'budget_per_build'`) split evenly across the stories the
 * verifier judges: the published plan's stories PLUS the Command Center
 * (STORY-000), which the plan deliberately never lists. Demo-prep tasks
 * (`PREP-n`) are not stories and are not paid from this budget; they are
 * priced at flat rates by prepPoints.ts and merged in taskPointsForProject.
 *
 * Fails closed: no published plan → null (nothing to show); budget unset →
 * `per_story` 0, which every consumer treats as "no badge". Never a guess.
 */
import { getPublishedPlan } from '../planStore';
import type { BuildPlan } from '../planContract';
import { COMMAND_CENTER_STORY_ID, COMMAND_CENTER_ACCEPTANCE } from '../commandCenterStory';
import { getBudgetPerUnitXp } from '../../progression/pointsConfigService';
import { prepPointsMap } from './prepPoints';
import type { PlanStorySpec } from './verifyDecision';

/** The points_config key of the per-build budget. */
export const STORY_XP_KEY = 'project_story_verified';

/**
 * The stories the verifier judges — the plan's, PLUS the Command Center.
 *
 * STORY-000 is deliberately kept out of `plan.stories` (it is scaffolding the
 * platform authors, not work the student planned). Its criteria come from
 * COMMAND_CENTER_ACCEPTANCE, the same constant materializeTasks writes onto the
 * task row, so the plan and the row cannot disagree about what it asks for.
 * Deduped defensively: if a plan ever carries a STORY-000 of its own, the plan
 * wins, because the plan is the authority on every story it actually contains.
 */
export function planStorySpecs(plan: Pick<BuildPlan, 'stories'>): PlanStorySpec[] {
  const planSpecs: PlanStorySpec[] = (plan.stories ?? []).map((s) => ({
    id: s.id,
    acceptance: Array.isArray(s.acceptance) ? s.acceptance.map(String) : [],
  }));
  return planSpecs.some((s) => s.id === COMMAND_CENTER_STORY_ID)
    ? planSpecs
    : [...planSpecs, { id: COMMAND_CENTER_STORY_ID, acceptance: [...COMMAND_CENTER_ACCEPTANCE] }];
}

export interface StoryPoints {
  /** What ONE verified story on this build pays. 0 when the budget is unset. */
  per_story: number;
  /** The story ids that are paid at that rate — nothing outside this set earns. */
  story_ids: Set<string>;
  stories_in_plan: number;
}

/** The current rate for a project, or null when it has no published plan yet. */
export async function storyPointsForProject(projectId: string): Promise<StoryPoints | null> {
  const stored = await getPublishedPlan(projectId);
  if (!stored) return null;
  const specs = planStorySpecs(stored.plan);
  const award = await getBudgetPerUnitXp(STORY_XP_KEY, specs.length);
  return { per_story: award.per_unit, story_ids: new Set(specs.map((s) => s.id)), stories_in_plan: specs.length };
}

/** `story_id → points` for the tree mapper: only paid stories, only when the rate is positive. */
export function pointsByStoryId(sp: StoryPoints | null): Map<string, number> {
  const m = new Map<string, number>();
  if (!sp || sp.per_story <= 0) return m;
  for (const id of sp.story_ids) m.set(id, sp.per_story);
  return m;
}

/**
 * Every priced task on a build — stories from the budget, demo-prep tasks at
 * their flat rates (prepPoints.ts). THE entry point for anything that shows a
 * price on a task: the project tree and the Today tile both read this, so a
 * task cannot be priced on one screen and unpriced on another.
 *
 * Prep prices do not depend on the plan, so a build with no published plan
 * still prices its prep tasks; a build with no prep tasks simply has no
 * matching ids. Either half failing closed leaves the other intact.
 */
export async function taskPointsForProject(projectId: string): Promise<Map<string, number>> {
  // Settled, not raced: with Promise.all a second rejection is unhandled once
  // the first has already thrown, and "either half failing leaves the other
  // intact" would be a comment, not a behaviour.
  const [stories, prep] = await Promise.allSettled([
    storyPointsForProject(projectId).then(pointsByStoryId),
    prepPointsMap(),
  ]);
  const out = stories.status === 'fulfilled' ? stories.value : new Map<string, number>();
  if (prep.status === 'fulfilled') for (const [id, pts] of prep.value) out.set(id, pts);
  return out;
}
