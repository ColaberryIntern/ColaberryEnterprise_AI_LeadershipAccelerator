/**
 * projectAdminArchiveService - archive and restore a project as an ADMIN, on somebody else's
 * enrollment, plus the only listing in the system that deliberately shows archived projects.
 *
 * WHY THIS IS SEPARATE FROM projectArchiveService
 *
 * That file is the student path and its first act on every call is `loadOwnedLiveProject`, which
 * refuses anything the caller does not own and answers 404 rather than 403 so a project id on
 * somebody else's enrollment cannot be probed for. That guard is correct and must not be
 * weakened with a flag: an `asAdmin` boolean threaded through the student path is one wrong
 * caller away from a student archiving another student's build.
 *
 * So the ownership check is absent here and the ADMIN check lives at the route. Everything else
 * is deliberately identical, and the parts that must not diverge - where the active pointer goes,
 * which projects are untouchable - are imported rather than re-implemented.
 *
 * WHAT IS KEPT FROM THE STUDENT PATH, AND WHY
 *
 *   - The protected-project refusal. `fcce50ef` is the platform's own project record, roughly
 *     144,000 rows across 15 tables including the BuildManifest telemetry target. An admin has no
 *     more business archiving it than a student does, and "admin" is not a reason to remove the
 *     guard that exists because someone nearly did.
 *   - Clearing `enrollments.active_project_id`. That column has NO foreign key and no ON DELETE,
 *     so leaving it pointing at an archived project makes `getProjectByEnrollment` fall through
 *     to "newest remaining project" - which on one enrollment resolves to the platform record.
 *   - Idempotency. Archiving an already-archived project reports `changed: false` and writes
 *     nothing, so a double-click is not a second audit entry with a different reason.
 *
 * WHAT IS ADDED
 *
 *   - `archived_by` and `archived_reason`, required. A student archiving their own build needs no
 *     attribution; an admin removing somebody else's does, or "this project vanished" has no
 *     answer at all six weeks later.
 */
import { Op } from 'sequelize';
import { sequelize } from '../../config/database';
import Project from '../../models/Project';
import Enrollment from '../../models/Enrollment';
import { isProtectedProject, PROTECTED_PROJECT_MESSAGE } from './protectedProjects';
import { ArchiveError, nextActiveAfterArchiving } from './projectArchiveService';

export interface AdminArchiveResult {
  project_id: string;
  archived_at: string;
  archived_by: string | null;
  archived_reason: string | null;
  /** Where the OWNER's active pointer ended up. Null is legitimate: they now have none. */
  active_project_id: string | null;
  changed: boolean;
}

export interface AdminRestoreResult {
  project_id: string;
  active_project_id: string | null;
  changed: boolean;
}

export interface ArchivedProjectRow {
  id: string;
  name: string | null;
  enrollment_id: string | null;
  archived_at: string;
  archived_by: string | null;
  archived_reason: string | null;
  student_name: string | null;
  student_email: string | null;
  task_count: number;
}

const REASON_MAX = 200;
const ACTOR_MAX = 160;

/** Load without an ownership check. The route is what decides the caller may be here. */
async function loadForAdmin(projectId: string): Promise<Project> {
  const project = await Project.findByPk(projectId);
  if (!project) throw new ArchiveError(404, 'Project not found', 'ProjectNotFound');
  return project;
}

function requireReason(reason: unknown): string {
  const r = String(reason ?? '').trim();
  if (!r) {
    throw new ArchiveError(400, 'A reason is required: an archive nobody can explain later is a deletion', 'ReasonRequired');
  }
  if (r.length > REASON_MAX) {
    throw new ArchiveError(400, `Reason is ${r.length} characters; the column holds ${REASON_MAX}`, 'ReasonTooLong');
  }
  return r;
}

/**
 * Archive someone else's project.
 *
 * @param projectId the project to remove from every surface
 * @param actor who is doing it, for the audit trail
 * @param reason why, required
 */
export async function adminArchiveProject(
  projectId: string,
  actor: string,
  reason: string,
): Promise<AdminArchiveResult> {
  if (isProtectedProject(projectId)) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'project-archive',
      event: 'protected_project_admin_archive_refused', outcome: 'failure',
      error_class: 'ProtectedProject',
      context: { project_id: String(projectId), actor },
    }));
    throw new ArchiveError(403, PROTECTED_PROJECT_MESSAGE, 'ProtectedProject');
  }

  const why = requireReason(reason);
  const who = String(actor ?? '').trim().slice(0, ACTOR_MAX) || 'admin';
  const project = await loadForAdmin(projectId);
  const enrollmentId = String((project as any).enrollment_id ?? '');

  const existing = (project as any).archived_at;
  if (existing != null) {
    const enr = enrollmentId ? await Enrollment.findByPk(enrollmentId) : null;
    return {
      project_id: String(project.id),
      archived_at: new Date(existing).toISOString(),
      archived_by: (project as any).archived_by ?? null,
      archived_reason: (project as any).archived_reason ?? null,
      active_project_id: (enr as any)?.active_project_id ?? null,
      changed: false,
    };
  }

  const enrollment = enrollmentId ? await Enrollment.findByPk(enrollmentId) : null;
  const wasActive = String((enrollment as any)?.active_project_id ?? '') === String(projectId);
  const next = wasActive && enrollmentId
    ? await nextActiveAfterArchiving(enrollmentId, projectId)
    : null;
  const archivedAt = new Date();

  await sequelize.transaction(async (tx) => {
    await Project.update(
      { archived_at: archivedAt, archived_by: who, archived_reason: why } as any,
      { where: { id: projectId }, transaction: tx },
    );
    // Same transaction as the stamp, deliberately: a pointer left behind by a half-applied
    // archive resolves to "newest remaining project" on the next page load.
    if (wasActive && enrollment) {
      await Enrollment.update(
        { active_project_id: next ? next.id : null } as any,
        { where: { id: enrollmentId }, transaction: tx },
      );
    }
  });

  console.log(JSON.stringify({
    timestamp: archivedAt.toISOString(), level: 'info', service: 'project-archive',
    event: 'project_archived_by_admin', outcome: 'success',
    context: {
      project_id: String(projectId), enrollment_id: enrollmentId || null,
      actor: who, reason: why, was_active: wasActive,
      next_active_project_id: next ? String(next.id) : null,
    },
  }));

  return {
    project_id: String(project.id),
    archived_at: archivedAt.toISOString(),
    archived_by: who,
    archived_reason: why,
    active_project_id: wasActive
      ? (next ? String(next.id) : null)
      : ((enrollment as any)?.active_project_id ?? null),
    changed: true,
  };
}

/** Put it back. The audit fields are cleared, because they describe an archive that no longer holds. */
export async function adminRestoreProject(
  projectId: string,
  actor: string,
): Promise<AdminRestoreResult> {
  if (isProtectedProject(projectId)) {
    throw new ArchiveError(403, PROTECTED_PROJECT_MESSAGE, 'ProtectedProject');
  }
  const project = await loadForAdmin(projectId);
  const enrollmentId = String((project as any).enrollment_id ?? '');
  const enrollment = enrollmentId ? await Enrollment.findByPk(enrollmentId) : null;
  const currentActive = (enrollment as any)?.active_project_id ?? null;

  if ((project as any).archived_at == null) {
    return { project_id: String(project.id), active_project_id: currentActive, changed: false };
  }

  // Adopt as active only when the owner is left with nothing pointing anywhere. Restoring a
  // project must not quietly switch a student off the build they are currently working.
  let adopt = false;
  if (enrollmentId) {
    if (!currentActive) adopt = true;
    else {
      const active = await Project.findByPk(currentActive);
      if (!active || (active as any).archived_at != null) adopt = true;
    }
  }

  await sequelize.transaction(async (tx) => {
    await Project.update(
      { archived_at: null, archived_by: null, archived_reason: null } as any,
      { where: { id: projectId }, transaction: tx },
    );
    if (adopt && enrollment) {
      await Enrollment.update(
        { active_project_id: projectId } as any,
        { where: { id: enrollmentId }, transaction: tx },
      );
    }
  });

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'info', service: 'project-archive',
    event: 'project_restored_by_admin', outcome: 'success',
    context: {
      project_id: String(projectId), enrollment_id: enrollmentId || null,
      actor: String(actor ?? '').slice(0, ACTOR_MAX), adopted_as_active: adopt,
    },
  }));

  return {
    project_id: String(project.id),
    active_project_id: adopt ? String(projectId) : currentActive,
    changed: true,
  };
}

/**
 * The reveal. The ONLY listing in the system that returns archived projects.
 *
 * It is a separate function behind a separate route rather than an `includeArchived` flag on the
 * normal project listings, and that is the whole safety argument: a flag defaults to false in one
 * place and gets forgotten in the next, and the failure mode is archived projects reappearing in
 * an ordinary admin view. A route that only ever returns archived rows cannot be reached by
 * accident.
 */
export async function listArchivedProjects(limit = 200): Promise<ArchivedProjectRow[]> {
  const rows = await Project.findAll({
    where: { archived_at: { [Op.ne]: null } } as any,
    order: [['archived_at', 'DESC']],
    limit: Math.max(1, Math.min(1000, limit)),
  });

  const out: ArchivedProjectRow[] = [];
  for (const p of rows) {
    const a: any = p;
    let studentName: string | null = null;
    let studentEmail: string | null = null;
    if (a.enrollment_id) {
      const enr: any = await Enrollment.findByPk(a.enrollment_id);
      studentName = enr?.full_name ?? enr?.name ?? null;
      studentEmail = enr?.email ?? null;
    }
    // What would come back on restore, so the decision is informed rather than hopeful.
    const [counted]: any = await sequelize.query(
      `SELECT COUNT(*)::int AS n FROM student_tasks WHERE project_id = $pid`,
      { bind: { pid: String(a.id) } },
    );
    out.push({
      id: String(a.id),
      name: a.name ?? null,
      enrollment_id: a.enrollment_id ? String(a.enrollment_id) : null,
      archived_at: new Date(a.archived_at).toISOString(),
      archived_by: a.archived_by ?? null,
      archived_reason: a.archived_reason ?? null,
      student_name: studentName,
      student_email: studentEmail,
      task_count: Number((Array.isArray(counted) ? counted[0]?.n : counted?.n) ?? 0),
    });
  }
  return out;
}
