/**
 * Routes a PaySimple payment webhook that came from a standing schedule.
 *
 * A scheduled charge never carries our checkout reference (`order_external_id`),
 * so the controller's enrollment and checkout paths cannot see it. Before this
 * module, `payment_created` advanced the member's period whatever the charge's
 * status, and `payment_failed` / `payment_returned` for a scheduled charge did
 * nothing at all. Six members declined on 28-30 Oct 2026 and the book said nothing.
 *
 * Failure handling:
 *  - PaySimple unreachable while resolving the payment: logged, returns
 *    `{ handled: false }`, and the controller acknowledges as before. PaySimple
 *    retries delivery, and both writes downstream are idempotent.
 *  - Not a scheduled charge: `{ handled: false }`, the controller carries on.
 *  - Unrecognized status: nothing written, logged at error so a human sees it.
 *
 * Deliberately NOT done here: sending the member a payment link. Their schedule
 * is still live and charges again next cycle, so a link would bill the same month
 * twice. The daily billing watch surfaces past_due members to a person instead.
 */

import { getPayment, PaySimplePayment } from '../paysimpleService';
import { applyScheduledCharge, markPastDueForSchedule } from '../subscriptionScheduleService';

export type ScheduledChargeEvent = 'payment_created' | 'payment_failed' | 'payment_returned';

export interface ScheduledChargeResult {
  handled: boolean;
  scheduleId?: string;
  outcome?: string;
  advanced?: boolean;
  markedPastDue?: boolean;
  reason?: string;
  subscriptionId?: string;
}

function log(level: 'info' | 'warn' | 'error', event: string, context: Record<string, unknown>): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(), level, service: 'subscription-schedule',
    event, outcome: level === 'info' ? 'success' : 'failure', context,
  });
  if (level === 'info') console.log(line); else console.error(line);
}

/** The most specific reason PaySimple gives: a card decline, else the bank return text. */
export function failureReasonOf(payment: Partial<PaySimplePayment>, fallback?: string | null): string {
  return payment.FailureData?.Description || payment.ProviderAuthCode || fallback || payment.Status || 'unknown';
}

export async function handleScheduledChargeEvent(
  eventType: ScheduledChargeEvent,
  paymentId: string | number | null | undefined,
  eventFailureReason?: string | null,
): Promise<ScheduledChargeResult> {
  if (!paymentId) return { handled: false };

  let payment: PaySimplePayment;
  try {
    payment = await getPayment(paymentId);
  } catch (err: any) {
    log('error', 'scheduled_charge_lookup_failed', {
      eventType, paymentId: String(paymentId), error_class: err?.errorClass ?? 'UpstreamError', message: err?.message,
    });
    return { handled: false };
  }

  const scheduleId = payment?.RecurringScheduleId;
  if (!scheduleId) return { handled: false };

  const reasonText = failureReasonOf(payment, eventFailureReason);
  const base = { scheduleId: String(scheduleId), paymentId: String(paymentId) };

  // A failure event is a failure whatever the status reads at lookup time; the
  // payment can lag the event that reported it.
  if (eventType !== 'payment_created') {
    const markedPastDue = await markPastDueForSchedule(
      base.scheduleId, `scheduled payment ${base.paymentId} ${eventType}: ${reasonText}`,
    );
    log('warn', 'scheduled_charge_failed', { ...base, eventType, status: payment.Status, reasonText, markedPastDue });
    return { handled: true, scheduleId: base.scheduleId, outcome: 'failed', advanced: false, markedPastDue };
  }

  const result = await applyScheduledCharge({ ...base, status: payment.Status, failureReason: reasonText });
  if (result.outcome === 'failed') {
    log('warn', 'scheduled_charge_failed', { ...base, eventType, status: payment.Status, reasonText, markedPastDue: result.markedPastDue });
  } else if (result.outcome === 'ignore') {
    log('error', 'scheduled_charge_unrecognized_status', { ...base, status: payment.Status ?? null });
  } else if (!result.advanced && result.reason === 'no_subscription_for_schedule') {
    // Real money that matches no subscription must be loud, never a quiet 200.
    log('error', 'scheduled_charge_unmatched', { ...base, amount: payment.Amount });
  }
  return { handled: true, scheduleId: base.scheduleId, ...result };
}
