import { Op } from 'sequelize';
import { Enrollment, Cohort } from '../models';
import {
  listRecentPayments, getCustomerById,
  PaySimplePayment, PaySimpleCustomer,
} from './paysimpleService';

/**
 * Cross-references PaySimple payments against Accelerator enrollment records.
 *
 * Root problem (found manually, repeatedly, on 2026-07-30): the app's own
 * checkout flow tags every payment with `paysimple_external_id` so the
 * webhook (`markEnrollmentPaid`) can match it automatically. Payments made
 * through a side channel -- a hosted PaySimple product page, a manually
 * texted payment link, an Open House seat-hold deposit later topped up to
 * the full price -- never carry that id, so the webhook silently no-ops and
 * the enrollment sits at `payment_status='pending'` forever even though the
 * money cleared. Five real students were found this way in one night by
 * hand, one at a time, each only because they happened to complain. This is
 * the systemic backstop: it runs on a schedule instead of waiting for the
 * next complaint.
 *
 * Deliberately conservative. Only two situations are ever auto-applied:
 *   1. The enrollment already has this exact `paysimple_customer_id` linked
 *      (someone -- a prior reconciliation, the checkout flow -- already
 *      tied this specific PaySimple identity to this specific enrollment).
 *   2. An exact, case-insensitive email match between the PaySimple
 *      customer and a single unpaid active enrollment, on a payment that
 *      has fully Settled or Posted (not merely Authorized).
 * Everything else -- an Authorized-but-not-yet-settled payment with no
 * prior link, an email matching more than one open enrollment, a customer
 * lookup failure -- is reported, never written. A human decides those, the
 * same way Marione's and the ambiguous cases were resolved by hand tonight.
 */

const SETTLED_STATUSES = new Set(['Settled', 'Posted']);
const RECONCILABLE_STATUSES = new Set(['Settled', 'Posted', 'Authorized']);

/**
 * The floor that separates a real, full-tuition-shaped charge from the $50
 * Open House seat-hold deposit. A $50 charge is always the deposit, not a
 * completed payment -- found live in the first dry run against production
 * (2026-07-30): 19 of 28 would-be auto-reconciliations were $50 deposits,
 * which would have incorrectly marked pending-balance students as fully paid.
 * Anything below this line is silently skipped, not flagged -- a $50 deposit
 * alone is the normal, expected state for most Open House attendees, not an
 * anomaly, and flagging every one of them would be exactly the notification
 * noise this job exists to avoid.
 *
 * This was 199, pinned to the then-current $199/mo Monthly plan. Pricing moved
 * to $149/mo (billed annually) with $199 as the month-to-month rate, and this
 * constant did not move with it -- so every student paying the $149 rate had
 * their payment filtered out BEFORE the customer lookup and silently never
 * reconciled. They stayed payment_status='pending' and were locked out of the
 * portal despite having paid. Found 2026-08-06 via Hellen Muhonja (paid $149
 * on 08-04) and Firas Baidhani (paid $149 on 08-06), both of whom emailed that
 * the portal did not reflect their enrollment.
 *
 * Deliberately set to a value BETWEEN the deposit and the cheapest real plan
 * rather than to any specific price, so the next pricing change cannot
 * silently reintroduce this. Only the $50 deposit needs to fall below it.
 */
const MINIMUM_FULL_PAYMENT_AMOUNT = 100;

export interface AutoReconciledEntry {
  enrollmentId: string;
  name: string;
  email: string;
  amount: number;
  paymentId: number;
  paymentDate: string | undefined;
  matchType: 'customer_id' | 'email';
}

export interface FlaggedEntry {
  paymentId: number;
  customerId: number;
  name: string;
  email: string | null;
  amount: number;
  status: string;
  paymentDate: string | undefined;
  reason: string;
}

export interface ReconciliationErrorEntry {
  paymentId: number;
  message: string;
}

export interface ReconciliationResult {
  scanned: number;
  autoReconciled: AutoReconciledEntry[];
  flagged: FlaggedEntry[];
  errors: ReconciliationErrorEntry[];
}

type EnrollmentMatch =
  | { kind: 'match'; enrollment: Enrollment; matchType: 'customer_id' | 'email' }
  | { kind: 'ambiguous'; candidates: Enrollment[] }
  | { kind: 'prospect_only'; candidates: Enrollment[] }
  | { kind: 'none' };

/**
 * Resolve the one enrollment a PaySimple customer should reconcile against,
 * or explain why it can't be resolved automatically. Pure DB reads, no writes.
 *
 * `paymentId` guards against a real bug caught in the second dry run against
 * production: matching by email alone can find a genuinely open, unpaid
 * enrollment that just happens to share an email with an ALREADY-reconciled
 * one -- e.g. a student's real seat gets paid under their main email, but
 * their still-unpaid free-preview duplicate under the exact same email is
 * "found" by a later run as if it were a fresh, legitimate match. Checking
 * whether this specific payment id is already recorded anywhere closes that
 * gap regardless of which row it landed on.
 */
export async function findMatchingEnrollment(
  customer: PaySimpleCustomer,
  customerId: number,
  paymentId: number,
): Promise<EnrollmentMatch> {
  const alreadyUsed = await Enrollment.findOne({
    where: { paysimple_payment_id: String(paymentId) },
  });
  if (alreadyUsed) return { kind: 'none' };

  const byCustomerId = await Enrollment.findOne({
    where: { paysimple_customer_id: String(customerId), status: 'active', payment_status: { [Op.ne]: 'paid' } },
  });
  if (byCustomerId) return { kind: 'match', enrollment: byCustomerId, matchType: 'customer_id' };

  if (!customer.Email) return { kind: 'none' };

  const candidates = await Enrollment.findAll({
    where: {
      email: customer.Email.toLowerCase().trim(),
      status: 'active',
      payment_status: { [Op.ne]: 'paid' },
    },
    include: [{ model: Cohort, as: 'cohort', attributes: ['id', 'cohort_type'], required: false }],
  });
  if (candidates.length === 0) return { kind: 'none' };

  /*
   * An enrollment sitting in a PROSPECTS cohort (cohort_type='explorer') is a
   * free Open House signup, not a purchase of anything. Matching a payment onto
   * one by email alone is unsafe: this PaySimple account is shared with the
   * legacy bootcamp, so a bootcamp student who once attended an Open House has
   * BOTH a recurring bootcamp payment plan AND a prospects-bucket enrollment
   * under the same email. Auto-applying would book bootcamp tuition as
   * Accelerator revenue and hand out Accelerator access nobody bought.
   *
   * Found before it shipped: lowering MINIMUM_FULL_PAYMENT_AMOUNT to catch the
   * $149 plan made the sweep newly "find" 13 such payments across 9 people --
   * every one of them in Explorer/Prospects, almost all recurring ACH drafts
   * (RecurringScheduleId != 0, PaymentType ACH/Web), versus the real Accelerator
   * checkouts which are one-off card payments (RecurringScheduleId 0, CC/Moto).
   * Flag them for a human instead of writing. A genuine buyer stranded in the
   * prospects bucket (this happens -- see the cohort-mismatch fixes) still gets
   * surfaced, just not auto-applied.
   *
   * A prior explicit customer_id link is unaffected: that check returns above,
   * because someone already tied that PaySimple identity to that enrollment.
   */
  const isProspect = (c: any) => String(c?.cohort?.cohort_type ?? '').toLowerCase() === 'explorer';
  const realCohort = candidates.filter((c) => !isProspect(c));
  if (realCohort.length === 0) return { kind: 'prospect_only', candidates };

  // Prefer the real (non-explorer) seat over a free-preview duplicate that
  // happens to share the email -- same reasoning as pickBestEnrollment.
  const standard = realCohort.filter((c) => c.enrollment_type !== 'explorer');
  const pool = standard.length > 0 ? standard : realCohort;
  if (pool.length === 1) return { kind: 'match', enrollment: pool[0], matchType: 'email' };
  return { kind: 'ambiguous', candidates: pool };
}

/**
 * Apply a confirmed payment to an enrollment. Idempotent: re-fetches and
 * re-checks `payment_status` immediately before writing, so two overlapping
 * runs (or a re-run after a partial failure) can never double-increment
 * `seats_taken` or overwrite an already-reconciled row. Returns false (no-op)
 * if the enrollment was already paid by the time this ran.
 */
export async function reconcilePayment(
  enrollmentId: string,
  payment: Pick<PaySimplePayment, 'Id' | 'Amount' | 'PaymentDate'>,
  customerId: number,
): Promise<boolean> {
  const fresh = await Enrollment.findByPk(enrollmentId);
  if (!fresh || fresh.payment_status === 'paid') return false;

  await fresh.update({
    payment_status: 'paid',
    portal_enabled: true,
    amount_paid: payment.Amount,
    enrolled_at: fresh.enrolled_at || new Date(payment.PaymentDate || Date.now()),
    paysimple_payment_id: String(payment.Id),
    paysimple_customer_id: String(customerId),
  });
  await Cohort.increment('seats_taken', { by: 1, where: { id: fresh.cohort_id } });
  return true;
}

export async function runPaymentReconciliationSweep(
  options: { sinceDays?: number; dryRun?: boolean } = {},
): Promise<ReconciliationResult> {
  const sinceDays = options.sinceDays ?? 14;
  const dryRun = options.dryRun ?? false;
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const result: ReconciliationResult = { scanned: 0, autoReconciled: [], flagged: [], errors: [] };

  let payments: PaySimplePayment[];
  try {
    payments = await listRecentPayments({ since });
  } catch (err: any) {
    result.errors.push({ paymentId: 0, message: `Failed to list PaySimple payments: ${err.message}` });
    return result;
  }

  const relevant = payments.filter((p) =>
    p.CustomerId && RECONCILABLE_STATUSES.has(p.Status) && p.Amount >= MINIMUM_FULL_PAYMENT_AMOUNT
  );
  result.scanned = relevant.length;

  const customerCache = new Map<number, PaySimpleCustomer | null>();

  for (const payment of relevant) {
    const customerId = payment.CustomerId!;
    try {
      let customer = customerCache.get(customerId);
      if (customer === undefined) {
        customer = await getCustomerById(customerId);
        customerCache.set(customerId, customer);
      }
      if (!customer) {
        result.errors.push({ paymentId: payment.Id, message: `PaySimple customer ${customerId} could not be resolved` });
        continue;
      }

      const match = await findMatchingEnrollment(customer, customerId, payment.Id);
      const name = `${customer.FirstName || ''} ${customer.LastName || ''}`.trim();

      if (match.kind === 'none') continue; // no open enrollment at all for this identity -- not this system's concern

      if (match.kind === 'ambiguous') {
        result.flagged.push({
          paymentId: payment.Id, customerId, name, email: customer.Email,
          amount: payment.Amount, status: payment.Status, paymentDate: payment.PaymentDate,
          reason: `${match.candidates.length} open, unpaid enrollments share this email -- pick the right one manually`,
        });
        continue;
      }

      if (match.kind === 'prospect_only') {
        result.flagged.push({
          paymentId: payment.Id, customerId, name, email: customer.Email,
          amount: payment.Amount, status: payment.Status, paymentDate: payment.PaymentDate,
          reason: `Only match is a free Open House / prospects enrollment (${match.candidates[0]?.id}), which is not a purchase. Most likely a legacy bootcamp payment on a shared PaySimple account. Confirm what this payment is FOR before applying it.`,
        });
        continue;
      }

      // Not-yet-settled AND not previously linked by customer_id: real money,
      // but low enough confidence that a human should confirm before it's
      // written as the record of truth.
      if (match.matchType === 'email' && !SETTLED_STATUSES.has(payment.Status)) {
        result.flagged.push({
          paymentId: payment.Id, customerId, name, email: customer.Email,
          amount: payment.Amount, status: payment.Status, paymentDate: payment.PaymentDate,
          reason: `New email match (enrollment ${match.enrollment.id}) on a payment that has not fully settled yet (status: ${payment.Status})`,
        });
        continue;
      }

      if (dryRun) {
        result.autoReconciled.push({
          enrollmentId: match.enrollment.id, name: match.enrollment.full_name, email: match.enrollment.email,
          amount: payment.Amount, paymentId: payment.Id, paymentDate: payment.PaymentDate, matchType: match.matchType,
        });
        continue;
      }

      const applied = await reconcilePayment(match.enrollment.id, payment, customerId);
      if (applied) {
        result.autoReconciled.push({
          enrollmentId: match.enrollment.id, name: match.enrollment.full_name, email: match.enrollment.email,
          amount: payment.Amount, paymentId: payment.Id, paymentDate: payment.PaymentDate, matchType: match.matchType,
        });
      }
    } catch (err: any) {
      result.errors.push({ paymentId: payment.Id, message: err.message });
    }
  }

  return result;
}
