import { Cohort, Enrollment } from '../models';
import { AppError } from '../utils/AppError';
import { CreateCheckoutSessionInput, CreateInvoiceRequestInput } from '../schemas/enrollmentSchema';

export async function validateCohortAvailability(cohortId: string): Promise<Cohort> {
  const cohort = await Cohort.findByPk(cohortId);
  if (!cohort) {
    throw new AppError('Cohort not found', 404);
  }
  if (cohort.status !== 'open') {
    throw new AppError('Cohort enrollment is closed', 400);
  }
  if (cohort.seats_taken >= cohort.max_seats) {
    throw new AppError('Cohort is full', 400);
  }
  return cohort;
}

export async function createPendingEnrollment(
  data: CreateCheckoutSessionInput,
  stripeSessionId: string
): Promise<Enrollment> {
  return Enrollment.create({
    full_name: data.full_name,
    email: data.email,
    company: data.company,
    title: data.title || undefined,
    phone: data.phone || undefined,
    company_size: data.company_size || undefined,
    cohort_id: data.cohort_id,
    stripe_session_id: stripeSessionId,
    payment_status: 'failed', // Pending until webhook confirms — use 'failed' as default
    payment_method: 'credit_card',
  });
}

export async function createInvoiceEnrollment(
  data: CreateInvoiceRequestInput
): Promise<Enrollment> {
  await validateCohortAvailability(data.cohort_id);

  const enrollment = await Enrollment.create({
    full_name: data.full_name,
    email: data.email,
    company: data.company,
    title: data.title || undefined,
    phone: data.phone || undefined,
    company_size: data.company_size || undefined,
    cohort_id: data.cohort_id,
    payment_status: 'pending_invoice',
    payment_method: 'invoice',
  });

  // Increment seats immediately for invoice requests
  await Cohort.increment('seats_taken', {
    by: 1,
    where: { id: data.cohort_id },
  });

  return enrollment;
}

export async function markEnrollmentPaid(stripeSessionId: string): Promise<Enrollment | null> {
  const enrollment = await Enrollment.findOne({
    where: { stripe_session_id: stripeSessionId },
  });

  if (!enrollment) return null;

  // Idempotent: if already paid, return without incrementing seats again
  if (enrollment.payment_status === 'paid') return enrollment;

  enrollment.payment_status = 'paid';
  await enrollment.save();

  // Increment seats on confirmed payment
  await Cohort.increment('seats_taken', {
    by: 1,
    where: { id: enrollment.cohort_id },
  });

  return enrollment;
}

export async function getEnrollmentBySessionId(stripeSessionId: string) {
  return Enrollment.findOne({
    where: { stripe_session_id: stripeSessionId },
    include: [{ model: Cohort, as: 'cohort' }],
  });
}
