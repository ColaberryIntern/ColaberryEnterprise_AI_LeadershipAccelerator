/**
 * caseStudyHolders - projects that only hold case studies, with nothing built here.
 *
 * A case study is linked to a person through a project, so importing one (or writing one about a
 * system built elsewhere) leaves a project row that is not a build. Ali, 2026-11-25: show a project on
 * the person's list only if they built it here. A case study about something they DID build here sits
 * on a project with tasks, a plan or a repository, and is not touched.
 *
 * Display only. The rows stay live on purpose: `caseStudyLinkedPerson` skips archived projects, so
 * archiving a holder would unlink its case studies from the person.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { isProtectedProject } from './protectedProjects';

/** FAILS SOFT TO NONE: showing a holder is a smaller mistake than hiding somebody's build. */
export async function caseStudyHolderIds(enrollmentId: string): Promise<Set<string>> {
  try {
    const rows = await sequelize.query<{ id: string }>(
      `SELECT p.id FROM projects p
        WHERE p.enrollment_id = :enrollmentId
          AND p.archived_at IS NULL
          AND COALESCE(p.requirements_document, '') = ''
          AND EXISTS (SELECT 1 FROM case_studies c WHERE c.project_id = p.id)
          AND NOT EXISTS (SELECT 1 FROM student_tasks t WHERE t.project_id = p.id)
          AND NOT EXISTS (SELECT 1 FROM student_task_lists l WHERE l.project_id = p.id)
          AND NOT EXISTS (SELECT 1 FROM build_intake i WHERE i.project_id = p.id)
          AND NOT EXISTS (SELECT 1 FROM build_plans b WHERE b.project_id = p.id)
          AND NOT EXISTS (SELECT 1 FROM github_connections g WHERE g.project_id = p.id)`,
      { replacements: { enrollmentId }, type: QueryTypes.SELECT },
    );
    // The platform's own record is never a holder, whatever is connected to it today.
    return new Set(rows.map((r) => String(r.id)).filter((id) => !isProtectedProject(id)));
  } catch (err) {
    const e = err as Error;
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'project-read',
      event: 'case_study_holder_lookup_failed', outcome: 'partial',
      error_class: e?.name ?? 'Error', context: { enrollment_id: enrollmentId, message: e?.message },
    }));
    return new Set();
  }
}

/** The list without its holders. The active project always stays: the portal opens on it. */
export function withoutHolders<T extends { id: unknown }>(
  projects: readonly T[],
  holders: ReadonlySet<string>,
  activeId: string | null,
): T[] {
  return projects.filter((p) => String(p.id) === String(activeId) || !holders.has(String(p.id)));
}
