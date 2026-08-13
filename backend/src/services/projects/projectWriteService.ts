/**
 * projectWriteService — I/O for the Project Backend write API (P1b). This is the
 * FIRST write path onto StudentTask (the existing /decide path mutates
 * RequirementsMap, a different layer — reconciling the two is a P2 concern).
 * All access is scoped to the requesting enrollment. Pure helpers in
 * ./projectWriteDto; read-tree reused from ./projectReadService.
 *
 * ONE RULE ABOVE ALL OTHERS IN THIS FILE: a client may never write `complete`.
 * Ownership is not verification, and points ride on completion. Client paths go
 * through `assertClientMaySet`; the platform's path is
 * `markTaskVerifiedComplete`, which no route may call.
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

/** Structured note for a write this service refused, downgraded, or granted. */
function log(
  event: string,
  ctx: Record<string, unknown>,
  level: 'info' | 'warn' = 'warn',
  outcome: 'success' | 'partial' | 'failure' = 'partial',
): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(), level, service: 'project-write',
    event, outcome, context: ctx,
  }));
}

/**
 * The statuses a CLIENT may set on its own task. Moving a task between these
 * three is the student's own planning: it asserts nothing about the work and
 * earns nothing, so it needs no proof.
 *
 * `complete` is deliberately absent, and that absence is the point. Completion
 * is an assertion that the work was actually DONE, and points are awarded on
 * the strength of it — a client asserting it about itself is not evidence of
 * anything. Before this list existed, any participant could open devtools and
 * PATCH their own stories to `complete`, which made the entire verification
 * chain theatre. Completion is now granted by the platform:
 * `markTaskVerifiedComplete` below is the only path to it.
 *
 * This is an allowlist rather than "TASK_STATUSES minus complete" on purpose.
 * A denylist inherits every status added upstream later; an allowlist makes a
 * new reward-bearing status opt IN here, in front of a human.
 */
const CLIENT_SETTABLE_STATUSES = ['not_started', 'in_progress', 'blocked'] as const;
type ClientSettableStatus = typeof CLIENT_SETTABLE_STATUSES[number];

/**
 * Sent back with the 409. It tells the client how completion actually happens,
 * because the honest answer to "why did my checkbox bounce?" is a mechanism,
 * not a permission error.
 */
export const CLIENT_COMPLETE_REFUSAL =
  'Completion is granted by the platform once your work is verified, not set by the client. '
  + 'Move the task to in_progress and submit it; it becomes complete when verification confirms the work.';

/**
 * Gate every client-originated status write. Throws before any I/O, so a
 * refused write cannot have touched the row.
 *
 * The refusal is LOUD (409), never a silent no-op: swallowing it would leave
 * the UI rendering a `complete` the server never stored, and the student would
 * only discover the divergence when the points failed to arrive.
 *
 * Declared as an assertion so the compiler carries the narrowing downstream:
 * past this call `status` is provably one of the three, and a later edit that
 * tried to write `complete` from a client path would not type-check.
 */
function assertClientMaySet(
  status: string,
  ctx: Record<string, unknown>,
): asserts status is ClientSettableStatus {
  if (!isTaskStatus(status)) {
    const e: any = new Error('Invalid status');
    e.status = 400;
    e.error_class = 'ValidationError';
    throw e;
  }
  if ((CLIENT_SETTABLE_STATUSES as readonly string[]).includes(status)) return;
  // Worth a log line on its own: a burst of these is somebody probing the API,
  // not a UI bug.
  log('task_status_client_complete_refused', { ...ctx, requested: status }, 'warn', 'failure');
  const e: any = new Error(CLIENT_COMPLETE_REFUSAL);
  e.status = 409;
  e.error_class = 'ForbiddenStateTransition';
  throw e;
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

/**
 * Set a task's status — scoped to the requesting enrollment. Null if not found
 * / not owned. Client-originated, so `complete` is refused with a 409 (see
 * assertClientMaySet): owning a task was never authority to award yourself
 * credit for finishing it.
 */
export async function setTaskStatus(
  enrollmentId: string,
  taskId: string,
  status: string,
): Promise<{ id: string; status: string } | null> {
  // Before any lookup: a refused write must not have read or touched the row,
  // and refusing identically for a task that does not exist leaks nothing.
  assertClientMaySet(status, { enrollmentId, taskId });
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
 *
 * Same client, same rules: `complete` is refused here too. Closing only the
 * by-id route would have left this one as an unlocked back door onto the
 * identical write.
 */
export async function setTaskStatusByStory(
  enrollmentId: string,
  storyId: string,
  status: string,
): Promise<{ id: string; story_id: string; status: string } | null> {
  assertClientMaySet(status, { enrollmentId, storyId });
  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) return null;
  const task = await StudentTask.findOne({ where: { project_id: project.id, story_id: storyId } });
  if (!task) return null;
  await StudentTask.update({ status }, { where: { id: task.id } });
  return { id: String(task.id), story_id: storyId, status };
}

/**
 * What proved the work. Required, and required to name a source: a completion
 * nobody can trace back to a verifier is indistinguishable from the client
 * claim this whole guard exists to stop.
 */
export interface VerificationEvidence {
  /** What verified it — e.g. 'build_pipeline', 'mentor_review', 'admin_override'. */
  source: string;
  /** The traceable handle: a run id, a commit sha, a reviewer's id. */
  ref?: string | null;
  /** Correlation id of the verification run, so a completion traces back to it. */
  correlation_id?: string | null;
}

/**
 * Mark a task verified-complete, stamping student_tasks.verified_at /
 * verified_by — the columns points will be gated on.
 *
 * THIS IS THE ONLY LEGITIMATE WAY A TASK REACHES `complete`. It is
 * deliberately NOT wired to any route, and it takes no enrollmentId, because
 * it is not a request: it is the verification pipeline writing down a
 * conclusion it already reached from server-side evidence. If this ever
 * appears behind an Express handler, the guard in `assertClientMaySet` has
 * been routed around and completion is a client claim again — which is the
 * exact defect this module was changed to close.
 *
 * Scoped by projectId + storyId rather than by enrollment because the pipeline
 * works from a published plan, not from a browser session.
 *
 * Returns null when that story is not in that project, so a caller holding a
 * stale plan writes nothing rather than completing somebody else's row.
 */
export async function markTaskVerifiedComplete(
  projectId: string,
  storyId: string,
  evidence: VerificationEvidence,
): Promise<{ id: string; story_id: string; status: 'complete'; verified_at: Date | string } | null> {
  if (!evidence || typeof evidence.source !== 'string' || !evidence.source.trim()) {
    const e: any = new Error('Verification evidence must name a source');
    e.status = 400;
    e.error_class = 'ValidationError';
    throw e;
  }
  const task = await StudentTask.findOne({ where: { project_id: projectId, story_id: storyId } });
  if (!task) return null;

  // Idempotent by design: the FIRST verification is the one that counts. A
  // replayed pipeline run must not move the timestamp, or "when was this
  // verified" drifts on every retry and any points window computed from it
  // drifts with it. Same input, same end state.
  const verifiedAt = task.verified_at ?? new Date();
  const verifiedBy = task.verified_at ? task.verified_by : evidence.source;

  await StudentTask.update(
    { status: 'complete', verified_at: verifiedAt, verified_by: verifiedBy },
    { where: { id: task.id } },
  );
  // student_tasks.verified_at is what points will actually gate on; this line is
  // the trail that answers "why?" — the run or reviewer behind that timestamp.
  log('task_verified_complete', {
    projectId, storyId, taskId: String(task.id),
    source: evidence.source, ref: evidence.ref ?? null,
    correlation_id: evidence.correlation_id ?? null,
    replayed: Boolean(task.verified_at),
  }, 'info', 'success');
  return { id: String(task.id), story_id: storyId, status: 'complete', verified_at: verifiedAt };
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
        // The same hole, a different door. This payload is client-authored too,
        // so a `complete` in it is a claim, not a verification — leaving it
        // writable here would have made the PATCH guard theatre, since a client
        // refused a 409 could just re-import itself complete. Demoted to
        // in_progress rather than not_started because the student plainly did
        // work on it; what is withheld is the reward-bearing state, not credit
        // for having started. Existing `complete` on the row is still preserved
        // by the monotonic rule below — this only stops the client MINTING one.
        if (attrs.status === 'complete') attrs.status = 'in_progress';
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
            // MONOTONIC on this bulk path: a verified-complete task never regresses
            // because a different device (with stale localStorage) mirrored it as
            // not_started. Un-completing goes through the verification pipeline.
            // The old `&& attrs.status !== 'complete'` arm is gone because the
            // demotion above makes it unreachable — attrs.status can no longer BE
            // 'complete' by the time it gets here, and the compiler now says so.
            const nextStatus = row.status === 'complete' ? 'complete' : attrs.status;
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

/**
 * Record where this project's Command Center is running. Scoped to the
 * requesting enrollment; null when the project is not theirs, which the route
 * turns into a 404.
 *
 * Written into `project_variables` rather than a new column — see
 * ProjectTreeDto.command_center_url for why.
 */
export async function setCommandCenterUrl(
  enrollmentId: string, projectId: string, url: string,
): Promise<ProjectTreeDto | null> {
  const project: any = await Project.findByPk(projectId);
  if (!project || String(project.enrollment_id) !== String(enrollmentId)) return null;

  const vars = { ...(project.project_variables || {}), command_center_url: url };
  project.project_variables = vars;
  project.changed('project_variables', true);
  await project.save();

  log('project_command_center_set', { enrollmentId, projectId });
  return getOwnedProjectTree(enrollmentId, projectId);
}
