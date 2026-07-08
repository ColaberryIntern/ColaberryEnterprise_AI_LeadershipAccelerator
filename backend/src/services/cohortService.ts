import { Cohort, Enrollment } from '../models';
import { UpdateCohortInput } from '../schemas/cohortSchema';
import { AppError } from '../utils/AppError';
import { Op } from 'sequelize';

export async function listOpenCohorts() {
  return Cohort.findAll({
    where: {
      status: 'open',
      // Only show cohorts with seats available
    },
    attributes: ['id', 'name', 'start_date', 'core_day', 'core_time', 'optional_lab_day', 'max_seats', 'seats_taken'],
    order: [['start_date', 'ASC']],
  });
}

export async function listAllCohorts() {
  return Cohort.findAll({
    order: [['start_date', 'DESC']],
  });
}

/**
 * Pure placement logic: which open cohort a new Explorer (Open House signup) is
 * filed under. Picks the SOONEST upcoming open cohort — the open cohort whose
 * start_date is today or later, earliest first — so prospects land in the next
 * real intake rather than the farthest-out cohort. Fallbacks, in order:
 *   1. soonest open cohort with start_date >= today
 *   2. if every open cohort has already started, the most-recently-started open one
 *   3. if no cohort is open at all, the most recently created cohort
 * Pure + I/O-free so it is unit-testable; `now` is injected by the caller.
 */
export function selectNextOpenCohort<
  T extends { status: string; start_date: string; created_at?: Date | string | null }
>(cohorts: T[], now: Date): T | null {
  const today = now.toISOString().slice(0, 10);
  const open = cohorts.filter((c) => c.status === 'open');

  const upcoming = open
    .filter((c) => String(c.start_date) >= today)
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
  if (upcoming.length) return upcoming[0];

  const started = [...open].sort((a, b) =>
    String(b.start_date).localeCompare(String(a.start_date))
  );
  if (started.length) return started[0];

  const byCreated = [...cohorts].sort(
    (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
  );
  return byCreated[0] ?? null;
}

export async function getLatestOpenCohort(): Promise<Cohort | null> {
  // Placement for new Explorers (Open House signups). Historically this picked
  // the open cohort with the LATEST start_date, which filed every new signup
  // into the farthest-out cohort (e.g. a November cohort instead of the imminent
  // July one). It now picks the SOONEST upcoming open cohort. Name retained for
  // the single call site (enrollmentService). See selectNextOpenCohort.
  const cohorts = await Cohort.findAll();
  return selectNextOpenCohort(cohorts, new Date());
}

export async function getCohortDetail(id: string) {
  const cohort = await Cohort.findByPk(id, {
    include: [{ model: Enrollment, as: 'enrollments' }],
  });
  if (!cohort) throw new AppError('Cohort not found', 404);
  return cohort;
}

export async function updateCohort(id: string, data: UpdateCohortInput) {
  const cohort = await Cohort.findByPk(id);
  if (!cohort) throw new AppError('Cohort not found', 404);
  await cohort.update(data);
  return cohort;
}

export async function getDashboardStats() {
  const cohorts = await Cohort.findAll();
  // Explorers (Open House visitors) are not paying students — exclude them from
  // enrollment/pipeline counts so they never skew the dashboard.
  const notExplorer = { enrollment_type: { [Op.ne]: 'explorer' } };
  const totalEnrollments = await Enrollment.count({ where: notExplorer as any });
  const paidEnrollments = await Enrollment.count({
    where: { payment_status: 'paid', ...notExplorer } as any,
  });
  const pendingInvoice = await Enrollment.count({
    where: { payment_status: ['pending', 'pending_invoice'] as any, ...notExplorer } as any,
  });

  const openCohorts = cohorts.filter((c) => c.status === 'open');
  const totalSeatsRemaining = openCohorts.reduce(
    (sum, c) => sum + (c.max_seats - c.seats_taken),
    0
  );
  const upcomingCohorts = cohorts.filter(
    (c) => c.status === 'open' && new Date(c.start_date) > new Date()
  ).length;

  return {
    totalRevenue: paidEnrollments * 4500,
    totalEnrollments,
    paidEnrollments,
    pendingInvoice,
    seatsRemaining: totalSeatsRemaining,
    upcomingCohorts,
  };
}
