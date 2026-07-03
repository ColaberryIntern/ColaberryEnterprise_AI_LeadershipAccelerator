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

export async function getLatestOpenCohort(): Promise<Cohort | null> {
  // The cohort new Explorers (Open House signups) are placed under: the open
  // cohort with the latest start_date. Falls back to the most recently created
  // cohort if none are open.
  const open = await Cohort.findOne({
    where: { status: 'open' },
    order: [['start_date', 'DESC']],
  });
  if (open) return open;
  return Cohort.findOne({ order: [['created_at', 'DESC']] });
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
