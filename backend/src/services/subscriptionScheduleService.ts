/**
 * Turning a paid subscription into a standing schedule, and taking it back down.
 *
 * The two halves are in one module on purpose. Creating schedules without
 * propagating cancellation is the single worst failure mode in this build: a
 * member cancels, our row flips to 'canceled', and PaySimple keeps drawing their
 * card every month. That takes money rather than merely failing to, so the teardown
 * ships in the same change as the setup, never after.
 *
 * What is deliberately NOT here: any notion of collecting a period that already
 * lapsed. A schedule's first charge lands on the member's NEXT boundary. Days
 * already given away are written off.
 */

import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { getPayment } from './paysimpleService';
import {
  createRecurringSchedule, suspendRecurringSchedule, assertStartDateNotPast,
} from './paysimpleRecurring';

/** Members who must never be auto-enrolled, and why. Each entry here is a real
 *  live case found while preparing this migration, not a hypothetical. */
export interface ExclusionReason {
  code: 'comp' | 'ach_no_consent' | 'card_expired' | 'third_party_card' | 'already_scheduled' | 'not_active' | 'no_payment_id';
  detail: string;
}

/**
 * Bank-draft members need affirmative authorization for a recurring series; a
 * one-time web checkout does not cover it, and silence is not consent. These stay
 * excluded until they reply yes, at which point they are removed from this set.
 */
export const ACH_AWAITING_CONSENT = new Set<string>([
  'bitania3@yahoo.co.uk',    // Britiana Akhile
  'kephamo2004@gmail.com',   // Kepha Ohanga
  'kafando5@gmail.com',      // franck kafando
]);

/**
 * Members whose vaulted card cannot lawfully or practically be scheduled.
 *  - Chukwuemeka Eneh paid with a friend's card because our checkout rejects UK
 *    postcodes and phone numbers. The cardholder never agreed to a recurring
 *    series, so scheduling it would be unauthorized.
 *  - Shabana Zeeshan's card expired 07/2026 and would decline on day one.
 */
export const CARD_BLOCKED = new Map<string, ExclusionReason>([
  ['chukseneh@outlook.com', { code: 'third_party_card', detail: "card on file belongs to a third party who never authorized a recurring series" }],
  ['shabana.zeeshan001@gmail.com', { code: 'card_expired', detail: 'card on file expired 07/2026; needs a current card before scheduling' }],
]);

export interface ScheduleCandidate {
  subscriptionId: string;
  enrollmentId: string;
  email: string;
  fullName: string;
  plan: 'monthly' | 'annual';
  amount: number;
  firstChargeOn: Date;
  paysimplePaymentId: string;
}

/** Why a given subscription may not be scheduled, or null when it may. */
export function exclusionFor(row: {
  email: string; plan: string; status: string;
  paysimple_schedule_id?: string | null; paysimple_payment_id?: string | null;
}): ExclusionReason | null {
  if (row.plan === 'comp') return { code: 'comp', detail: 'comped seat, $0, never billed' };
  if (row.status !== 'active') return { code: 'not_active', detail: `status is ${row.status}` };
  if (row.paysimple_schedule_id) return { code: 'already_scheduled', detail: `schedule ${row.paysimple_schedule_id} exists` };
  if (!row.paysimple_payment_id) return { code: 'no_payment_id', detail: 'no payment to resolve an AccountId from' };

  const email = (row.email || '').trim().toLowerCase();
  if (ACH_AWAITING_CONSENT.has(email)) {
    return { code: 'ach_no_consent', detail: 'bank draft, awaiting affirmative consent' };
  }
  const blocked = CARD_BLOCKED.get(email);
  if (blocked) return blocked;
  return null;
}

/**
 * Resolve the payment method a schedule must draw against.
 *
 * NOT from `subscriptions.paysimple_customer_id`. The hosted checkout page mints
 * its own customer when the payer pays, so the id we stored at checkout points at a
 * customer with no payment methods on it. Querying it returns zero accounts, which
 * is the exact false negative that makes a migration look impossible. The first
 * payment carries both real ids.
 */
export async function resolveAccountForSubscription(paysimplePaymentId: string): Promise<{ accountId: number; customerId: number }> {
  const payment = await getPayment(paysimplePaymentId);
  const accountId = Number((payment as any)?.AccountId);
  const customerId = Number((payment as any)?.CustomerId);
  if (!Number.isFinite(accountId) || !Number.isFinite(customerId)) {
    throw new Error(`payment ${paysimplePaymentId} did not yield an AccountId/CustomerId`);
  }
  return { accountId, customerId };
}

/**
 * Create the schedule for one subscription and record it.
 *
 * The first charge is the member's existing `current_period_end`, never sooner.
 * That is what makes this migration invisible to them: same date, same amount, no
 * catch-up. `assertStartDateNotPast` enforces it rather than trusting the caller.
 */
export async function scheduleSubscription(
  c: ScheduleCandidate,
  opts: { dryRun?: boolean; nowMs?: number } = {},
): Promise<{ scheduled: boolean; scheduleId?: string; reason?: string }> {
  const nowMs = opts.nowMs ?? Date.now();
  assertStartDateNotPast(c.firstChargeOn, nowMs);

  if (opts.dryRun) return { scheduled: false, reason: 'dry run' };

  const { accountId, customerId } = await resolveAccountForSubscription(c.paysimplePaymentId);
  const schedule = await createRecurringSchedule({
    accountId,
    customerId,
    amount: c.amount,
    startDate: c.firstChargeOn,
    plan: c.plan,
    anchorDayOfMonth: c.firstChargeOn.getUTCDate(),
    description: 'Colaberry Enterprise AI membership',
    invoiceNumber: c.subscriptionId.slice(0, 30),
    nowMs,
  });

  const scheduleId = String(schedule.Id);
  await sequelize.query(
    `UPDATE subscriptions
        SET paysimple_schedule_id = :sid,
            paysimple_customer_id = :cid,
            updated_at = now()
      WHERE id = :id AND status = 'active' AND paysimple_schedule_id IS NULL`,
    { replacements: { sid: scheduleId, cid: String(customerId), id: c.subscriptionId } },
  );
  return { scheduled: true, scheduleId };
}

/**
 * Take the schedule down when a member cancels.
 *
 * Called from cancelSubscription. It is deliberately tolerant: if suspending at
 * PaySimple fails we still record the local cancellation, but we surface the
 * failure loudly rather than swallowing it, because the consequence of a schedule
 * outliving a cancellation is that we keep taking a cancelled member's money.
 */
export async function suspendScheduleForSubscription(
  subscriptionId: string,
  scheduleId: string | null | undefined,
): Promise<{ suspended: boolean; error?: string }> {
  if (!scheduleId) return { suspended: false };
  try {
    await suspendRecurringSchedule(scheduleId);
    await sequelize.query(
      `UPDATE subscriptions SET paysimple_schedule_id = NULL, updated_at = now() WHERE id = :id`,
      { replacements: { id: subscriptionId } },
    );
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'info', service: 'subscription-schedule',
      event: 'schedule_suspended', outcome: 'success', context: { subscriptionId, scheduleId },
    }));
    return { suspended: true };
  } catch (err: any) {
    // Loud, not silent. A live schedule behind a cancelled subscription is money
    // leaving a member's account after they told us to stop.
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'subscription-schedule',
      event: 'schedule_suspend_failed', outcome: 'failure',
      error_class: err?.errorClass || 'UpstreamError',
      context: { subscriptionId, scheduleId, message: err?.message },
    }));
    return { suspended: false, error: err?.message };
  }
}

/**
 * A charge produced by a schedule has arrived. Advance the member's period.
 *
 * This is a separate path from activateByRef on purpose. That function's first act
 * is `if (sub.status === 'active') return sub` - the idempotency guard that makes a
 * duplicate first-activation webhook harmless. Applied to a renewal it is exactly
 * wrong: every recurrence would no-op and the period would never move.
 *
 * Idempotency moves to the payment id instead of subscription state, so the same
 * recurrence delivered twice (PaySimple retries for days) advances the period once.
 */
export async function advancePeriodForScheduledPayment(params: {
  scheduleId: string;
  paymentId: string;
  nowMs?: number;
}): Promise<{ advanced: boolean; reason?: string; subscriptionId?: string }> {
  const rows = (await sequelize.query(
    `SELECT id, plan, current_period_end, paysimple_payment_id
       FROM subscriptions
      WHERE paysimple_schedule_id = :sid AND status IN ('active','past_due')
      LIMIT 1`,
    { replacements: { sid: params.scheduleId }, type: QueryTypes.SELECT },
  )) as Array<{ id: string; plan: string; current_period_end: string; paysimple_payment_id: string | null }>;

  if (!rows.length) return { advanced: false, reason: 'no_subscription_for_schedule' };
  const sub = rows[0];

  // Already applied this exact payment: a retry, not a new period.
  if (sub.paysimple_payment_id === String(params.paymentId)) {
    return { advanced: false, reason: 'already_applied', subscriptionId: sub.id };
  }

  const from = new Date(sub.current_period_end);
  const next = new Date(from.getTime());
  if (sub.plan === 'annual') next.setUTCFullYear(next.getUTCFullYear() + 1);
  else {
    const day = from.getUTCDate();
    next.setUTCMonth(next.getUTCMonth() + 1, 1);
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(day, lastDay));
  }

  await sequelize.query(
    `UPDATE subscriptions
        SET current_period_end = :next, status = 'active',
            paysimple_payment_id = :pid, updated_at = now()
      WHERE id = :id`,
    { replacements: { next: next.toISOString(), pid: String(params.paymentId), id: sub.id } },
  );

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'info', service: 'subscription-schedule',
    event: 'period_advanced', outcome: 'success',
    context: { subscriptionId: sub.id, scheduleId: params.scheduleId, paymentId: params.paymentId, periodEnd: next.toISOString() },
  }));
  return { advanced: true, subscriptionId: sub.id };
}

/** Mark a subscription past_due when its scheduled charge fails. Storable state is
 *  the point: today 'lapsed' and 'failed' are computed at read time and nothing in
 *  the codebase can act on them. */
export async function markPastDueForSchedule(scheduleId: string, reason: string): Promise<boolean> {
  const [, affected] = await sequelize.query(
    `UPDATE subscriptions SET status = 'past_due', cancel_reason = :r, updated_at = now()
      WHERE paysimple_schedule_id = :sid AND status = 'active'`,
    { replacements: { sid: scheduleId, r: (reason || 'scheduled payment failed').slice(0, 2000) } },
  );
  return Boolean(affected);
}

