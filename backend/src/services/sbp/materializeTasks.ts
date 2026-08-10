/**
 * materializeTasks — turn a published plan into the rows the portal renders.
 *
 * THE GAP THIS CLOSES: the orchestrator wrote plans to `build_plans` and
 * committed documents to GitHub, but never created `student_task_lists` /
 * `student_tasks` — the tables the Projects page actually reads. A student
 * could complete a build and see nothing change on screen, because the plan
 * lived only in a table nothing rendered.
 *
 * Releases become lists, stories become tasks, and each task carries its
 * assembled Claude Code prompt in `build` — which is the field the drawer's
 * "Copy prompt" reads.
 *
 * ONE transaction (FR-013): a partial materialization would leave a student
 * with half a plan and no way to tell. Idempotent on `(project_id, story_id)`,
 * so republishing updates in place and never duplicates or regresses a
 * completed task.
 */
import { Transaction } from 'sequelize';
import { sequelize } from '../../config/database';
import StudentTaskList from '../../models/StudentTaskList';
import StudentTask from '../../models/StudentTask';
import { BuildPlan, PlanStory } from './planContract';
import { buildStoryPrompt } from './buildStoryPrompt';

export interface MaterializeResult {
  lists: number;
  tasks: number;
  /** Tasks left alone because the student had already completed them. */
  preservedComplete: number;
}

/**
 * Release gating: every story in r(n) waits on the LAST story of r(n-1), so a
 * student sees later releases visibly locked until the previous one lands.
 * Computed here rather than trusted from the model, which does not reliably
 * emit `blocked_by`.
 */
function gateByRelease(plan: BuildPlan): Map<string, string[]> {
  const ordered = [...plan.releases].sort((a, b) => a.key.localeCompare(b.key));
  const keyStory = new Map<string, string>();
  for (const rel of ordered) {
    const inRel = plan.stories.filter((s) => s.release === rel.key);
    if (inRel.length) keyStory.set(rel.key, inRel[inRel.length - 1].id);
  }
  const gates = new Map<string, string[]>();
  ordered.forEach((rel, i) => {
    const prev = i > 0 ? keyStory.get(ordered[i - 1].key) : undefined;
    for (const s of plan.stories.filter((x) => x.release === rel.key)) {
      gates.set(s.id, prev ? [prev] : []);
    }
  });
  return gates;
}

export async function materializePlanAsTasks(
  projectId: string,
  enrollmentId: string,
  plan: BuildPlan,
  ctx: { repoUrl?: string | null; manifestPaths?: string[] } = {},
): Promise<MaterializeResult> {
  const ordered = [...plan.releases].sort((a, b) => a.key.localeCompare(b.key));
  const gates = gateByRelease(plan);
  const result: MaterializeResult = { lists: 0, tasks: 0, preservedComplete: 0 };

  await sequelize.transaction(async (t: Transaction) => {
    let listPos = 0;
    for (const rel of ordered) {
      const [list] = await StudentTaskList.findOrCreate({
        where: { project_id: projectId, cluster: rel.key },
        defaults: {
          project_id: projectId,
          enrollment_id: enrollmentId,
          cluster: rel.key,
          title: `Release ${rel.key.replace(/^r/, '')} · ${rel.name}`,
          status: 'not_started',
          position: listPos,
        } as any,
        transaction: t,
      });
      await list.update(
        { title: `Release ${rel.key.replace(/^r/, '')} · ${rel.name}`, position: listPos },
        { transaction: t },
      );
      listPos += 1;
      result.lists += 1;

      const inRel = plan.stories.filter((s) => s.release === rel.key);
      let taskPos = 0;
      for (const story of inRel) {
        const attrs = taskAttrs(projectId, list.id, story, plan, gates.get(story.id) ?? [], taskPos, ctx);
        taskPos += 1;

        const [row, created] = await StudentTask.findOrCreate({
          where: { project_id: projectId, story_id: story.id },
          defaults: attrs as any,
          transaction: t,
        });
        if (!created) {
          // Republishing must never un-complete work a student has already done.
          const keepComplete = row.status === 'complete';
          if (keepComplete) result.preservedComplete += 1;
          await row.update(
            { ...attrs, status: keepComplete ? 'complete' : row.status } as any,
            { transaction: t },
          );
        }
        result.tasks += 1;
      }
    }
  });

  return result;
}

function taskAttrs(
  projectId: string,
  listId: string,
  story: PlanStory,
  plan: BuildPlan,
  blockedBy: string[],
  position: number,
  ctx: { repoUrl?: string | null; manifestPaths?: string[] },
) {
  // The prompt is assembled here so it is stored WITH the task — the drawer's
  // "Copy prompt" reads `build` directly and must not need a round trip. If
  // assembly refuses (a path it would cite was never written), fall back to a
  // prompt with no repo context rather than storing nothing: a student with a
  // slightly thinner prompt is far better off than one with an empty button.
  let prompt: string;
  try {
    prompt = buildStoryPrompt(plan, story, { repoUrl: ctx.repoUrl, manifestPaths: ctx.manifestPaths });
  } catch {
    prompt = buildStoryPrompt(plan, story, {});
  }

  return {
    project_id: projectId,
    task_list_id: listId,
    story_id: story.id,
    requirement_key: story.fulfills?.[0] ?? null,
    title: `${story.id} · ${story.title}`,
    description: story.narrative,
    narrative: story.narrative,
    status: 'not_started',
    position,
    owner_agent: story.owner_agent ?? null,
    release_key: story.release,
    acceptance: story.acceptance ?? [],
    fulfills: story.fulfills ?? [],
    build: prompt,
    blocked_by: blockedBy.length ? blockedBy : null,
  };
}
