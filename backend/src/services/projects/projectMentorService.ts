/**
 * The AI mentor for a PROJECT task.
 *
 * The classroom runtime already has a mentor that coaches rather than answers,
 * carries the learner-360 (persona, competency, assessment history) and
 * remembers the conversation across reloads. A project task deserves the same
 * mentor, not a second, weaker one — so this assembles the task into the
 * context shape that mentor already takes and hands it over.
 *
 * The context is deliberately the WHOLE task: the story, the requirement it
 * fulfils, the guardrails that apply, the acceptance it has to meet, and the
 * Claude Code prompt the student is running. A mentor that can see the prompt
 * can talk about the prompt; one that only sees a title can only be generic.
 */
import { coach, MentorMode } from '../runtime/mentorService';
import StudentTask from '../../models/StudentTask';
import Project from '../../models/Project';
import type { AttachmentRef } from '../agents/tools/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ProjectTaskCtx {
  id: string;
  title: string;
  release: string | null;
  narrative: string | null;
  prompt: string | null;
  acceptance: string[];
  projectName: string;
}

/**
 * Load a task, scoped to the requesting enrollment. Null when it does not exist
 * or belongs to someone else — the caller turns that into a 404, so a wrong id
 * and someone else's id are indistinguishable from outside.
 */
export async function loadOwnedTask(
  enrollmentId: string, projectId: string, taskId: string,
): Promise<ProjectTaskCtx | null> {
  const project: any = await Project.findByPk(projectId);
  if (!project || String(project.enrollment_id) !== String(enrollmentId)) return null;

  // `taskId` may be the row id or the story id — the portal links by story id
  // (STORY-000), which is what a student sees and what survives a republish.
  //
  // The `id` fallback is guarded on the value LOOKING like a uuid. Without that
  // guard an unknown story id ("STORY-999") reached the uuid column, Postgres
  // rejected it with `invalid input syntax for type uuid`, and the route
  // answered 500 where it should have answered 404 — measured against
  // production immediately after deploying this endpoint.
  let task: any = await StudentTask.findOne({ where: { project_id: projectId, story_id: taskId } });
  if (!task && UUID_RE.test(taskId)) {
    task = await StudentTask.findOne({ where: { project_id: projectId, id: taskId } });
  }
  if (!task) return null;

  return {
    id: String(task.story_id || task.id),
    title: task.title || 'Task',
    release: task.release_key ?? null,
    narrative: task.narrative || task.description || null,
    prompt: task.build || null,
    acceptance: Array.isArray(task.acceptance) ? task.acceptance.map(String) : [],
    projectName: project.name || 'your build',
  };
}

/**
 * Coach the student on this task. Mode is the classroom's own vocabulary —
 * hint / explain / review / ask — so the two workspaces behave identically.
 */
export async function coachOnTask(
  enrollmentId: string,
  task: ProjectTaskCtx,
  mode: MentorMode,
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  attachments: AttachmentRef[] = [],
) {
  return coach(
    enrollmentId,
    {
      // Namespaced so a project task's conversation memory can never collide
      // with a Timeline card that happens to share an id.
      id: `project:${task.id}`,
      type: 'project_story',
      title: task.title,
      description: task.narrative,
      student_label: task.release ? `Build · ${task.release}` : 'Build',
      metadata: {
        project: task.projectName,
        acceptance: task.acceptance,
        // The prompt is what they are actually running. Truncated because a
        // 12k-character Command Center prompt would crowd out the rest of the
        // context; the opening is enough for the mentor to know the shape.
        build_prompt: (task.prompt || '').slice(0, 4000),
      },
    },
    mode,
    message,
    history,
    // Straight through — the grant check and the owner check both live in
    // coach()/the tool, so this surface adds no rules of its own.
    attachments,
  );
}
