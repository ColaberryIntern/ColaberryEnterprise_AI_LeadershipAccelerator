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
  return toProjectTreeDto(project.get({ plain: true }) as any, plainLists);
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
