import { sequelize } from '../../config/database';
import { NO_INTERVIEW } from '../../db/ensureCareerPrepSchema';

/**
 * Career Prep v27 (CP2.1): the staff Student prep list. Every student with Career Prep evidence in
 * the last 90 days, newest first, with their latest general readiness (absent when there is none,
 * never 0). Capped at 500. A database error propagates to the route.
 */
export interface PrepStudent { enrollmentId: string; name: string; lastObserved: string; observations: number; readiness?: number }

export async function listPrepStudents(): Promise<PrepStudent[]> {
  const [rows] = await sequelize.query(
    `SELECT o.enrollment_id, e.full_name, MAX(o.observed_at) AS last_observed, COUNT(*)::int AS observations,
            (SELECT d.readiness FROM prep_readiness_daily d WHERE d.enrollment_id = o.enrollment_id AND d.interview_id = :none
              ORDER BY d.date DESC LIMIT 1) AS readiness
       FROM prep_observations o JOIN enrollments e ON e.id = o.enrollment_id
      WHERE o.observed_at > NOW() - INTERVAL '90 days'
      GROUP BY o.enrollment_id, e.full_name ORDER BY MAX(o.observed_at) DESC LIMIT 500`,
    { replacements: { none: NO_INTERVIEW } },
  );
  return (rows as Array<Record<string, unknown>>).map((r) => ({
    enrollmentId: String(r.enrollment_id), name: String(r.full_name ?? ''), lastObserved: new Date(r.last_observed as string).toISOString(),
    observations: Number(r.observations), ...(r.readiness === null || r.readiness === undefined ? {} : { readiness: Number(r.readiness) }),
  }));
}
