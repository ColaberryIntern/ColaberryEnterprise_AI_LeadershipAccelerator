/**
 * projectWriteService — I/O for the Project Backend write API (P1b). This is the
 * FIRST write path onto StudentTask (the existing /decide path mutates
 * RequirementsMap, a different layer — reconciling the two is a P2 concern).
 * All access is scoped to the requesting enrollment. Pure helpers in
 * ./projectWriteDto; read-tree reused from ./projectReadService.
 */
import Project from '../../models/Project';
import StudentTaskList from '../../models/StudentTaskList';
import StudentTask from '../../models/StudentTask';
import { createProjectForEnrollment } from '../projectService';
import { getOwnedProjectTree } from './projectReadService';
import { importTaskToAttributes, isTaskStatus, type ImportTaskInput } from './projectWriteDto';
import type { ProjectTreeDto } from './projectTreeDto';

export interface ImportListInput { cluster: string; title?: string; position?: number; tasks: ImportTaskInput[]; }
export interface ImportProjectInput { name?: string; lists: ImportListInput[]; }

/** Set a task's status — scoped to the requesting enrollment. Null if not found / not owned. */
export async function setTaskStatus(
  enrollmentId: string,
  taskId: string,
  status: string,
): Promise<{ id: string; status: string } | null> {
  if (!isTaskStatus(status)) {
    const e: any = new Error('Invalid status');
    e.status = 400;
    throw e;
  }
  const task = await StudentTask.findByPk(taskId);
  if (!task) return null;
  const project = await Project.findByPk(task.project_id);
  if (!project || String((project as any).enrollment_id) !== String(enrollmentId)) return null;
  await StudentTask.update({ status }, { where: { id: taskId } });
  return { id: taskId, status };
}

/**
 * Import a client project (the localStorage projectsStore) into the persisted
 * backend: get-or-create the student's project, then findOrCreate lists (by
 * cluster) and tasks (by story_id / requirement_key). Idempotent — existing rows
 * are preserved (not overwritten), so re-import never clobbers progress. Returns
 * the resulting project tree.
 */
export async function importProject(enrollmentId: string, payload: ImportProjectInput): Promise<ProjectTreeDto | null> {
  const project = await createProjectForEnrollment(enrollmentId);
  let listPos = 0;
  for (const l of payload.lists) {
    const [list] = await StudentTaskList.findOrCreate({
      where: { project_id: project.id, cluster: l.cluster },
      defaults: {
        project_id: project.id,
        enrollment_id: enrollmentId,
        cluster: l.cluster,
        title: l.title || l.cluster,
        status: 'not_started',
        position: typeof l.position === 'number' ? l.position : listPos,
      },
    });
    listPos++;
    let taskPos = 0;
    for (const t of l.tasks) {
      const attrs = importTaskToAttributes(t, project.id, list.id, taskPos);
      taskPos++;
      const where = attrs.story_id
        ? { project_id: project.id, story_id: attrs.story_id }
        : attrs.requirement_key
          ? { project_id: project.id, requirement_key: attrs.requirement_key }
          : null;
      if (where) {
        await StudentTask.findOrCreate({ where, defaults: attrs });
      } else {
        await StudentTask.create(attrs);
      }
    }
  }
  return getOwnedProjectTree(enrollmentId, project.id);
}
