/**
 * projectWriteService — I/O for the Project Backend write API (P1b). This is the
 * FIRST write path onto StudentTask (the existing /decide path mutates
 * RequirementsMap, a different layer — reconciling the two is a P2 concern).
 * All access is scoped to the requesting enrollment. Pure helpers in
 * ./projectWriteDto; read-tree reused from ./projectReadService.
 */
import { Transaction } from 'sequelize';
import { sequelize } from '../../config/database';
import Project from '../../models/Project';
import StudentTaskList from '../../models/StudentTaskList';
import StudentTask from '../../models/StudentTask';
import { createProjectForEnrollment, getProjectByEnrollment } from '../projectService';
import { getOwnedProjectTree } from './projectReadService';
import { importTaskToAttributes, isTaskStatus, type ImportTaskInput } from './projectWriteDto';
import type { ProjectTreeDto } from './projectTreeDto';

export interface ImportListInput { cluster: string; title?: string; position?: number; tasks: ImportTaskInput[]; }
export interface ImportProjectInput { name?: string; lists: ImportListInput[]; }

/** Structured note when an import is refused rather than performed. */
function log(event: string, ctx: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'warn', service: 'project-write',
    event, outcome: 'partial', context: ctx,
  }));
}

/**
 * True when the pipeline has published a plan for this project. Raw SQL rather
 * than a model because build_plans belongs to the SBP layer and importing its
 * model here would tie the legacy write path to the pipeline's schema.
 */
export async function hasPublishedBuild(projectId: string): Promise<boolean> {
  const [rows]: any = await sequelize.query(
    `SELECT 1 FROM build_plans WHERE project_id = $pid AND status = 'published' LIMIT 1`,
    { bind: { pid: projectId } },
  );
  return Array.isArray(rows) && rows.length > 0;
}

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
 * Set a task's status by its client-facing `story_id`, scoped to the student's
 * ACTIVE project. This is the write-through path the localStorage store uses:
 * it holds `story_id` (the same key it imported with), never the backend UUID.
 * Null if the student has no active project or the story isn't found there.
 */
export async function setTaskStatusByStory(
  enrollmentId: string,
  storyId: string,
  status: string,
): Promise<{ id: string; story_id: string; status: string } | null> {
  if (!isTaskStatus(status)) {
    const e: any = new Error('Invalid status');
    e.status = 400;
    throw e;
  }
  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) return null;
  const task = await StudentTask.findOne({ where: { project_id: project.id, story_id: storyId } });
  if (!task) return null;
  await StudentTask.update({ status }, { where: { id: task.id } });
  return { id: String(task.id), story_id: storyId, status };
}

/**
 * Import a client project (the localStorage projectsStore) into the persisted
 * backend: get-or-create the student's project, then findOrCreate lists (by
 * cluster) and tasks (by story_id / requirement_key). Idempotent — existing rows
 * are preserved (not overwritten), so re-import never clobbers progress. Returns
 * the resulting project tree.
 *
 * TRANSACTIONAL (SBP-REQ-v1 FR-013): the whole plan lands in one transaction, so
 * a failure part-way through rolls back completely rather than stranding a
 * half-written project the caller cannot repair by retrying. Production carried
 * exactly that state — 3 tasks and 2 lists left behind by an import that threw on
 * its 4th task (docs/BUILD_PIPELINE_AUDIT.md, finding F-1).
 */
export async function importProject(enrollmentId: string, payload: ImportProjectInput): Promise<ProjectTreeDto | null> {
  // Outside the transaction: the project is a get-or-create that must survive a
  // rolled-back import (the student still owns the project, just not this plan).
  const project = await createProjectForEnrollment(enrollmentId);

  // MEASURED, 2026-08-13, production. `createProjectForEnrollment` returns the
  // ACTIVE project, and the portal mirrors localStorage on load. A build was
  // published at 08:30 and became active; the student opened the portal at
  // 08:35 and their stale client-side project was written straight over it —
  // all 18 tasks rewritten, because both plans number their stories STORY-001
  // upward and story_id is the identity key. The published lists were left
  // empty beside six new ones. The header above calls this import idempotent
  // and says re-import never clobbers progress; against a published plan that
  // was not true.
  //
  // A published plan is authored by the pipeline, not by the browser, so the
  // browser is never the newer truth. Import stays available for the legacy
  // client-only projects it was written for.
  if (await hasPublishedBuild(project.id)) {
    log('project_import_skipped_published', {
      enrollmentId, projectId: project.id, lists: payload.lists.length,
      reason: 'project has a published build plan; client state is not authoritative',
    });
    return getOwnedProjectTree(enrollmentId, project.id);
  }

  await sequelize.transaction(async (t: Transaction) => {
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
        transaction: t,
      });
      listPos++;
      let taskPos = 0;
      for (const task of l.tasks) {
        const attrs = importTaskToAttributes(task, project.id, list.id, taskPos);
        taskPos++;
        // Task identity is story_id. requirement_key is NOT an identity key —
        // many stories fulfil one requirement (FR-012) — so it is only a
        // fallback for legacy requirement-based rows that carry no story_id.
        const where = attrs.story_id
          ? { project_id: project.id, story_id: attrs.story_id }
          : attrs.requirement_key
            ? { project_id: project.id, requirement_key: attrs.requirement_key }
            : null;
        if (where) {
          const [row, created] = await StudentTask.findOrCreate({ where, defaults: attrs, transaction: t });
          if (!created) {
            // Mirror the client's current content onto the existing row. Status is
            // MONOTONIC on this bulk path: a completed task never regresses because a
            // different device (with stale localStorage) mirrored it as not_started.
            // Un-completing, if it ever exists, goes through the explicit PATCH paths.
            const nextStatus = row.status === 'complete' && attrs.status !== 'complete'
              ? 'complete'
              : attrs.status;
            await row.update({
              title: attrs.title,
              description: attrs.description,
              status: nextStatus,
              position: attrs.position,
              owner_agent: attrs.owner_agent,
              execution_mode: attrs.execution_mode,
              release_key: attrs.release_key,
              acceptance: attrs.acceptance,
              build: attrs.build,
              blocked_by: attrs.blocked_by,
              task_list_id: attrs.task_list_id,
            }, { transaction: t });
          }
        } else {
          await StudentTask.create(attrs, { transaction: t });
        }
      }
    }
  });

  // Read the tree AFTER the transaction commits so the caller never sees rows
  // that a later rollback would erase.
  return getOwnedProjectTree(enrollmentId, project.id);
}
