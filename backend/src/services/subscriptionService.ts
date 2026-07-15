import { Enrollment, Cohort, Subscription } from '../models';
import { env } from '../config/env';
import { findOrCreateCustomer, createPaymentLink } from './paysimpleService';
import { isDemoCohortName } from './openHouseService';
import type { SubscriptionPlan } from '../models/Subscription';

/**
 * subscriptionService — student self-serve billing.
 *
 * Two plans: Annual ($1,788/yr ≈ $149/mo) and Monthly ($199/mo, month-to-month).
 * V1 flow (per the "one-time now, auto-renew later" decision): a plan checkout is
 * a PaySimple one-time hosted payment (card or bank). On the payment webhook the
 * subscription activates, the student converts Explorer → paying member (which
 * drops the Week-0 gate + demo mode), and `current_period_end` is set. Renewal is
 * a fresh checkout until PaySimple recurring is enabled; the schema already
 * carries the period so that upgrade is additive.
 *
 * Idempotency: the PaySimple `external_id` (SUB-<enrollment>-<ts>) is the unique
 * `payment_ref`; activation is a no-op once the row is already active, so a
 * duplicate webhook can't double-convert or double-charge.
 */

export interface PlanConfig {
  id: SubscriptionPlan;
  label: string;
  price: number;          // dollars charged this term
  amount_cents: number;
  cadence: 'year' | 'month';
  per_month: number;      // effective monthly cost, for display
  period_days: number;
  blurb: string;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** The amount actually charged for a plan: per-month × 12 for annual, per-month
 *  for monthly. Single source of truth so real prices ($149 / $199) drop in by
 *  editing per_month only. */
export function planChargeAmount(cfg: Pick<PlanConfig, 'per_month' | 'cadence'>): number {
  return round2(cfg.cadence === 'year' ? cfg.per_month * 12 : cfg.per_month);
}

/** Build a plan from its per-month rate; price + amount_cents are derived. */
function makePlan(id: SubscriptionPlan, label: string, per_month: number, cadence: 'year' | 'month', period_days: number, blurb: string): PlanConfig {
  const price = planChargeAmount({ per_month, cadence });
  return { id, label, per_month, cadence, period_days, blurb, price, amount_cents: Math.round(price * 100) };
}

// NOTE: per_month values are TEST amounts (annual $0.15/mo → $1.80/yr, monthly
// $0.19/mo). To go live, change ONLY the per_month numbers to 149 and 199.
export const PLANS: Record<SubscriptionPlan, PlanConfig> = {
  annual: makePlan('annual', 'Annual', 0.15, 'year', 365, 'Best value — pay once a year for full access to the program.'),
  monthly: makePlan('monthly', 'Monthly', 0.19, 'month', 30, 'Month-to-month. Cancel anytime.'),
};

const DAY_MS = 24 * 3600 * 1000;
const SUB_PREFIX = 'SUB-';
export const isSubscriptionRef = (externalId: string | undefined | null): boolean =>
  !!externalId && externalId.startsWith(SUB_PREFIX);

/** A cohort a PAYING subscriber must never be dropped into: demo/test fixtures,
 *  or the free Explorer / prospect holding cohorts. */
export function isNonPayingCohortName(name: string | null | undefined): boolean {
  return isDemoCohortName(name) || /explorer|prospect/i.test(name || '');
}

/** The paid cohort a subscriber is enrolled into ("July batch"): env override,
 *  else the soonest open cohort that is a real paid cohort (never a demo or the
 *  Explorer/prospect holding cohort). Null if none is configured. */
async function resolveTargetCohort(): Promise<Cohort | null> {
  const override = process.env.SUBSCRIPTION_TARGET_COHORT_ID;
  if (override) {
    const c = await Cohort.findByPk(override);
    if (c) return c;
  }
  const open = await Cohort.findAll({ where: { status: 'open' }, order: [['start_date', 'ASC']], limit: 10 });
  return open.find((c: any) => !isNonPayingCohortName(c.name)) || null;
}

/** The student's current subscription = newest non-failed row. */
async function currentSubscription(enrollmentId: string): Promise<Subscription | null> {
  const rows = await Subscription.findAll({
    where: { enrollment_id: enrollmentId },
    order: [['created_at', 'DESC']],
    limit: 5,
  });
  return rows.find((r) => r.status !== 'failed') || null;
}

export interface SubscriptionView {
  plans: PlanConfig[];
  needs_subscription: boolean;   // true for Explorers with no active plan
  subscription: null | {
    plan: SubscriptionPlan;
    status: string;
    amount_cents: number;
    started_at: string | null;
    current_period_end: string | null;
    canceled: boolean;
    cancel_reason: string | null;
    access_until: string | null;
    next_payment: { date: string; in_days: number } | null;
  };
}

export async function getSubscription(enrollmentId: string, nowMs: number = Date.now()): Promise<SubscriptionView> {
  const enrollment = await Enrollment.findByPk(enrollmentId, { attributes: ['enrollment_type'] });
  const isExplorer = (enrollment as any)?.enrollment_type === 'explorer';
  const sub = await currentSubscription(enrollmentId);
  const plans = [PLANS.annual, PLANS.monthly];

  if (!sub || sub.status === 'pending') {
    return { plans, needs_subscription: isExplorer, subscription: null };
  }

  const periodEnd = sub.current_period_end ? new Date(sub.current_period_end) : null;
  const canceled = sub.status === 'canceled';
  const active = sub.status === 'active';
  const next_payment = active && periodEnd
    ? { date: periodEnd.toISOString(), in_days: Math.max(0, Math.ceil((periodEnd.getTime() - nowMs) / DAY_MS)) }
    : null;

  return {
    plans,
    needs_subscription: isExplorer && !active,
    subscription: {
      plan: sub.plan,
      status: sub.status,
      amount_cents: sub.amount_cents,
      started_at: sub.started_at ? new Date(sub.started_at).toISOString() : null,
      current_period_end: periodEnd ? periodEnd.toISOString() : null,
      canceled,
      cancel_reason: sub.cancel_reason,
      access_until: canceled && periodEnd ? periodEnd.toISOString() : null,
      next_payment,
    },
  };
}

export type CheckoutResult =
  | { ok: true; payment_link: string; plan: SubscriptionPlan; amount: number }
  | { ok: false; reason: 'unknown_plan' | 'enrollment_not_found' | 'billing_unconfigured' | 'checkout_failed'; message?: string };

/** Start a hosted checkout for a plan. Creates a pending subscription keyed on
 *  the PaySimple external_id and returns the payment link to redirect to. */
export async function startCheckout(enrollmentId: string, plan: SubscriptionPlan, nowMs: number = Date.now()): Promise<CheckoutResult> {
  const cfg = PLANS[plan];
  if (!cfg) return { ok: false, reason: 'unknown_plan' };
  if (!env.paysimpleApiUser || !env.paysimpleApiKey) return { ok: false, reason: 'billing_unconfigured' };

  const enrollment = await Enrollment.findByPk(enrollmentId);
  if (!enrollment) return { ok: false, reason: 'enrollment_not_found' };

  // PaySimple caps external_id at 50 chars. UUID-with-dashes (36) + prefix +
  // timestamp overflowed (54); use the dashless hex (32) + base36 time → ~45.
  const externalId = `${SUB_PREFIX}${enrollmentId.replace(/-/g, '')}-${nowMs.toString(36)}`;
  const nameParts = (enrollment.full_name || '').trim().split(/\s+/);
  const firstName = nameParts[0] || enrollment.full_name || 'Student';
  const lastName = nameParts.slice(1).join(' ') || '-';

  try {
    const customer = await findOrCreateCustomer({
      fullName: enrollment.full_name || 'Student',
      email: enrollment.email,
      company: enrollment.company || 'Individual',
      phone: enrollment.phone || undefined,
    });

    const link = await createPaymentLink({
      externalId,
      cohortName: `${cfg.label} plan`,
      amount: planChargeAmount(cfg),  // charge the plan's amount (test or real), not the $0.01 override
      exactAmount: true,
      customerFirstName: firstName,
      customerLastName: lastName,
      customerEmail: enrollment.email,
    });

    await Subscription.create({
      enrollment_id: enrollmentId,
      plan,
      status: 'pending',
      amount_cents: cfg.amount_cents,
      payment_ref: externalId,
      paysimple_customer_id: String(customer.Id),
      created_at: new Date(nowMs),
      updated_at: new Date(nowMs),
    });

    return { ok: true, payment_link: link.payment_link, plan, amount: cfg.price };
  } catch (err: any) {
    console.error('[Subscription] checkout failed:', err?.message);
    return { ok: false, reason: 'checkout_failed', message: err?.message };
  }
}

/**
 * Activate a subscription from a confirmed payment (called by the PaySimple
 * webhook when the external_id is a SUB- ref). Idempotent: a second call for an
 * already-active subscription is a no-op. On first activation, converts the
 * enrollment from Explorer to a paying member and enrolls them in the paid
 * cohort — which drops the Week-0 gate and demo mode.
 */
export async function activateByRef(
  paymentRef: string,
  opts: { paymentId?: string | number; amount?: number } = {},
  nowMs: number = Date.now(),
): Promise<Subscription | null> {
  const sub = await Subscription.findOne({ where: { payment_ref: paymentRef } });
  if (!sub) return null;
  if (sub.status === 'active') return sub; // idempotent — already processed

  const cfg = PLANS[sub.plan] || PLANS.monthly;
  const now = new Date(nowMs);
  const periodEnd = new Date(nowMs + cfg.period_days * DAY_MS);

  await sub.update({
    status: 'active',
    started_at: now,
    current_period_end: periodEnd,
    paysimple_payment_id: opts.paymentId != null ? String(opts.paymentId) : sub.paysimple_payment_id,
    canceled_at: null,
    cancel_reason: null,
    updated_at: now,
  });

  // Convert Explorer → paying member. Flipping enrollment_type off 'explorer'
  // drops the Week-0 timeline gate and the Projects demo lock automatically.
  const enrollment = await Enrollment.findByPk(sub.enrollment_id);
  if (enrollment) {
    const cohort = enrollment.cohort_id ? null : await resolveTargetCohort();
    await enrollment.update({
      enrollment_type: 'standard',
      tier: 'member',
      payment_status: 'paid',
      status: 'active',
      portal_enabled: true,
      cohort_id: enrollment.cohort_id || (cohort ? cohort.id : enrollment.cohort_id),
      amount_paid: typeof opts.amount === 'number' && opts.amount > 0 ? opts.amount : cfg.price,
      payment_mode: env.paymentMode === 'live' ? 'live' : 'test',
      enrolled_at: enrollment.enrolled_at || now,
    });
  }
  return sub;
}

export type CancelResult =
  | { ok: true; access_until: string | null }
  | { ok: false; reason: 'no_active_subscription' };

/** Cancel the active subscription, capturing the reason. Access is retained
 *  through the end of the paid period; no immediate revocation. */
export async function cancelSubscription(enrollmentId: string, reason: string, nowMs: number = Date.now()): Promise<CancelResult> {
  const sub = await currentSubscription(enrollmentId);
  if (!sub || sub.status !== 'active') return { ok: false, reason: 'no_active_subscription' };
  const now = new Date(nowMs);
  await sub.update({
    status: 'canceled',
    canceled_at: now,
    cancel_reason: (reason || '').slice(0, 2000) || 'No reason given',
    updated_at: now,
  });
  return { ok: true, access_until: sub.current_period_end ? new Date(sub.current_period_end).toISOString() : null };
}

const RETURN_ACTIVATE_WINDOW_MS = 30 * 60 * 1000; // only a checkout started in the last 30 min

/**
 * Called when the student returns from the PaySimple checkout (the app polls
 * this). On PROD, activation is driven by the signed webhook — this just reports
 * the current status so the UI updates once that lands. On DEV (env flag
 * `SUBSCRIPTION_ALLOW_RETURN_ACTIVATE=true`), where the webhook can't reach the
 * instance, it activates the most-recent pending subscription so the flow can be
 * tested end-to-end. The flag is OFF in production, so no unpaid activation.
 */
export async function confirmCheckout(enrollmentId: string, nowMs: number = Date.now()): Promise<{ activated: boolean; view: SubscriptionView }> {
  const current = await currentSubscription(enrollmentId);
  if (current && current.status === 'active') {
    return { activated: false, view: await getSubscription(enrollmentId, nowMs) };
  }

  if (process.env.SUBSCRIPTION_ALLOW_RETURN_ACTIVATE === 'true') {
    const pending = await Subscription.findOne({
      where: { enrollment_id: enrollmentId, status: 'pending' },
      order: [['created_at', 'DESC']],
    });
    if (pending && (nowMs - new Date(pending.created_at).getTime()) < RETURN_ACTIVATE_WINDOW_MS) {
      await activateByRef(pending.payment_ref, {}, nowMs);
      return { activated: true, view: await getSubscription(enrollmentId, nowMs) };
    }
  }

  return { activated: false, view: await getSubscription(enrollmentId, nowMs) };
}
