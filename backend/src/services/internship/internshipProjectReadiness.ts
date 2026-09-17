import InternshipApplication from '../../models/InternshipApplication';
import Enrollment from '../../models/Enrollment';
import { internActivity, type InternActivity } from './internshipActivityService';

/**
 * "Who is ready for a project?" — the manager's roster.
 *
 * Ali assigns a project only after an intern clears the first three weeks and is
 * attending. This lists every ACTIVE intern with exactly those two signals plus
 * whether they already have a project, so a manager can see at a glance who to
 * hand a project to next.
 *
 * Read-only. Each intern's numbers come from `internActivity` (the same source the
 * per-intern Activity view uses), so this roster and that view can never disagree.
 */
export interface ProjectReadinessRow {
  application_id: string;
  enrollment_id: string;
  full_name: string | null;
  email: string | null;
  weeks_done: number;
  weeks_total: number;
  training_ready: boolean;
  sessions_attended: number;
  has_project: boolean;
  project_name: string | null;
  /** Cleared the first three weeks AND has no project yet — hand them one. */
  ready_for_project: boolean;
}

/** The crux, pure and tested: cleared the training gate and not yet on a project. */
export function readyForProject(activity: InternActivity): boolean {
  return !!activity.training?.first_three_weeks.ready && !activity.project;
}

export async function internshipProjectReadiness(): Promise<ProjectReadinessRow[]> {
  const apps = await InternshipApplication.findAll({
    where: { state: 'active' },
    attributes: ['id', 'enrollment_id'],
  });

  const rows = await Promise.all(apps.map(async (app): Promise<ProjectReadinessRow> => {
    const [enr, activity] = await Promise.all([
      Enrollment.findByPk((app as any).enrollment_id, { attributes: ['full_name', 'email'] }),
      internActivity((app as any).enrollment_id),
    ]);
    return {
      application_id: (app as any).id,
      enrollment_id: (app as any).enrollment_id,
      full_name: (enr as any)?.full_name ?? null,
      email: (enr as any)?.email ?? null,
      weeks_done: activity.training?.first_three_weeks.done ?? 0,
      weeks_total: activity.training?.first_three_weeks.total ?? 3,
      training_ready: !!activity.training?.first_three_weeks.ready,
      sessions_attended: activity.attendance.total,
      has_project: !!activity.project,
      project_name: activity.project?.name ?? null,
      ready_for_project: readyForProject(activity),
    };
  }));

  // Ready-for-a-project first, then the closest to ready (most weeks done).
  return rows.sort((a, b) =>
    Number(b.ready_for_project) - Number(a.ready_for_project)
    || b.weeks_done - a.weeks_done);
}
