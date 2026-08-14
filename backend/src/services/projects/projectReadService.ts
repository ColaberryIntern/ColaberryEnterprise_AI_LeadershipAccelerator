/**
 * projectReadService — the I/O shell for the Project Backend read API (P1).
 * Serves the persisted StudentTask hierarchy (project → lists → tasks) that the
 * localStorage `projectsStore` migrates onto. All access is scoped to the
 * requesting enrollment (auth contract: a student only reads their own projects).
 * Pure shape/ordering/counts live in ./projectTreeDto.
 */
import Project from '../../models/Project';
import StudentTaskList from '../../models/StudentTaskList';
import StudentTask from '../../models/StudentTask';
import EvidenceRecord from '../../models/EvidenceRecord';
import { getProjectByEnrollment, listProjectsForEnrollment } from '../projectService';
import {
  toProjectTreeDto,
  toProjectSummaryDto,
  type ProjectTreeDto,
  type ProjectSummaryDto,
} from './projectTreeDto';

async function buildTree(projectId: string): Promise<ProjectTreeDto | null> {
  const project = await Project.findByPk(projectId);
  if (!project) return null;
  const [lists, tasks] = await Promise.all([
    StudentTaskList.findAll({ where: { project_id: projectId }, order: [['position', 'ASC']] }),
    StudentTask.findAll({ where: { project_id: projectId }, order: [['position', 'ASC']] }),
  ]);
  const tasksByList = new Map<string, any[]>();
  for (const t of tasks) {
    const plain = t.get({ plain: true }) as any;
    const key = String(plain.task_list_id);
    const bucket = tasksByList.get(key);
    if (bucket) bucket.push(plain);
    else tasksByList.set(key, [plain]);
  }
  const plainLists = lists.map((l) => {
    const pl = l.get({ plain: true }) as any;
    pl.tasks = tasksByList.get(String(pl.id)) || [];
    return pl;
  });
  const plainProject = project.get({ plain: true }) as any;
  const xpEarned = await verifiedStoryXp(
    String(plainProject.enrollment_id ?? ''),
    tasks.map((t) => t.get({ plain: true })),
  );
  return toProjectTreeDto(plainProject, plainLists, xpEarned);
}

/**
 * Builder XP already banked for this project's verified stories.
 *
 * Read back from `evidence_records` rather than recomputed from a rate, because
 * the rate is editable in `points_config` and a student's earned total must not
 * silently change when somebody retunes the economy. What they were awarded is
 * what they keep.
 *
 * Scoped by the exact `story@sha` refs on THIS project's tasks, so a student
 * with several projects never sees one project's XP counted on another.
 * Fail-soft: an unreadable evidence table costs the number on a dashboard, and
 * that is not worth failing the whole project read over.
 */
async function verifiedStoryXp(
  enrollmentId: string,
  tasks: Array<{ story_id?: string | null; verification_json?: unknown }>,
): Promise<number> {
  const refs = tasks
    .map((t) => {
      const v = t.verification_json as { state?: unknown; commit_sha?: unknown } | null | undefined;
      return v && typeof v === 'object' && v.state === 'verified' && typeof v.commit_sha === 'string'
        ? `${t.story_id}@${v.commit_sha}`
        : null;
    })
    .filter((r): r is string => r !== null);
  if (!enrollmentId || refs.length === 0) return 0;

  try {
    const rows = await EvidenceRecord.findAll({
      where: { enrollment_id: enrollmentId, source_type: 'github_commit', source_ref: refs },
      attributes: ['builder_xp'],
    });
    return rows.reduce((n, r) => n + (Number(r.builder_xp) || 0), 0);
  } catch (err: unknown) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'project-read',
      event: 'verified_story_xp_unavailable', outcome: 'partial',
      error_class: (err as { name?: string })?.name ?? 'Error',
      context: { enrollmentId, refs: refs.length, message: (err as { message?: string })?.message },
    }));
    return 0;
  }
}

/** The student's active project as a full task tree (scoped to the enrollment). */
export async function getActiveProjectTree(enrollmentId: string): Promise<ProjectTreeDto | null> {
  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) return null;
  return buildTree(project.id);
}

/** A specific project tree, but only if it belongs to this enrollment. */
export async function getOwnedProjectTree(enrollmentId: string, projectId: string): Promise<ProjectTreeDto | null> {
  const project = await Project.findByPk(projectId);
  if (!project || String((project as any).enrollment_id) !== String(enrollmentId)) return null;
  return buildTree(projectId);
}

/** Lightweight list of the student's projects (no task tree), active flagged. */
export async function listEnrollmentProjectsSummary(enrollmentId: string): Promise<ProjectSummaryDto[]> {
  const [projects, active] = await Promise.all([
    listProjectsForEnrollment(enrollmentId),
    getProjectByEnrollment(enrollmentId),
  ]);
  const activeId = active ? active.id : null;
  return projects.map((p) => toProjectSummaryDto(p.get({ plain: true }) as any, activeId));
}
