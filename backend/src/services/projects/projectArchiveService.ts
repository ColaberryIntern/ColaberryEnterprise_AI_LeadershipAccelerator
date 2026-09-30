/**
 * projectArchiveService — a student removes their own project, reversibly.
 *
 * THE SHAPE OF THE ACTION
 * ----------------------
 * ARCHIVE, not erase. One UPDATE sets `projects.archived_at`; nothing is
 * deleted and nothing cascades. The project leaves every listing and stops
 * being resolvable as the active build, and `restoreProject` puts it back
 * exactly as it was.
 *
 * That choice is not caution for its own sake. `student_task_lists.project_id`
 * and `student_tasks.project_id` are both `ON DELETE CASCADE`, so a hard delete
 * takes the task tree with it — including `verified_at`, the latch that awarded
 * points are keyed against. The award rows in `evidence_records` would survive
 * (no `project_id`) but become unreachable, because the only route from an award
 * back to the story that earned it runs through `student_tasks.story_id` +
 * `verified_ref`. A student would keep the number and lose the reason.
 *
 * WHAT IS PROTECTED, AND WHERE
 * ---------------------------
 *  - the PLATFORM RECORD is excluded twice, independently: from the archivable
 *    listing query (`listArchivableProjectsForEnrollment`) and again in
 *    `archiveProject` below. See ./protectedProjects for what that row is.
 *  - OWNERSHIP is checked on every call. A project on another enrollment answers
 *    404, identical to a project that does not exist, so probing project ids
 *    tells an attacker nothing.
 *  - LEGACY TASK LISTS (hand-created or client-mirrored lists sitting outside
 *    the published plan — the clusters that carry the 24 hand-ticked
 *    completions of Quincy, Shabana, Liza and Farhat) are untouched by
 *    definition: this service issues no DELETE and no write to any task table.
 *    The preview counts them so the student is told they are included.
 *  - the ACTIVE POINTER is repointed explicitly, never left dangling. See
 *    `nextActiveAfterArchiving`.
 */
import { Op } from 'sequelize';
import Project from '../../models/Project';
import StudentTask from '../../models/StudentTask';
import StudentTaskList from '../../models/StudentTaskList';
import GitHubConnection from '../../models/GitHubConnection';
import { Enrollment } from '../../models';
import { sequelize } from '../../config/database';
import { verifiedStoryXp } from './projectReadService';
import { isProtectedProject, PROTECTED_PROJECT_MESSAGE } from './protectedProjects';

/** An error carrying the HTTP status the route should answer with. */
export class ArchiveError extends Error {
  constructor(public status: number, message: string, public code: string) {
    super(message);
    this.name = 'ArchiveError';
  }
}

/**
 * What the student is agreeing to give up, counted live from this project.
 *
 * Every field is read at confirmation time rather than cached. A stale count is
 * worse than no count: it asks for consent to a description of the project that
 * is not true any more.
 */
export interface ArchivePreview {
  project_id: string;
  /** The project's real name, or null when it has never been named. */
  name: string | null;
  /** Is this the student's current build? Drives the "we will switch you" line. */
  is_active: boolean;
  /** Every task on the project, across published-plan AND legacy lists. */
  task_count: number;
  /** Tasks the student has completed (their own tick). */
  completed_task_count: number;
  /** Task lists, so a student with legacy lists sees they are included. */
  task_list_count: number;
  /** Tasks the PLATFORM has confirmed (`verified_at` latched) — not self-claimed. */
  confirmed_story_count: number;
  /** Does a published plan exist for this project? */
  has_published_plan: boolean;
  /** Builder XP already banked for this project's confirmed stories. */
  points_awarded: number;
  /** Is a GitHub repo connected to this project? */
  repo_connected: boolean;
  /** `owner/name` when a repo is connected, for naming it in the copy. */
  repo_full_name: string | null;
  /** Where the student lands afterwards, resolved now so the copy can say it. */
  next_active_project_id: string | null;
  next_active_project_name: string | null;
}

/** Load the project, or throw the 404/403 the caller should answer with. */
async function loadOwnedLiveProject(enrollmentId: string, projectId: string): Promise<Project> {
  const project = await Project.findByPk(projectId);
  // Not found and not-yours are the SAME answer on purpose: a distinguishable
  // 403 would confirm that a project id exists on somebody else's enrollment.
  if (!project || String((project as any).enrollment_id) !== String(enrollmentId)) {
    throw new ArchiveError(404, 'Project not found', 'ProjectNotFound');
  }
  return project;
}

/**
 * Where the student's active pointer goes when the active project is archived.
 *
 * `enrollments.active_project_id` has NO foreign key and no ON DELETE
 * behaviour, so leaving it pointing at an archived project is not merely untidy
 * — `getProjectByEnrollment` would fall through to "newest remaining project",
 * and on the one enrollment that owns a platform project that fallback can
 * resolve to `fcce50ef`, silently making the platform's own ~144k-row record the
 * student's active build. This function is why that cannot happen: the
 * replacement is chosen from adoptable rows only, with the platform record
 * excluded by id.
 *
 * Returning `null` is a legitimate, coherent outcome: the student archived their
 * only project and now has none. The portal already renders that state (an empty
 * list and a "start a new build" tile). A null pointer is strictly better than a
 * pointer to something they removed, and far better than one to infrastructure.
 */
async function nextActiveAfterArchiving(
  enrollmentId: string,
  archivingProjectId: string,
): Promise<Project | null> {
  const { listArchivableProjectsForEnrollment } = await import('../projectService');
  const candidates = await listArchivableProjectsForEnrollment(enrollmentId);
  return candidates.find((p) => String(p.id) !== String(archivingProjectId)) ?? null;
}

/** Does this project have a published build plan? */
async function hasPublishedPlan(projectId: string): Promise<boolean> {
  const [rows]: any = await sequelize.query(
    `SELECT 1 FROM build_plans WHERE project_id = $pid AND status = 'published' LIMIT 1`,
    { bind: { pid: projectId } },
  );
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * Count exactly what this project holds, right now.
 *
 * Refuses on a protected project for the same reason the archive does: a preview
 * is the first half of the archive flow, and answering it would tell a client
 * the action is available.
 */
export async function getArchivePreview(
  enrollmentId: string,
  projectId: string,
): Promise<ArchivePreview> {
  if (isProtectedProject(projectId)) {
    throw new ArchiveError(403, PROTECTED_PROJECT_MESSAGE, 'ProtectedProject');
  }
  const project = await loadOwnedLiveProject(enrollmentId, projectId);

  const [
    taskCount, completedCount, listCount, confirmedCount,
    publishedPlan, connection, enrollment, tasks,
  ] = await Promise.all([
    StudentTask.count({ where: { project_id: projectId } }),
    StudentTask.count({ where: { project_id: projectId, status: 'complete' } }),
    StudentTaskList.count({ where: { project_id: projectId } }),
    StudentTask.count({ where: { project_id: projectId, verified_at: { [Op.ne]: null } } }),
    hasPublishedPlan(projectId),
    GitHubConnection.findOne({ where: { project_id: projectId } }),
    Enrollment.findByPk(enrollmentId),
    StudentTask.findAll({
      where: { project_id: projectId, verified_at: { [Op.ne]: null } },
      attributes: ['story_id', 'verified_at', 'verified_ref'],
    }),
  ]);

  const pointsAwarded = await verifiedStoryXp(
    enrollmentId,
    tasks.map((t) => t.get({ plain: true }) as any),
  );

  const isActive = String((enrollment as any)?.active_project_id ?? '') === String(projectId);
  // Only resolved when it is actually needed: the copy promises a destination
  // only for the active project, and a wrong promise is worse than none.
  const next = isActive ? await nextActiveAfterArchiving(enrollmentId, projectId) : null;

  const owner = (connection as any)?.repo_owner ?? null;
  const repo = (connection as any)?.repo_name ?? null;

  return {
    project_id: String(project.id),
    name: (project as any).name ?? null,
    is_active: isActive,
    task_count: taskCount,
    completed_task_count: completedCount,
    task_list_count: listCount,
    confirmed_story_count: confirmedCount,
    has_published_plan: publishedPlan,
    points_awarded: pointsAwarded,
    repo_connected: Boolean(owner && repo),
    repo_full_name: owner && repo ? `${owner}/${repo}` : null,
    next_active_project_id: next ? String(next.id) : null,
    next_active_project_name: next ? ((next as any).name ?? null) : null,
  };
}

export interface ArchiveResult {
  project_id: string;
  archived_at: string;
  /** Null when the student has no projects left — a valid end state. */
  active_project_id: string | null;
  /** True when this call is what archived it (false = already archived). */
  changed: boolean;
}

/**
 * Archive one project the student owns.
 *
 * SECOND, independent exclusion of the platform record. The archivable listing
 * already omits it, so no UI can offer it — this refusal is what answers a
 * hand-written request straight at the endpoint. Checked BEFORE ownership is
 * loaded, because on the one enrollment that owns the platform record the
 * ownership check would pass.
 *
 * IDEMPOTENT: archiving an already-archived project reports the original
 * timestamp and `changed: false` rather than failing or re-stamping. A student
 * double-clicking Remove, or a client retrying a request whose response was
 * lost, must not produce a different end state or an error they cannot act on.
 *
 * The pointer repoint and the archive stamp share ONE transaction. Split apart,
 * a crash between them leaves `active_project_id` naming an archived project,
 * which is precisely the dangling-pointer state this feature exists not to
 * create.
 */
export async function archiveProject(
  enrollmentId: string,
  projectId: string,
): Promise<ArchiveResult> {
  if (isProtectedProject(projectId)) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'project-archive',
      event: 'protected_project_archive_refused', outcome: 'failure',
      error_class: 'ProtectedProject',
      context: { enrollment_id: enrollmentId, project_id: String(projectId) },
    }));
    throw new ArchiveError(403, PROTECTED_PROJECT_MESSAGE, 'ProtectedProject');
  }

  const project = await loadOwnedLiveProject(enrollmentId, projectId);
  const existing = (project as any).archived_at;
  if (existing != null) {
    const enrollment = await Enrollment.findByPk(enrollmentId);
    return {
      project_id: String(project.id),
      archived_at: new Date(existing).toISOString(),
      active_project_id: (enrollment as any)?.active_project_id ?? null,
      changed: false,
    };
  }

  const enrollment = await Enrollment.findByPk(enrollmentId);
  const wasActive = String((enrollment as any)?.active_project_id ?? '') === String(projectId);
  const next = wasActive ? await nextActiveAfterArchiving(enrollmentId, projectId) : null;
  const archivedAt = new Date();

  await sequelize.transaction(async (tx) => {
    await Project.update(
      { archived_at: archivedAt } as any,
      { where: { id: projectId }, transaction: tx },
    );
    if (wasActive && enrollment) {
      await Enrollment.update(
        { active_project_id: next ? next.id : null } as any,
        { where: { id: enrollmentId }, transaction: tx },
      );
    }
  });

  const activeAfter = wasActive
    ? (next ? String(next.id) : null)
    : ((enrollment as any)?.active_project_id ?? null);

  console.log(JSON.stringify({
    timestamp: archivedAt.toISOString(), level: 'info', service: 'project-archive',
    event: 'project_archived', outcome: 'success',
    context: {
      enrollment_id: enrollmentId, project_id: String(projectId),
      was_active: wasActive, next_active_project_id: activeAfter,
    },
  }));

  return {
    project_id: String(project.id),
    archived_at: archivedAt.toISOString(),
    active_project_id: activeAfter,
    changed: true,
  };
}

export interface RestoreResult {
  project_id: string;
  active_project_id: string | null;
  changed: boolean;
}

/**
 * Put an archived project back.
 *
 * Restore does NOT make the project active again. Archiving may have moved the
 * student onto another build and they may have done work there since; silently
 * yanking them back would be a second surprise on top of the first. The project
 * reappears in the list, and switching to it is the student's next choice —
 * except when they have no active project at all, where adopting the restored
 * one is the only sensible answer and leaving the pointer null would show them
 * an empty portal while holding a perfectly good build.
 *
 * Idempotent: restoring a live project is a no-op reporting `changed: false`.
 */
export async function restoreProject(
  enrollmentId: string,
  projectId: string,
): Promise<RestoreResult> {
  // Protected projects are never archived, so they can never be restored; the
  // check is here so the endpoint pair cannot be used to probe for the record.
  if (isProtectedProject(projectId)) {
    throw new ArchiveError(403, PROTECTED_PROJECT_MESSAGE, 'ProtectedProject');
  }
  const project = await loadOwnedLiveProject(enrollmentId, projectId);
  const enrollment = await Enrollment.findByPk(enrollmentId);
  const currentActive = (enrollment as any)?.active_project_id ?? null;

  if ((project as any).archived_at == null) {
    return { project_id: String(project.id), active_project_id: currentActive, changed: false };
  }

  // Adopt as active only when the student is left with nothing pointing anywhere.
  let adopt = false;
  if (!currentActive) {
    adopt = true;
  } else {
    const active = await Project.findByPk(currentActive);
    if (!active || (active as any).archived_at != null) adopt = true;
  }

  await sequelize.transaction(async (tx) => {
    await Project.update(
      { archived_at: null } as any,
      { where: { id: projectId }, transaction: tx },
    );
    if (adopt) {
      await Enrollment.update(
        { active_project_id: projectId } as any,
        { where: { id: enrollmentId }, transaction: tx },
      );
    }
  });

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'info', service: 'project-archive',
    event: 'project_restored', outcome: 'success',
    context: { enrollment_id: enrollmentId, project_id: String(projectId), adopted_as_active: adopt },
  }));

  return {
    project_id: String(project.id),
    active_project_id: adopt ? String(projectId) : currentActive,
    changed: true,
  };
}
