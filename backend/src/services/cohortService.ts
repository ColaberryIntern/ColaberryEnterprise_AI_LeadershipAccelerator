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
  const totalEnrollments = await Enrollment.count();
  const paidEnrollments = await Enrollment.count({ where: { payment_status: 'paid' } });
  const pendingInvoice = await Enrollment.count({ where: { payment_status: 'pending_invoice' } });

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
