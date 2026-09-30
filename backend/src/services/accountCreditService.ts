import { AccountCredit } from '../models';
import type { AccountCreditAttributes } from '../models/AccountCredit';

/**
 * accountCreditService — account credits applied to a student's next payment.
 *
 * The first source is the $50 Open House "hold your spot" deposit. A credit is
 * granted (append-only ledger row, `available`), reduces the charged amount at
 * the next subscription checkout, and is marked `applied` + linked to that
 * subscription when the payment settles. Nothing here charges or refunds money;
 * it only lowers what PaySimple is asked to charge.
 *
 * Determinism + idempotency (per the repo's non-negotiables):
 *  - Granting is keyed on `source_event_id` (UNIQUE) → a re-run never double-credits.
 *  - Consumption is keyed on the subscription id → a duplicate payment webhook
 *    never double-consumes a credit.
 *  - Selection is a pure, unit-tested function (no I/O).
 */

// PaySimple cannot process a $0 charge, so a credit never reduces a charge below
// this floor; any credit that would overshoot is simply left available.
export const MIN_CHARGE_CENTS = 100;

export interface CreditRow { id: string; amount_cents: number }

/**
 * Greedily pick whole credit rows (oldest first) whose sum stays within
 * `targetCents`. Whole-credit selection (never splits a ledger row) keeps the
 * amount charged and the rows later consumed perfectly consistent. Pure.
 */
export function selectCreditsUpTo<T extends CreditRow>(credits: T[], targetCents: number): { creditIds: string[]; appliedCents: number } {
  let applied = 0;
  const creditIds: string[] = [];
  for (const c of credits) {
    if (c.amount_cents <= 0) continue;
    if (applied + c.amount_cents > targetCents) continue; // skip one that overflows; a smaller later row may still fit
    applied += c.amount_cents;
    creditIds.push(c.id);
  }
  return { creditIds, appliedCents: applied };
}

/** The most credit that may be applied to a charge while keeping it payable
 *  (>= MIN_CHARGE_CENTS). A $50 credit vs a $199/$1,788 plan → full $50. */
export function creditApplyTarget(chargeCents: number): number {
  return Math.max(0, chargeCents - MIN_CHARGE_CENTS);
}

/** Available (unspent) credit rows for an enrollment, oldest first. */
export async function availableCreditRows(enrollmentId: string): Promise<AccountCredit[]> {
  return AccountCredit.findAll({
    where: { enrollment_id: enrollmentId, status: 'available' },
    order: [['created_at', 'ASC']],
  });
}

/** Total available (unspent) credit for an enrollment, in cents. */
export async function getAvailableCreditCents(enrollmentId: string): Promise<number> {
  const rows = await availableCreditRows(enrollmentId);
  return rows.reduce((sum, r) => sum + (r.amount_cents || 0), 0);
}

/** How much credit a plan charge would apply + the resulting charge, for an
 *  enrollment. Used by checkout and the Subscription view's "you pay today". */
export async function planCreditPreview(enrollmentId: string, chargeCents: number): Promise<{ available_cents: number; applied_cents: number; charge_after_cents: number }> {
  const rows = await availableCreditRows(enrollmentId);
  const available = rows.reduce((s, r) => s + (r.amount_cents || 0), 0);
  const { appliedCents } = selectCreditsUpTo(rows, creditApplyTarget(chargeCents));
  return { available_cents: available, applied_cents: appliedCents, charge_after_cents: chargeCents - appliedCents };
}

export interface GrantCreditInput {
  enrollmentId: string;
  amountCents: number;
  reason: string;
  sourceEventId: string;
  grantedBy?: string;
  note?: string | null;
}

/**
 * Grant a credit. Idempotent on `source_event_id`: a second grant for the same
 * business event returns the existing row without adding a duplicate.
 */
export async function grantCredit(input: GrantCreditInput): Promise<{ granted: boolean; credit: AccountCredit }> {
  if (!input.enrollmentId) throw new Error('grantCredit: enrollmentId required');
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new Error('grantCredit: amountCents must be a positive integer');
  if (!input.sourceEventId) throw new Error('grantCredit: sourceEventId required (idempotency key)');

  const now = new Date();
  const [credit, created] = await AccountCredit.findOrCreate({
    where: { source_event_id: input.sourceEventId },
    defaults: {
      enrollment_id: input.enrollmentId,
      amount_cents: input.amountCents,
      reason: input.reason,
      source_event_id: input.sourceEventId,
      status: 'available',
      granted_by: input.grantedBy ?? null,
      note: input.note ?? null,
      created_at: now,
      updated_at: now,
    } as AccountCreditAttributes,
  });
  return { granted: created, credit };
}

/**
 * Consume up to `targetCents` of available credit for a settled subscription:
 * marks whole credit rows `applied` and links them to the subscription.
 * Idempotent on the subscription id — if credit is already applied to this
 * subscription, it is a no-op. Returns the cents actually consumed.
 */
export async function consumeCreditsForSubscription(
  enrollmentId: string,
  subscriptionId: string,
  targetCents: number,
  nowMs: number = Date.now(),
): Promise<number> {
  if (!targetCents || targetCents <= 0) return 0;

  // Idempotency guard: this subscription already had credit applied.
  const alreadyApplied = await AccountCredit.findAll({ where: { applied_subscription_id: subscriptionId } });
  if (alreadyApplied.length) {
    return alreadyApplied.reduce((s, r) => s + (r.amount_cents || 0), 0);
  }

  const rows = await availableCreditRows(enrollmentId);
  const { creditIds, appliedCents } = selectCreditsUpTo(rows, targetCents);
  if (!creditIds.length) return 0;

  const now = new Date(nowMs);
  await AccountCredit.update(
    { status: 'applied', applied_subscription_id: subscriptionId, applied_at: now, updated_at: now },
    { where: { id: creditIds } },
  );
  return appliedCents;
}

/**
 * Void the credit(s) granted by a specific source event (e.g. a refunded
 * PaySimple payment `ps-payment-<id>`). Only `available` credits are voided —
 * a credit already `applied` to a paid subscription can't be clawed back here
 * and is left as-is (reported separately). Returns { voidedCents, appliedCents }
 * where appliedCents is any already-spent credit for that source. Idempotent.
 */
export async function voidCreditBySourceEvent(sourceEventId: string, nowMs: number = Date.now()): Promise<{ voidedCents: number; alreadyAppliedCents: number }> {
  const rows = await AccountCredit.findAll({ where: { source_event_id: sourceEventId } });
  const available = rows.filter((r) => r.status === 'available');
  const applied = rows.filter((r) => r.status === 'applied');
  const voidedCents = available.reduce((s, r) => s + (r.amount_cents || 0), 0);
  if (available.length) {
    const now = new Date(nowMs);
    await AccountCredit.update(
      { status: 'void', updated_at: now },
      { where: { id: available.map((r) => r.id) } },
    );
  }
  return { voidedCents, alreadyAppliedCents: applied.reduce((s, r) => s + (r.amount_cents || 0), 0) };
}
