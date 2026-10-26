/**
 * govBuildPublish — close the one wiring gap that stops a GOV build project's commits from advancing its stories.
 *
 * THE GAP: govProjectMaterialization decomposes a BuildPlan and writes its releases/stories as student_task_lists +
 * student_tasks, but it never persists the plan to `build_plans`. The SBP commit→story verifier
 * (verifyBuildFromRepo) reads `getPublishedPlan(projectId)` and returns `NoPublishedPlan` when there is none — so a
 * gov-materialized project's commits never verify a story. This module publishes a plan for such a project.
 *
 * THE FIX is a BACKFILL, not a re-decomposition: re-running the AI would produce a DIFFERENT plan than the one the
 * student's tasks were materialized from, so the published plan would disagree with the board. Instead we
 * RECONSTRUCT the plan from the materialized task rows (which ARE the plan the student is building) and publish
 * that, so plan and board stay identical and the verifier matches commits against the exact stories on the board.
 *
 * Idempotent: once a project has a published plan this is a no-op. Safe to call on every build read.
 */
import StudentTaskList from '../../models/StudentTaskList';
import StudentTask from '../../models/StudentTask';
import { getPublishedPlan, getPlan, savePlanDraft, publishPlan } from '../sbp/planStore';
import type { BuildPlan, PlanRelease, PlanStory } from '../sbp/planContract';

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : (v != null && v !== '' ? [String(v)] : []);

/**
 * Rebuild the BuildPlan from a project's materialized rows: releases from student_task_lists (the `prep` list is
 * dropped — it is demo scaffolding, not a build release), stories from student_tasks whose story_id is a real
 * STORY-* id. The verifier only reads story ids + acceptance, both carried verbatim here, so the reconstruction is
 * faithful for verification. Returns null when there are no story tasks (nothing to publish). Pure-ish (DB read only).
 */
export async function reconstructPlanFromTasks(projectId: string): Promise<BuildPlan | null> {
  const [lists, tasks] = await Promise.all([
    StudentTaskList.findAll({ where: { project_id: projectId }, order: [['position', 'ASC']] }) as Promise<any[]>,
    StudentTask.findAll({ where: { project_id: projectId }, order: [['position', 'ASC']] }) as Promise<any[]>,
  ]);
  const storyTasks = tasks.filter((t) => typeof t.story_id === 'string' && /^STORY-/.test(t.story_id));
  if (storyTasks.length === 0) return null;

  const releases: PlanRelease[] = lists
    .filter((l) => l.cluster && String(l.cluster) !== 'prep')
    .map((l, i) => ({ key: String(l.cluster), name: String(l.title ?? l.cluster), goal: '', demo: '', week_start: i + 1, week_end: i + 1 }));
  const releaseKeys = new Set(releases.map((r) => r.key));
  // A story whose release has no list row still needs a release to sit under.
  for (const t of storyTasks) {
    const rk = String(t.release_key ?? 'r0');
    if (!releaseKeys.has(rk)) { releases.push({ key: rk, name: `Release ${rk}`, goal: '', demo: '', week_start: releases.length + 1, week_end: releases.length + 1 }); releaseKeys.add(rk); }
  }

  const stories: PlanStory[] = storyTasks.map((t) => ({
    id: String(t.story_id),
    release: String(t.release_key ?? releases[0]?.key ?? 'r0'),
    title: String(t.title ?? t.story_id),
    narrative: String(t.narrative ?? ''),
    fulfills: asStringArray(t.fulfills),
    owner_agent: String(t.owner_agent ?? ''),
    acceptance: asStringArray(t.acceptance),
    task_guidance: String(t.build ?? ''),
    failure_paths: [],
    blocked_by: asStringArray(t.blocked_by),
  }));

  return { project_name: '', descriptor: 'Reconstructed from materialized gov build tasks for commit verification', requirements: [], releases, stories };
}

export interface EnsurePublishResult { published: boolean; action: 'already' | 'promoted_draft' | 'reconstructed' | 'no_tasks'; }

/**
 * Ensure this gov build project has a PUBLISHED plan so its commits can verify stories. Idempotent + concurrency-safe:
 *   already published        → no-op
 *   a draft exists, unpublished → publish that draft (it is the plan this project was generated with)
 *   no plan row at all (the gov-materialized case) → reconstruct from tasks, save a draft, publish it
 * A concurrent publisher that wins the race is detected on the post-save recheck, so we never double-publish.
 */
export async function ensureGovBuildPlanPublished(projectId: string): Promise<EnsurePublishResult> {
  if (!projectId) return { published: false, action: 'no_tasks' };
  if (await getPublishedPlan(projectId)) return { published: true, action: 'already' };

  const latest = await getPlan(projectId);
  if (latest) {
    try { await publishPlan(projectId, latest.version, latest.plan_sha256); } catch { if (!(await getPublishedPlan(projectId))) throw new Error('publish failed'); }
    return { published: true, action: 'promoted_draft' };
  }

  const plan = await reconstructPlanFromTasks(projectId);
  if (!plan) return { published: false, action: 'no_tasks' };
  // Another caller may have reconstructed + published between our checks; recheck before and after the save.
  if (await getPublishedPlan(projectId)) return { published: true, action: 'already' };
  const draft = await savePlanDraft(projectId, plan, { gate: { ok: true, violations: [] } });
  try {
    await publishPlan(projectId, draft.version, draft.plan_sha256);
  } catch {
    if (!(await getPublishedPlan(projectId))) throw new Error('publish failed');
  }
  return { published: true, action: 'reconstructed' };
}
