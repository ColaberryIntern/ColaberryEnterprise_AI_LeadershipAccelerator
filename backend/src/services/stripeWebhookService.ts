import StripeLib from 'stripe';
import { Cohort, Enrollment } from '../models';
import EnrollmentLead from '../models/EnrollmentLead';
import { enrollInClassReadinessCampaign } from './enrollmentService';
import { runEnrollmentAutomation } from './automationService';

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';
const DISABLE_STRIPE_WEBHOOKS = process.env.DISABLE_STRIPE_WEBHOOKS === 'true';

// ── Metadata keys set on the Stripe checkout session at purchase time ──────────
// intensives     → comma-separated SKUs e.g. "AISA-S1,AISA-S2" or "AISA-BUNDLE"
// cohort         → cohort number as string e.g. "1"
// industry_track → e.g. "Finance", "Healthcare"
// referral_source → "mailchimp" | "landing_direct" | "partner" | "anthropic"

type StripeInstance = StripeLib.Stripe;
type StripeEvent = ReturnType<StripeInstance['webhooks']['constructEvent']>;

function getStripeClient(): StripeInstance {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  return new StripeLib(key, { apiVersion: '2026-05-27.dahlia' });
}

export function constructStripeEvent(rawBody: Buffer, signature: string): StripeEvent {
  if (!STRIPE_WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  const stripe = getStripeClient();
  return stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
}

export async function handleStripeEvent(event: StripeEvent): Promise<void> {
  if (DISABLE_STRIPE_WEBHOOKS) {
    console.log(JSON.stringify({ level: 'info', service: 'backend', event: 'stripe_webhook_disabled', outcome: 'skipped', context: { type: event.type } }));
    return;
  }

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object as CheckoutSession);
      break;
    case 'payment_intent.payment_failed':
      await handlePaymentFailed(event.data.object as PaymentIntent);
      break;
    case 'charge.refunded':
      await handleChargeRefunded(event.data.object as Charge);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object as Subscription);
      break;
    default:
      console.log(JSON.stringify({ level: 'info', service: 'backend', event: 'stripe_webhook_unhandled', outcome: 'skipped', context: { type: event.type } }));
  }
}

// ── Minimal shapes of the Stripe objects we actually use ──────────────────────
// Only the fields we read; avoids depending on StripeLib's deep type namespace.
interface CheckoutSession {
  id: string;
  created: number;
  payment_intent: string | { id: string } | null;
  customer_email: string | null;
  amount_total: number | null;
  customer_details?: { email?: string | null; name?: string | null; phone?: string | null } | null;
  metadata?: Record<string, string> | null;
}

interface PaymentIntent {
  id: string;
  last_payment_error?: { message?: string | null } | null;
}

interface Charge {
  id: string;
  payment_intent: string | { id: string } | null;
}

interface Subscription {
  id: string;
  customer: string | { id: string };
}

// ─────────────────────────────────────────────────────────────────────────────

async function handleCheckoutCompleted(session: CheckoutSession): Promise<void> {
  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id ?? null;

  if (!paymentIntentId) {
    console.error(JSON.stringify({ level: 'error', service: 'backend', event: 'stripe_checkout_no_pi', outcome: 'failure', error_class: 'ValidationError', context: { session_id: session.id } }));
    return;
  }

  // Idempotency guard — skip if this payment intent was already processed
  const existing = await Enrollment.findOne({ where: { stripe_payment_intent_id: paymentIntentId } });
  if (existing) {
    console.log(JSON.stringify({ level: 'info', service: 'backend', event: 'stripe_checkout_duplicate', outcome: 'skipped', context: { payment_intent_id: paymentIntentId, enrollment_id: existing.id } }));
    return;
  }

  const meta = session.metadata ?? {};
  const cohortNumber = meta['cohort'] ? parseInt(meta['cohort'], 10) : null;
  const intensives = meta['intensives'] ?? meta['intensive(s)'] ?? null;
  const industryTrack = meta['industry_track'] ?? null;
  const referralSource = meta['referral_source'] ?? null;

  const email = session.customer_details?.email ?? session.customer_email;
  const name = session.customer_details?.name ?? 'Unknown';
  const phone = session.customer_details?.phone ?? undefined;
  const amountPaid = session.amount_total ? session.amount_total / 100 : null;

  if (!email) {
    console.error(JSON.stringify({ level: 'error', service: 'backend', event: 'stripe_checkout_no_email', outcome: 'failure', error_class: 'ValidationError', context: { session_id: session.id } }));
    return;
  }

  // Resolve cohort by number, fall back to first open cohort
  let cohort = cohortNumber !== null
    ? await (Cohort as any).findOne({ where: { cohort_number: cohortNumber } })
    : null;
  if (!cohort) {
    cohort = await (Cohort as any).findOne({ where: { status: 'open' }, order: [['created_at', 'ASC']] });
  }
  if (!cohort) {
    console.error(JSON.stringify({ level: 'error', service: 'backend', event: 'stripe_checkout_no_cohort', outcome: 'failure', error_class: 'ValidationError', context: { session_id: session.id, cohort_number: cohortNumber } }));
    return;
  }

  const enrollment = await Enrollment.create({
    full_name: name,
    email: email.toLowerCase().trim(),
    company: '',
    cohort_id: cohort.id,
    stripe_session_id: session.id,
    stripe_payment_intent_id: paymentIntentId,
    intensives: intensives ?? undefined,
    industry_track: industryTrack ?? undefined,
    referral_channel: referralSource ?? undefined,
    amount_paid: amountPaid ?? undefined,
    enrolled_at: new Date(session.created * 1000),
    payment_status: 'paid',
    payment_method: 'credit_card',
    payment_mode: 'live',
    status: 'active',
    phone: phone ?? undefined,
  });

  await Cohort.increment('seats_taken', { by: 1, where: { id: cohort.id } });

  console.log(JSON.stringify({ level: 'info', service: 'backend', event: 'stripe_enrollment_created', outcome: 'success', context: { enrollment_id: enrollment.id, email, cohort_id: cohort.id, amount_paid: amountPaid } }));

  await upsertEnrollmentLead({ name, email: email.toLowerCase().trim(), phone, referralSource, enrollmentId: enrollment.id });

  // Non-blocking downstream automations
  import('./projectService').then(ps =>
    ps.createProjectForEnrollment(enrollment.id)
  ).catch(err => console.error('[Stripe] Project auto-create failed:', (err as Error).message));

  enrollInClassReadinessCampaign(enrollment)
    .catch(err => console.error('[Stripe] Class readiness error:', (err as Error).message));

  runEnrollmentAutomation({
    id: enrollment.id,
    email: enrollment.email,
    full_name: enrollment.full_name,
    phone: enrollment.phone ?? undefined,
    cohort: {
      name: cohort.name,
      start_date: cohort.start_date,
      core_day: cohort.core_day,
      core_time: cohort.core_time,
      optional_lab_day: cohort.optional_lab_day ?? undefined,
    },
  }).catch(err => console.error('[Stripe] Automation error:', (err as Error).message));
}

async function handlePaymentFailed(paymentIntent: PaymentIntent): Promise<void> {
  const enrollment = await Enrollment.findOne({ where: { stripe_payment_intent_id: paymentIntent.id } });

  console.log(JSON.stringify({
    level: 'warn', service: 'backend', event: 'stripe_payment_failed', outcome: 'failure',
    error_class: 'PaymentFailedError',
    context: { payment_intent_id: paymentIntent.id, enrollment_id: enrollment?.id ?? null, failure_message: paymentIntent.last_payment_error?.message ?? 'unknown' },
  }));

  if (enrollment && enrollment.payment_status !== 'paid') {
    enrollment.payment_status = 'failed';
    await enrollment.save();
  }
}

async function handleChargeRefunded(charge: Charge): Promise<void> {
  const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id ?? null;
  if (!paymentIntentId) return;

  const enrollment = await Enrollment.findOne({ where: { stripe_payment_intent_id: paymentIntentId } });
  if (!enrollment) {
    console.warn(JSON.stringify({ level: 'warn', service: 'backend', event: 'stripe_refund_no_enrollment', outcome: 'skipped', context: { charge_id: charge.id, payment_intent_id: paymentIntentId } }));
    return;
  }

  enrollment.status = 'withdrawn';
  enrollment.payment_status = 'failed';
  await enrollment.save();

  await EnrollmentLead.update({ status: 'churned' }, { where: { enrollment_id: enrollment.id } });

  console.log(JSON.stringify({ level: 'info', service: 'backend', event: 'stripe_refund_processed', outcome: 'success', context: { enrollment_id: enrollment.id, charge_id: charge.id } }));
}

async function handleSubscriptionDeleted(subscription: Subscription): Promise<void> {
  // Post-grad memberships ($79/$149/mo) — log for now; no enrollment row to update
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  console.log(JSON.stringify({ level: 'info', service: 'backend', event: 'stripe_subscription_deleted', outcome: 'logged', context: { subscription_id: subscription.id, customer_id: customerId } }));
}

async function upsertEnrollmentLead(params: {
  name: string;
  email: string;
  phone?: string;
  referralSource: string | null;
  enrollmentId: string;
}): Promise<void> {
  const [lead, created] = await EnrollmentLead.findOrCreate({
    where: { email: params.email },
    defaults: {
      name: params.name,
      email: params.email,
      phone: params.phone,
      referral_channel: params.referralSource ?? undefined,
      status: 'enrolled',
      enrollment_id: params.enrollmentId,
    },
  });

  if (!created) {
    lead.status = 'enrolled';
    lead.enrollment_id = params.enrollmentId;
    if (params.phone && !lead.phone) lead.phone = params.phone;
    lead.updated_at = new Date();
    await lead.save();
  }
}
