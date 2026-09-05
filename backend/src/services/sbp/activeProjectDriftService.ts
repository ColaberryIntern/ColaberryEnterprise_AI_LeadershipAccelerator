/**
 * Gather what `detectActiveProjectDrift` needs for ONE student, and ask it.
 *
 * The pure judgement lives in `activeProjectDrift.ts`; this is the only part
 * that touches the database, so the rule stays testable without fixtures and
 * this file stays boring.
 *
 * WHY IT HANGS OFF THE ACTIVE-PROJECT ENDPOINT. The portal already calls
 * `GET /api/portal/projects/active` to decide what to render, and that is the
 * exact moment the answer is useful: a student who is about to be shown the
 * wrong project can be told so on the same screen. Surfacing it anywhere else
 * repeats the failure it exists to fix, which was Farhat Beig needing to email
 * a human to discover that her build had already been accepted.
 *
 * NEVER THROWS. A drift banner is a courtesy on top of the page; if this query
 * fails the student must still get their project. Failure is logged and
 * returns null, which renders nothing.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { detectActiveProjectDrift, DriftFinding, ProjectActivity } from './activeProjectDrift';

interface Row {
  active_project_id: string | null;
  full_name: string | null;
  email: string;
  project_id: string;
  name: string | null;
  last_verified_at: string | null;
  outstanding_tasks: string;
  published: boolean;
  archived: boolean;
}

/**
 * One row per project the student owns, carrying the two facts the rule needs:
 * when work last verified there, and whether anything is still outstanding.
 *
 * `outstanding_tasks` counts tasks NOT complete, which is what tells a genuinely
 * stale pointer apart from a student who simply owns a finished second project.
 */
const SQL = `
  SELECT e.active_project_id::text AS active_project_id,
         e.full_name, e.email,
         p.id::text AS project_id, p.name,
         (p.archived_at IS NOT NULL) AS archived,
         EXISTS (SELECT 1 FROM build_plans b
                  WHERE b.project_id = p.id AND b.status = 'published') AS published,
         (SELECT MAX(t.verified_at)::text FROM student_tasks t WHERE t.project_id = p.id) AS last_verified_at,
         (SELECT COUNT(*) FROM student_tasks t
           WHERE t.project_id = p.id AND t.status <> 'complete')::text AS outstanding_tasks
    FROM enrollments e
    JOIN projects p ON p.enrollment_id = e.id
   WHERE e.id = :eid
   ORDER BY p.created_at`;

export async function driftForEnrollment(enrollmentId: string): Promise<DriftFinding | null> {
  let rows: Row[];
  try {
    rows = (await sequelize.query(SQL, {
      replacements: { eid: enrollmentId }, type: QueryTypes.SELECT,
    })) as Row[];
  } catch (err: any) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'active-project-drift',
      event: 'drift_query_failed', outcome: 'failure',
      error_class: err?.name ?? 'Error', context: { message: err?.message },
    }));
    return null;
  }
  if (!rows.length) return null;

  const projects: ProjectActivity[] = rows.map((r) => ({
    project_id: r.project_id,
    name: r.name,
    last_verified_at: r.last_verified_at,
    outstanding_tasks: Number(r.outstanding_tasks) || 0,
    published: Boolean(r.published),
    archived: Boolean(r.archived),
  }));

  const findings = detectActiveProjectDrift({
    enrollment_id: enrollmentId,
    full_name: rows[0].full_name,
    email: rows[0].email,
    active_project_id: rows[0].active_project_id,
    projects,
  });
  return findings[0] ?? null;
}
