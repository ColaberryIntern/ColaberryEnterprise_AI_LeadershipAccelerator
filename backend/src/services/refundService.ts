import { Op } from 'sequelize';
import { Refund, Enrollment } from '../models';
import { env } from '../config/env';
import {
  getPayment, getCustomerById, isVoidable, isSettled, voidPayment, refundPayment,
} from './paysimpleService';
import { voidCreditBySourceEvent } from './accountCreditService';
import type { RefundMethod } from '../models/Refund';

/**
 * refundService — issue an admin-triggered PaySimple refund (or void) of a
 * payment, record it in the `refunds` ledger, and void any account credit the
 * payment had granted.
 *
 * Failure-first design:
 *  - the payment is read from PaySimple first (real amount + void window + not
 *    already reversed), so we never refund a wrong/stale amount;
 *  - an over-refund guard sums prior succeeded refunds and rejects anything that
 *    would exceed the original;
 *  - the ledger row is written `pending` BEFORE the PaySimple call, then flipped
 *    to succeeded/failed — a crash mid-flight leaves a visible record instead of
 *    a silent double-refund on retry;
 *  - a PaySimple error is caught, recorded on the row, and returned; no money
 *    moves and nothing else is mutated.
 */

// PaySimple statuses that mean the payment is already reversed / unrefundable.
const UNREFUNDABLE = new Set(['Voided', 'Refunded', 'Failed', 'Returned', 'ReturnedNSF', 'Declined', 'Reversed']);

const round2 = (n: number): number => Math.round(n * 100) / 100;

export type IssueRefundReason =
  | 'billing_unconfigured' | 'payment_not_found' | 'already_reversed'
  | 'invalid_amount' | 'partial_unsupported' | 'not_settled' | 'paysimple_error';

export interface IssueRefundResult {
  ok: boolean;
  reason?: IssueRefundReason;
  message?: string;
  refund?: any;
}

/** Sum of already-succeeded refunds for a payment (cents). */
async function priorRefundedCents(paymentId: string): Promise<number> {
  const rows = await Refund.findAll({ where: { paysimple_payment_id: paymentId, status: 'succeeded' } });
  return rows.reduce((s, r) => s + (r.amount_cents || 0), 0);
}

async function resolvePayerEmail(customerId?: number): Promise<string | null> {
  if (!customerId) return null;
  const cust = await getCustomerById(customerId);
  return cust?.Email ? cust.Email.toLowerCase() : null;
}

/**
 * A read-only preview for the admin UI: the payment's amount/status, the payer,
 * how much has already been refunded, and whether it would void or refund.
 */
export async function lookupPayment(paymentId: string): Promise<
  | { ok: true; payment: { id: string; status: string; amount_cents: number; refundable_cents: number; method: RefundMethod; refundable_now: boolean; settles_on: string | null; email: string | null; name: string } }
  | { ok: false; reason: 'billing_unconfigured' | 'payment_not_found' }
> {
  if (!env.paysimpleApiUser || !env.paysimpleApiKey) return { ok: false, reason: 'billing_unconfigured' };
  let payment;
  try {
    payment = await getPayment(paymentId);
  } catch {
    return { ok: false, reason: 'payment_not_found' };
  }
  const amountCents = Math.round(Number(payment.Amount) * 100);
  const prior = await priorRefundedCents(paymentId);
  const email = await resolvePayerEmail(payment.CustomerId);
  const voidable = isVoidable(payment);
  const method: RefundMethod = voidable ? 'void' : 'refund';
  // A refund needs the payment settled; a void needs the void window open.
  const refundable_now = amountCents - prior > 0 && !UNREFUNDABLE.has(payment.Status) && (voidable || isSettled(payment));
  return {
    ok: true,
    payment: {
      id: String(payment.Id),
      status: payment.Status,
      amount_cents: amountCents,
      refundable_cents: Math.max(0, amountCents - prior),
      method,
      refundable_now,
      settles_on: payment.EstimatedSettleDate ? String(payment.EstimatedSettleDate).slice(0, 10) : null,
      email,
      name: `${payment.CustomerFirstName || ''} ${payment.CustomerLastName || ''}`.trim(),
    },
  };
}

export async function issueRefund(input: {
  paymentId: string;
  amountCents?: number;      // omit for a full refund of the remaining balance
  reason?: string;
  issuedBy?: string;
}): Promise<IssueRefundResult> {
  if (!env.paysimpleApiUser || !env.paysimpleApiKey) return { ok: false, reason: 'billing_unconfigured' };
  const paymentId = String(input.paymentId).trim();
  if (!paymentId) return { ok: false, reason: 'payment_not_found' };

  // 1. Read the payment from PaySimple (authoritative amount + status + window).
  let payment;
  try {
    payment = await getPayment(paymentId);
  } catch {
    return { ok: false, reason: 'payment_not_found' };
  }
  if (UNREFUNDABLE.has(payment.Status)) {
    return { ok: false, reason: 'already_reversed', message: `Payment status is ${payment.Status}` };
  }

  const paymentCents = Math.round(Number(payment.Amount) * 100);
  const prior = await priorRefundedCents(paymentId);
  const remaining = paymentCents - prior;
  const refundCents = input.amountCents != null ? Math.round(input.amountCents) : remaining;

  // 2. Over-refund guard.
  if (!Number.isFinite(refundCents) || refundCents <= 0 || refundCents > remaining) {
    return { ok: false, reason: 'invalid_amount', message: `Refundable balance is $${round2(remaining / 100)}` };
  }
  // PaySimple void/reverse are whole-payment operations — partials aren't supported.
  if (refundCents !== paymentCents) {
    return { ok: false, reason: 'partial_unsupported', message: 'PaySimple reverses the full payment; partial refunds are not supported.' };
  }

  // 3. State gate: void needs the void window open; a refund needs settlement.
  const voidable = isVoidable(payment);
  const method: RefundMethod = voidable ? 'void' : 'refund';
  if (method === 'refund' && !isSettled(payment)) {
    const est = payment.EstimatedSettleDate ? ` (settles ~${String(payment.EstimatedSettleDate).slice(0, 10)})` : '';
    return { ok: false, reason: 'not_settled', message: `This payment is ${payment.Status} and has not settled yet${est}. PaySimple can only refund a settled payment — try again after it settles.` };
  }

  const email = await resolvePayerEmail(payment.CustomerId);
  const enrollment = email ? await Enrollment.findOne({ where: { email: { [Op.iLike]: email } } }) : null;

  // 3. Write the ledger row PENDING before touching PaySimple.
  const now = new Date();
  const row = await Refund.create({
    enrollment_id: enrollment ? enrollment.id : null,
    paysimple_payment_id: paymentId,
    amount_cents: refundCents,
    method,
    status: 'pending',
    reason: (input.reason || '').slice(0, 2000) || null,
    customer_email: email,
    issued_by: input.issuedBy || null,
    created_at: now,
    updated_at: now,
  } as any);

  // 4. Call PaySimple (void an authorized payment, else reverse a settled one).
  try {
    const res: any = method === 'void'
      ? await voidPayment(paymentId)
      : await refundPayment(paymentId);

    // 5. Void any account credit this payment granted (e.g. an Open House $50).
    const { voidedCents } = await voidCreditBySourceEvent(`ps-payment-${paymentId}`);

    await row.update({
      status: 'succeeded',
      paysimple_refund_id: res && (res.Id != null) ? String(res.Id) : null,
      voided_credit_cents: voidedCents,
      updated_at: new Date(),
    });
    return { ok: true, refund: row };
  } catch (err: any) {
    await row.update({ status: 'failed', error: String(err?.message || err).slice(0, 2000), updated_at: new Date() });
    return { ok: false, reason: 'paysimple_error', message: err?.message };
  }
}

export async function listRefunds(limit = 100): Promise<Refund[]> {
  return Refund.findAll({ order: [['created_at', 'DESC']], limit: Math.min(limit, 500) });
}
