import { Op } from 'sequelize';
import { Enrollment, Cohort, Subscription } from '../models';
import { env } from '../config/env';
import { findOrCreateCustomer, createPaymentLink } from './paysimpleService';
import { isDemoCohortName } from './openHouseService';
import {
  availableCreditRows, getAvailableCreditCents, selectCreditsUpTo, creditApplyTarget,
  consumeCreditsForSubscription,
} from './accountCreditService';
import { retireRedundantExplorerAccounts } from './enrollmentService';
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

// A comped seat's billing period — ~10 years, so an admin grant never lapses on
// its own (revoked explicitly via revokeFreeAccess).
const COMP_PERIOD_DAYS = 3650;

// Real prices: annual $149/mo → $1,788/yr (per_month × 12), monthly $199/mo.
export const PLANS: Record<SubscriptionPlan, PlanConfig> = {
  annual: makePlan('annual', 'Annual', 149, 'year', 365, 'Best value — pay once a year for full access to the program.'),
  monthly: makePlan('monthly', 'Monthly', 199, 'month', 30, 'Month-to-month. Cancel anytime.'),
  // Admin-only comped seat (Free Access). $0, ~10-year period so it never lapses
  // on its own. Never listed for self-serve checkout (see getSubscription /
  // startCheckout) — granted only via grantFreeAccess().
  comp: makePlan('comp', 'Free Access', 0, 'year', COMP_PERIOD_DAYS, 'Comped seat — full program access at no charge.'),
};

const DAY_MS = 24 * 3600 * 1000;
const SUB_PREFIX = 'SUB-';
export const isSubscriptionRef = (externalId: string | undefined | null): boolean =>
  !!externalId && externalId.startsWith(SUB_PREFIX);

/**
 * Billing anchor: paying early never costs time. If the payment lands BEFORE
 * the class start date, the billing period starts on the class start date —
 * pay on 7/20 for a class starting 7/23 and the month runs 7/23 → 8/23, not
 * 7/20 → 8/20. If payment lands on/after class start, it anchors on payment
 * time as before. `cohortStartDate` is the cohorts.start_date DATEONLY
 * ('YYYY-MM-DD'), parsed as UTC midnight; missing/invalid dates fall back to
 * payment time (never blocks an activation).
 */
export function billingAnchorMs(paymentMs: number, cohortStartDate?: string | null): number {
  if (!cohortStartDate) return paymentMs;
  const startMs = Date.parse(`${String(cohortStartDate).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(startMs)) return paymentMs;
  return Math.max(paymentMs, startMs);
}

/**
 * End of a billing period: +1 calendar month (monthly) or +1 calendar year
 * (annual) from the anchor — "a month" means the same day next month (7/23 →
 * 8/23), clamped to the last day when the target month is shorter (1/31 →
 * 2/28). Calendar math replaces the old fixed 30/365-day window so the period
 * end matches what a subscriber expects.
 */
export function periodEndMs(anchorMs: number, cadence: 'year' | 'month'): number {
  const d = new Date(anchorMs);
  const targetYear = cadence === 'year' ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
  const targetMonth = cadence === 'year' ? d.getUTCMonth() : d.getUTCMonth() + 1;
  const lastDayOfTarget = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return Date.UTC(
    targetYear, targetMonth, Math.min(d.getUTCDate(), lastDayOfTarget),
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds(),
  );
}

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
  const open = (await Cohort.findAll({ where: { status: 'open' }, order: [['start_date', 'ASC']], limit: 10 })) || [];
  // Never route a paying subscriber into the free Explorer/demo buckets OR a private
  // business/owner workspace (cohort_type='business').
  return open.find((c: any) => !isNonPayingCohortName(c.name) && String(c.cohort_type ?? '').toLowerCase() !== 'business') || null;
}

/**
 * The paid cohort this enrollment lands in on payment: the student's own
 * selection (Settings → Enrollment tab sets enrollment.cohort_id) when it is a
 * real paid cohort; the default target when they have none. An Explorer whose
 * cohort_id points at the Explorer/prospect/demo bucket is REROUTED to the real
 * paid cohort — previously a paying Explorer silently stayed in the Explorer
 * bucket. An unknown cohort_id (row deleted) is left untouched (no reroute).
 */
async function resolvePaidCohortFor(enrollment: { cohort_id?: string | null } | null): Promise<Cohort | null> {
  if (enrollment?.cohort_id) {
    const current = await Cohort.findByPk(enrollment.cohort_id);
    if (!current) return null; // conservative: keep the assignment we can't inspect
    if (!isNonPayingCohortName((current as any).name)) return current;
    // Explorer/demo bucket → fall through to the real paid cohort.
  }
  return resolveTargetCohort();
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
  /** The class the student's payment counts toward — powers the "your billing
   *  month starts on your class start date" note. Null when no paid cohort is
   *  configured. is_future = class hasn't started yet (early-pay anchor applies). */
  class_start: null | { cohort_id: string; cohort_name: string; start_date: string; is_future: boolean };
  /** Unspent account credit (e.g. the $50 Open House deposit) applied to the
   *  next payment. 0 when none. */
  available_credit_cents: number;
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
  const enrollment = await Enrollment.findByPk(enrollmentId, { attributes: ['enrollment_type', 'cohort_id'] });
  const isExplorer = (enrollment as any)?.enrollment_type === 'explorer';
  const sub = await currentSubscription(enrollmentId);
  const plans = [PLANS.annual, PLANS.monthly];

  // Unspent account credit (Open House $50 deposit) applied to the next payment.
  const available_credit_cents = await getAvailableCreditCents(enrollmentId);

  // The class this student's payment counts toward (their selection, else the
  // default target cohort) — lets the UI explain the early-pay billing anchor.
  const paidCohort = enrollment ? await resolvePaidCohortFor(enrollment as any) : null;
  const startDate = paidCohort && (paidCohort as any).start_date ? String((paidCohort as any).start_date).slice(0, 10) : null;
  const class_start = paidCohort && startDate
    ? {
        cohort_id: (paidCohort as any).id,
        cohort_name: (paidCohort as any).name,
        start_date: startDate,
        is_future: Date.parse(`${startDate}T00:00:00Z`) > nowMs,
      }
    : null;

  if (!sub || sub.status === 'pending') {
    return { plans, needs_subscription: isExplorer, class_start, available_credit_cents, subscription: null };
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
    class_start,
    available_credit_cents,
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
  | { ok: true; payment_link: string; plan: SubscriptionPlan; amount: number; full_amount: number; applied_credit: number }
  | { ok: false; reason: 'unknown_plan' | 'enrollment_not_found' | 'billing_unconfigured' | 'checkout_failed'; message?: string };

/** Start a hosted checkout for a plan. Creates a pending subscription keyed on
 *  the PaySimple external_id and returns the payment link to redirect to. */
export async function startCheckout(enrollmentId: string, plan: SubscriptionPlan, nowMs: number = Date.now()): Promise<CheckoutResult> {
  // Only the two self-serve paid plans are checkout-able. 'comp' (Free Access) is
  // admin-granted, never chargeable, so it must never reach a hosted checkout.
  if (plan !== 'annual' && plan !== 'monthly') return { ok: false, reason: 'unknown_plan' };
  const cfg = PLANS[plan];
  if (!cfg) return { ok: false, reason: 'unknown_plan' };
  if (!env.paysimpleApiUser || !env.paysimpleApiKey) return { ok: false, reason: 'billing_unconfigured' };

  const enrollment = await Enrollment.findByPk(enrollmentId);
  if (!enrollment) return { ok: false, reason: 'enrollment_not_found' };

  // Apply any account credit (e.g. the $50 Open House deposit) to THIS charge:
  // pick whole credit rows up to the payable target so the amount PaySimple is
  // asked to charge is reduced. The credit is not consumed until the payment
  // settles (activateByRef) — a checkout the student abandons keeps the credit.
  const creditRows = await availableCreditRows(enrollmentId);
  const { appliedCents } = selectCreditsUpTo(creditRows, creditApplyTarget(cfg.amount_cents));
  const chargeCents = cfg.amount_cents - appliedCents;
  const chargeAmount = round2(chargeCents / 100);

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
      cohortName: appliedCents > 0 ? `${cfg.label} (−$${round2(appliedCents / 100)} credit)` : `${cfg.label} plan`,
      // Real plan amount less any account credit, on prod (live mode). On dev
      // (PAYMENT_MODE=test) the service reduces this to $0.01 so checkout can be
      // tested without a real charge.
      amount: chargeAmount,
      customerFirstName: firstName,
      customerLastName: lastName,
      customerEmail: enrollment.email,
    });

    await Subscription.create({
      enrollment_id: enrollmentId,
      plan,
      status: 'pending',
      amount_cents: cfg.amount_cents,          // full recurring price (unchanged by the credit)
      applied_credit_cents: appliedCents,      // discount taken off this first charge
      payment_ref: externalId,
      paysimple_customer_id: String(customer.Id),
      created_at: new Date(nowMs),
      updated_at: new Date(nowMs),
    });

    return { ok: true, payment_link: link.payment_link, plan, amount: chargeAmount, full_amount: cfg.price, applied_credit: round2(appliedCents / 100) };
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

  // Anchor the billing period to the class start date: the student's paid
  // cohort is resolved FIRST so an early payment starts its period on class
  // day (pay 7/20, class 7/23 → period 7/23 → 8/23). Paying early only locks
  // the seat sooner — it never shortens the first month.
  const enrollment = await Enrollment.findByPk(sub.enrollment_id);
  const cohort = enrollment ? await resolvePaidCohortFor(enrollment) : null;
  const cohortStart = cohort && (cohort as any).start_date ? String((cohort as any).start_date) : null;
  const anchorMs = billingAnchorMs(nowMs, cohortStart);
  const periodEnd = new Date(periodEndMs(anchorMs, cfg.cadence));

  await sub.update({
    status: 'active',
    started_at: new Date(anchorMs),
    current_period_end: periodEnd,
    paysimple_payment_id: opts.paymentId != null ? String(opts.paymentId) : sub.paysimple_payment_id,
    canceled_at: null,
    cancel_reason: null,
    updated_at: now,
  });

  // Convert Explorer → paying member. Flipping enrollment_type off 'explorer'
  // drops the Week-0 timeline gate and the Projects demo lock automatically.
  if (enrollment) {
    await grantMembership(enrollment, {
      cohortId: cohort ? cohort.id : enrollment.cohort_id,
      amountPaid: typeof opts.amount === 'number' && opts.amount > 0 ? opts.amount : cfg.price,
      now, // enrolled_at falls back to this only if the enrollment has none yet
    });
  }

  // Spend the account credit that discounted this checkout — mark those ledger
  // rows applied + link them to this subscription. Idempotent on the sub id, so
  // a duplicate payment webhook never double-consumes the credit.
  const appliedCreditCents = (sub as any).applied_credit_cents || 0;
  if (appliedCreditCents > 0) {
    try {
      await consumeCreditsForSubscription(sub.enrollment_id, sub.id, appliedCreditCents, nowMs);
    } catch (err: any) {
      // Never fail an activation over credit bookkeeping — the payment cleared.
      console.error('[Subscription] credit consume failed (non-fatal):', err?.message);
    }
  }
  return sub;
}

/**
 * The single definition of "this enrollment has a paid seat" — shared by paid
 * activation (activateByRef) and comped grants (grantFreeAccess). Flipping
 * enrollment_type off 'explorer' is what drops the Week-0 timeline gate and the
 * Projects demo lock; the rest marks it paid/active/portal-enabled. Kept in one
 * place so the two callers can never drift apart.
 */
async function grantMembership(
  enrollment: Enrollment,
  opts: { cohortId: string | null; amountPaid: number; now: Date },
): Promise<void> {
  await enrollment.update({
    enrollment_type: 'standard',
    tier: 'member',
    payment_status: 'paid',
    status: 'active',
    portal_enabled: true,
    cohort_id: opts.cohortId ?? enrollment.cohort_id,
    amount_paid: opts.amountPaid,
    payment_mode: env.paymentMode === 'live' ? 'live' : 'test',
    enrolled_at: enrollment.enrolled_at || opts.now,
  });

  // The legacy CB- payment path (markEnrollmentPaid, enrollmentService.ts) has
  // always retired a paying student's lingering free Explorer duplicate on
  // confirmation -- this self-serve path (activateByRef, and grantFreeAccess
  // below, both funnel through here) never did, which is a real reason 8+
  // students found live 2026-07-31 ended up with an active Explorer duplicate
  // shadowing their real, newly-paid account. Best-effort + idempotent, same
  // as the legacy call: never blocks or fails the activation itself.
  retireRedundantExplorerAccounts(enrollment.email, enrollment.id).catch((err: any) =>
    console.error('[Subscription] Explorer reconcile failed (non-fatal):', err?.message),
  );
}

const COMP_PREFIX = 'COMP-';

/** Every enrollment id sharing this one's email (case-insensitive), including
 *  itself — a person can span more than one enrollment row (an Explorer-shaped
 *  duplicate alongside their real paid/comped row), and Free Access must be
 *  read/written consistently regardless of which sibling row an admin happens
 *  to have open. Takes the email directly (callers that already have the
 *  enrollment loaded pass its email straight through — no redundant re-fetch).
 *  Falls back to just the requested id if there's no email or no siblings. */
async function resolveSiblingEnrollmentIds(enrollmentId: string, email: string | null | undefined): Promise<string[]> {
  const normalizedEmail = email ? email.toLowerCase().trim() : '';
  if (!normalizedEmail) return [enrollmentId];
  const siblings = await Enrollment.findAll({ where: { email: { [Op.iLike]: normalizedEmail } }, attributes: ['id'] });
  return siblings.length ? siblings.map((s) => s.id) : [enrollmentId];
}

/**
 * Admin grant — "Free Access": comp a seat (100% discount) for anyone, with NO
 * employee/staff role. The person gets the NORMAL student experience (normal
 * curriculum gating), just never billed — distinct from staff, who bypass
 * gating. Creates (idempotently) an active 'comp' subscription so the paywall
 * clears + the seat is labelled, then flips the enrollment to a paid member.
 * Idempotent across this person's OTHER enrollment rows too: if a sibling
 * enrollment already holds an active comp subscription, reuses it instead of
 * stacking a second comp row for the same real person under a different id.
 */
export async function grantFreeAccess(enrollmentId: string, nowMs: number = Date.now()): Promise<Subscription> {
  const enrollment = await Enrollment.findByPk(enrollmentId);
  if (!enrollment) {
    throw Object.assign(new Error('Enrollment not found'), { error_class: 'NotFoundError' });
  }
  const now = new Date(nowMs);

  const siblingIds = await resolveSiblingEnrollmentIds(enrollmentId, enrollment.email);
  let sub = await Subscription.findOne({ where: { enrollment_id: siblingIds, plan: 'comp', status: 'active' } });
  if (!sub) {
    sub = await Subscription.create({
      enrollment_id: enrollmentId,
      plan: 'comp',
      status: 'active',
      amount_cents: 0,
      applied_credit_cents: 0,
      payment_ref: `${COMP_PREFIX}${enrollmentId}-${nowMs}`,
      started_at: now,
      current_period_end: new Date(nowMs + COMP_PERIOD_DAYS * DAY_MS),
    });
  }

  await grantMembership(enrollment, { cohortId: enrollment.cohort_id, amountPaid: 0, now });
  return sub;
}

/**
 * Admin revoke — remove the Free-Access label by canceling whichever of this
 * person's enrollment rows actually holds the active comp subscription — not
 * necessarily the exact id the admin has open (confirmed live: Brianna
 * Woodard's comp subscription lived on a sibling row, so revoking against her
 * Explorer row alone silently did nothing). Cancels every active comp row
 * found across her siblings, not just the first, so a stray second comp row
 * can never survive a revoke. Deliberately does NOT downgrade the
 * enrollment's current access; forcibly locking someone out is a separate,
 * explicit admin action, so revoking a comp can never fight a real payment or
 * strand a student mid-course.
 */
export async function revokeFreeAccess(enrollmentId: string, nowMs: number = Date.now()): Promise<boolean> {
  const enrollment = await Enrollment.findByPk(enrollmentId);
  const siblingIds = await resolveSiblingEnrollmentIds(enrollmentId, enrollment?.email);
  const subs = await Subscription.findAll({ where: { enrollment_id: siblingIds, plan: 'comp', status: 'active' } });
  if (!subs.length) return false;
  const now = new Date(nowMs);
  await Promise.all(subs.map((sub) => sub.update({ status: 'canceled', canceled_at: now, cancel_reason: 'comp_revoked', updated_at: now })));
  return true;
}

/** Which of these enrollments currently hold an active comped seat — for admin
 *  rosters that flag "Free Access". One query; returns a Set for O(1) lookup. */
export async function activeCompEnrollmentIds(enrollmentIds: string[]): Promise<Set<string>> {
  if (!enrollmentIds.length) return new Set();
  const rows = await Subscription.findAll({
    where: { enrollment_id: enrollmentIds, plan: 'comp', status: 'active' },
    attributes: ['enrollment_id'],
  });
  return new Set(rows.map((r) => r.enrollment_id));
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
