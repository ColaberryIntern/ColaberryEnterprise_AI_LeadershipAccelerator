/**
 * enrollmentsWithoutProjects — the students the Projects board structurally cannot show.
 *
 * WHY THIS EXISTS. The delivery board is built from `projects`, so a student who
 * has never created one does not appear on it at all. That is not a rendering
 * gap, it is a measurement gap: cohort health read off that board silently
 * excludes exactly the people in the worst position.
 *
 * Measured on production 2026-09-10, July 2026 cohort: **49 active enrollments,
 * 25 with an active project, 24 with no project whatsoever** — and 9 of those 24
 * were paid students on external addresses, 49 days into the cohort. None of them
 * appeared anywhere on the board being used to judge how the cohort was doing.
 *
 * "No project" is deliberately stricter than "no ACTIVE project": a student who
 * built something and then cleared their active pointer has still built
 * something, and does not belong on an intervention list.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { DEPARTED_ENROLLMENT_STATUSES } from './acceleratorCurrentClassesService';

export interface EnrollmentWithoutProject {
  enrollment_id: string;
  student_name: string | null;
  student_email: string | null;
  cohort_id: string | null;
  cohort_name: string | null;
  payment_status: string | null;
  enrollment_type: string | null;
  tier: string | null;
  amount_paid: string | null;
  enrolled_on: string | null;
  /** True for @colaberry.com addresses — internal seats, not paying students.
   *  Kept in the payload rather than filtered out, because "is this a real
   *  student" is the operator's call and hiding rows makes the count lie. */
  internal: boolean;
}

export interface WithoutProjectSummary {
  /** Everyone still enrolled, project or not. The denominator that matters. */
  active_enrollments: number;
  with_project: number;
  without_project: number;
  /** Paying, external, and holding nothing. The actual intervention list. */
  paid_external_without_project: number;
  rows: EnrollmentWithoutProject[];
}

const INTERNAL_DOMAIN = '@colaberry.com';

/** A row counts as paying only on an explicit paid status. Anything else —
 *  pending, null, comped — is a different conversation and must not inflate the
 *  number an operator acts on. */
export function isPaying(row: { payment_status?: string | null }): boolean {
  return (row.payment_status ?? '').trim().toLowerCase() === 'paid';
}

export function isInternal(email?: string | null): boolean {
  return (email ?? '').trim().toLowerCase().endsWith(INTERNAL_DOMAIN);
}

/** Rows worth chasing: paying, external, and holding no project at all. */
export function interventionList(rows: EnrollmentWithoutProject[]): EnrollmentWithoutProject[] {
  return rows.filter((r) => isPaying(r) && !r.internal);
}

export async function getEnrollmentsWithoutProjects(
  opts: { cohortId?: string } = {}
): Promise<WithoutProjectSummary> {
  const rows = await sequelize.query<any>(
    `SELECT e.id                AS enrollment_id,
            e.full_name         AS student_name,
            e.email             AS student_email,
            e.cohort_id,
            co.name             AS cohort_name,
            e.payment_status,
            e.enrollment_type,
            e.tier,
            e.amount_paid::text AS amount_paid,
            e.created_at::date::text AS enrolled_on
       FROM enrollments e
       LEFT JOIN cohorts co ON co.id = e.cohort_id
      WHERE (e.status IS NULL OR e.status NOT IN (:departed))
        -- Stricter than active_project_id IS NULL on purpose: someone who built
        -- something and cleared the pointer has still built something.
        AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.enrollment_id = e.id)
        ${opts.cohortId ? 'AND e.cohort_id = :cohortId' : ''}
      ORDER BY e.created_at`,
    {
      replacements: {
        departed: [...DEPARTED_ENROLLMENT_STATUSES],
        ...(opts.cohortId ? { cohortId: opts.cohortId } : {}),
      },
      type: QueryTypes.SELECT,
    }
  );

  const counts = await sequelize.query<any>(
    `SELECT COUNT(*)::int AS active_enrollments,
            COUNT(*) FILTER (
              WHERE EXISTS (SELECT 1 FROM projects p WHERE p.enrollment_id = e.id)
            )::int AS with_project
       FROM enrollments e
      WHERE (e.status IS NULL OR e.status NOT IN (:departed))
        ${opts.cohortId ? 'AND e.cohort_id = :cohortId' : ''}`,
    {
      replacements: {
        departed: [...DEPARTED_ENROLLMENT_STATUSES],
        ...(opts.cohortId ? { cohortId: opts.cohortId } : {}),
      },
      type: QueryTypes.SELECT,
    }
  );

  const mapped: EnrollmentWithoutProject[] = rows.map((r) => ({
    enrollment_id: r.enrollment_id,
    student_name: r.student_name,
    student_email: r.student_email,
    cohort_id: r.cohort_id,
    cohort_name: r.cohort_name,
    payment_status: r.payment_status,
    enrollment_type: r.enrollment_type,
    tier: r.tier,
    amount_paid: r.amount_paid,
    enrolled_on: r.enrolled_on,
    internal: isInternal(r.student_email),
  }));

  const active = counts[0] ? Number(counts[0].active_enrollments) : 0;
  const withProject = counts[0] ? Number(counts[0].with_project) : 0;

  return {
    active_enrollments: active,
    with_project: withProject,
    without_project: mapped.length,
    paid_external_without_project: interventionList(mapped).length,
    rows: mapped,
  };
}
