import { Cohort, Enrollment, Lead, Campaign } from '../models';
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
  const enrollment = await Enrollment.create({
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

  // Auto-create project (non-blocking)
  import('./projectService').then(ps =>
    ps.createProjectForEnrollment(enrollment.id)
  ).catch(err => console.error('[Project] Auto-create failed:', err.message));

  // Auto-enroll in payment readiness campaign (non-blocking)
  enrollInPaymentCampaignIfUnpaid(enrollment)
    .catch(err => console.error('[Payment Campaign] Auto-enroll failed:', err.message));

  return enrollment;
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

  // Auto-create project (non-blocking)
  import('./projectService').then(ps =>
    ps.createProjectForEnrollment(enrollment.id)
  ).catch(err => console.error('[Project] Auto-create failed:', err.message));

  // Increment seats immediately for invoice requests
  await Cohort.increment('seats_taken', {
    by: 1,
    where: { id: data.cohort_id },
  });

  // Auto-enroll in payment readiness campaign (non-blocking)
  enrollInPaymentCampaignIfUnpaid(enrollment)
    .catch(err => console.error('[Payment Campaign] Auto-enroll failed:', err.message));

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

  // Auto-exit from payment readiness campaign (non-blocking)
  exitPaymentCampaign(enrollment.email)
    .catch(err => console.error('[Payment Campaign] Auto-exit failed:', err.message));

  return enrollment;
}

export async function getEnrollmentBySessionId(stripeSessionId: string) {
  return Enrollment.findOne({
    where: { stripe_session_id: stripeSessionId },
    include: [{ model: Cohort, as: 'cohort' }],
  });
}

export async function createAdminEnrollment(data: {
  full_name: string;
  email: string;
  company: string;
  title?: string;
  phone?: string;
  company_size?: string;
  cohort_id: string;
  notes?: string;
}): Promise<Enrollment> {
  const existing = await Enrollment.findOne({
    where: { email: data.email.toLowerCase().trim(), cohort_id: data.cohort_id },
  });
  if (existing) {
    throw new AppError('An enrollment already exists for this email in this cohort', 400);
  }

  const cohort = await Cohort.findByPk(data.cohort_id);
  if (!cohort) throw new AppError('Cohort not found', 404);

  const enrollment = await Enrollment.create({
    full_name: data.full_name,
    email: data.email.toLowerCase().trim(),
    company: data.company,
    title: data.title || undefined,
    phone: data.phone || undefined,
    company_size: data.company_size || undefined,
    cohort_id: data.cohort_id,
    payment_status: 'paid',
    payment_method: 'invoice',
    status: 'active',
    portal_enabled: false,
    notes: data.notes || 'Manually added by admin',
  });

  await Cohort.increment('seats_taken', { by: 1, where: { id: data.cohort_id } });

  // Auto-create project (non-blocking)
  import('./projectService').then(ps =>
    ps.createProjectForEnrollment(enrollment.id)
  ).catch(err => console.error('[Project] Auto-create failed:', err.message));

  return enrollment;
}

/* ------------------------------------------------------------------ */
/*  Payment Readiness Campaign Helpers                                 */
/* ------------------------------------------------------------------ */

const PAYMENT_READINESS_CAMPAIGN_NAME = 'Payment Readiness Campaign';

async function enrollInPaymentCampaignIfUnpaid(enrollment: Enrollment): Promise<void> {
  if (enrollment.payment_status === 'paid') return;

  const campaign = await Campaign.findOne({
    where: { name: PAYMENT_READINESS_CAMPAIGN_NAME, status: 'active' },
  });
  if (!campaign) {
    console.log('[Payment Campaign] No active payment readiness campaign found — skipping');
    return;
  }

  // Find or create a Lead record for this enrollee
  const [lead] = await Lead.findOrCreate({
    where: { email: enrollment.email.toLowerCase().trim() },
    defaults: {
      name: enrollment.full_name,
      email: enrollment.email.toLowerCase().trim(),
      company: enrollment.company || '',
      title: enrollment.title || '',
      phone: enrollment.phone || '',
      source: 'enrollment',
      status: 'engaged',
    } as any,
  });

  const { enrollLeadsInCampaign } = await import('./campaignService');
  const results = await enrollLeadsInCampaign(campaign.id, [lead.id]);
  console.log(`[Payment Campaign] Enrolled lead ${lead.id} (${enrollment.email}):`, results);
}

async function exitPaymentCampaign(email: string): Promise<void> {
  const campaign = await Campaign.findOne({
    where: { name: PAYMENT_READINESS_CAMPAIGN_NAME },
  });
  if (!campaign) return;

  const lead = await Lead.findOne({
    where: { email: email.toLowerCase().trim() },
  });
  if (!lead) return;

  try {
    const { removeLeadFromCampaign } = await import('./campaignService');
    await removeLeadFromCampaign(campaign.id, lead.id);
    console.log(`[Payment Campaign] Exited lead ${lead.id} (${email}) — payment confirmed`);
  } catch (err: any) {
    // Lead may not be enrolled (e.g., admin-created enrollment that was always paid)
    if (err.message?.includes('not enrolled')) return;
    throw err;
  }
}
