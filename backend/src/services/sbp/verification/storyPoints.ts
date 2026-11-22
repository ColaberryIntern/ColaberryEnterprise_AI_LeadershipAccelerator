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
import { CONNECTED_DEMO_STORY_ID, CONNECTED_DEMO_ACCEPTANCE } from '../connectedDemoStory';
import {
  domainCommandCenterStoryId,
  COMMAND_CENTER_ACCEPTANCE as DOMAIN_COMMAND_CENTER_ACCEPTANCE,
} from '../../agentDomain/agentDomainCommandCenterStory';
import { domainKeyForProject } from '../../agentDomain/agentDomainCommandCenterForSync';
import { getBudgetPerUnitXp } from '../../progression/pointsConfigService';
import { connectedDemoMaterializedFor } from '../connectedDemoFlag';
import { prepPointsMap } from './prepPoints';
import type { PlanStorySpec } from './verifyDecision';

/** The points_config key of the per-build budget. */
export const STORY_XP_KEY = 'project_story_verified';

/**
 * The Command Center story id for ONE project — namespaced on an agent-domain
 * board, bare everywhere else.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Quincy Ninying, 1 November 2026, from reading the code alone: "the verifier
 * adds plain STORY-000 (storyPoints.ts:46-48). It then finds no task with that
 * id and logs sbp_verification_task_missing. If so, no commit of mine can
 * verify it, however the id is written." He was right, and production agreed —
 * `sbp_verification_task_missing storyId="STORY-000"` on the platform project
 * at 15:00:05Z and on marketing at 16:08:35Z that day.
 *
 * The ten agent-domain boards carry only the NAMESPACED row
 * (`platform.STORY-000`). Measured across all ten: bare `STORY-000` rows = 0,
 * namespaced = 10. So appending the bare id asked the verifier to judge a story
 * that cannot exist, and the first task of the first release on every domain
 * board could be built, pushed and rendered but never verified — and therefore
 * never paid and never counted toward a milestone.
 *
 * This is the SAME contract gap AF3.9 closed in `renderDocs.ts` and
 * `sbpRoutes.ts`, one consumer further on. `COMMAND_CENTER_STORY_ID` has twelve
 * consumers; each one that compares against the bare constant is wrong for a
 * domain project, and the cure is to resolve the id from the project rather
 * than assume it.
 *
 * ── WHY IT RETURNS THE CRITERIA TOO, AND NOT JUST THE ID ────────────────────
 *
 * There are TWO constants named `COMMAND_CENTER_ACCEPTANCE`: the SBP's, with
 * five generic lines, and the agent-domain one, with six. Resolving the id
 * alone would have had the verifier judge `platform.STORY-000` against the
 * SBP's five — grading a builder on criteria they were never shown, which is
 * worse than the missing task it replaced, because it fails quietly.
 *
 * So the id and its criteria come from ONE call and travel together. This is
 * the rule `commandCenterTaskColumns.ts` already carries for the board row,
 * where splitting them put 19 of 20 live builds behind by three versions.
 *
 * Fails SOFT, deliberately: any failure returns the bare spec, which is exactly
 * today's behaviour. A verifier run must not die because a domain lookup did.
 */
export async function commandCenterSpecForProject(projectId: string): Promise<PlanStorySpec> {
  const bare: PlanStorySpec = {
    id: COMMAND_CENTER_STORY_ID,
    acceptance: [...COMMAND_CENTER_ACCEPTANCE],
  };
  if (!projectId) return bare;
  try {
    const domainKey = await domainKeyForProject(projectId);
    if (!domainKey) return bare;
    return {
      id: domainCommandCenterStoryId(domainKey),
      acceptance: [...DOMAIN_COMMAND_CENTER_ACCEPTANCE],
    };
  } catch (err) {
    const e = err as Error;
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'sbp-verification',
      event: 'command_center_spec_lookup_failed',
      outcome: 'partial',
      error_class: e?.constructor?.name ?? 'Error',
      context: { projectId, message: e?.message, fell_back_to: COMMAND_CENTER_STORY_ID },
    }));
    return bare;
  }
}

/**
 * The stories the verifier judges — the plan's, PLUS the Command Center.
 *
 * STORY-000 is deliberately kept out of `plan.stories` (it is scaffolding the
 * platform authors, not work the student planned). Its criteria come from
 * COMMAND_CENTER_ACCEPTANCE, the same constant materializeTasks writes onto the
 * task row, so the plan and the row cannot disagree about what it asks for.
 * Deduped defensively: if a plan ever carries a STORY-000 of its own, the plan
 * wins, because the plan is the authority on every story it actually contains.
 *
 * `commandCenter` is the story to append, and it defaults to the bare SBP one
 * so this stays pure, synchronous and callable from a test with no database.
 * Callers that know their project resolve it first with
 * `commandCenterSpecForProject` — see the note on that function for what went
 * wrong when they did not.
 */
export function planStorySpecs(
  plan: Pick<BuildPlan, 'stories'>,
  commandCenter: PlanStorySpec = {
    id: COMMAND_CENTER_STORY_ID,
    acceptance: [...COMMAND_CENTER_ACCEPTANCE],
  },
  /**
   * Append STORY-900's spec too. OMITTED MEANS OFF, so every existing caller judges exactly the
   * stories it judges today.
   *
   * Without this the Connected Demo task can be materialized, built and pushed, and then never
   * verified and never paid: the verifier only grades stories it has a spec for. That is
   * precisely the gap AF3.9 hit for domain Command Centers, and it is being closed in the same
   * change that creates the opportunity for it rather than after somebody loses a week's credit.
   */
  connectedDemo = false,
): PlanStorySpec[] {
  const planSpecs: PlanStorySpec[] = (plan.stories ?? []).map((s) => ({
    id: s.id,
    acceptance: Array.isArray(s.acceptance) ? s.acceptance.map(String) : [],
  }));
  const withCommandCenter = planSpecs.some((s) => s.id === commandCenter.id)
    ? planSpecs
    : [...planSpecs, { id: commandCenter.id, acceptance: [...commandCenter.acceptance] }];

  if (!connectedDemo) return withCommandCenter;
  // The same defensive dedup: a plan carrying its own STORY-900 is the authority on it.
  return withCommandCenter.some((s) => s.id === CONNECTED_DEMO_STORY_ID)
    ? withCommandCenter
    : [...withCommandCenter, {
      id: CONNECTED_DEMO_STORY_ID,
      acceptance: [...CONNECTED_DEMO_ACCEPTANCE],
    }];
}

export interface StoryPoints {
  /** What ONE verified story on this build pays. 0 when the budget is unset. */
  per_story: number;
  /** The story ids that are paid at that rate — nothing outside this set earns. */
  story_ids: Set<string>;
  stories_in_plan: number;
}

/**
 * The current rate for a project, or null when it has no published plan yet.
 *
 * ── WHY STORY-900 IS RESOLVED HERE TOO, AND WHAT IT COST TO MISS IT ─────────
 *
 * This function is the SHOW side; `buildVerificationService` is the PAY side. The header of this
 * file states the rule they both exist to keep: "A number advertised on a tile has to be the
 * number the student is paid, so the two cannot be computed in two places."
 *
 * The first version of the Connected Demo wiring resolved the board row in the verifier and in
 * the milestone count and left this one alone. An independent verifier worked out the
 * consequence, which is arithmetic and not a style point: `getBudgetPerUnitXp` divides the build
 * budget by `specs.length`, so for a build carrying STORY-900 the verifier would pay
 * `budget / (N + 1)` while the project tree and the Today tile advertised `budget / N` for every
 * story on that build. On a 600-point budget with four plan stories plus STORY-000 the tile said
 * 120 and the student was paid 100. STORY-900 itself was absent from `story_ids`, so it showed no
 * price at all while being paid one.
 *
 * Dormant only while no board carries the row, which is exactly the argument for fixing it in the
 * change that turns the flag on rather than after somebody is short-changed.
 */
export async function storyPointsForProject(projectId: string): Promise<StoryPoints | null> {
  const stored = await getPublishedPlan(projectId);
  if (!stored) return null;
  const specs = planStorySpecs(
    stored.plan,
    await commandCenterSpecForProject(projectId),
    await connectedDemoMaterializedFor(projectId),
  );
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
