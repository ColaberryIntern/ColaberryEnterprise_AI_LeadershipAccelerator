/**
 * PaySimple recurring schedules (API v4) - the gateway layer only.
 *
 * Deliberately thin: build the request, call, return. Which subscription gets a
 * schedule, when, and what happens on cancellation lives in
 * subscriptionScheduleService. Keeping the gateway call free of business rules is
 * what lets the cadence mapping below be unit-tested without a network.
 *
 * Two facts about this API that shape everything here, both confirmed against the
 * live account on 2026-08-22:
 *
 *  1. `AccountId` is required, NOT `CustomerId`. The account is the stored payment
 *     method. Our `subscriptions.paysimple_customer_id` is the WRONG id for this in
 *     every case, because the hosted checkout page mints its own customer when the
 *     payer pays (see docs/RECURRING_BILLING_EXPOSURE.md). The usable AccountId is
 *     recoverable from the first payment: GET /v4/payment/{id} returns it.
 *
 *  2. A charge produced by a schedule carries `RecurringScheduleId` on the payment
 *     object. That is the anchor the webhook matches on. It matters because a
 *     scheduled charge has NO `SUB-` external id, so the existing matcher would
 *     ignore every recurrence, and matching on customer id is not unique here (119
 *     subscriptions map to only 83 customer ids).
 */

import { apiRequest } from './paysimpleService';

export type ExecutionFrequencyType =
  | 'Daily' | 'Weekly' | 'BiWeekly' | 'FirstofMonth'
  | 'SpecificDayofMonth' | 'LastofMonth' | 'Quarterly' | 'SemiAnnually' | 'Annually';

export interface RecurringSchedule {
  Id: number;
  CustomerId: number;
  AccountId: number;
  PaymentAmount: number;
  ExecutionFrequencyType: ExecutionFrequencyType;
  ExecutionFrequencyParameter?: number | null;
  StartDate: string;
  EndDate?: string | null;
  Description?: string | null;
  InvoiceNumber?: string | null;
}

export interface CadenceSpec {
  ExecutionFrequencyType: ExecutionFrequencyType;
  ExecutionFrequencyParameter?: number;
}

/**
 * Map a plan plus its anchor day onto PaySimple's frequency vocabulary.
 *
 * The 29th/30th/31st are the whole reason this is a function rather than a
 * constant. `SpecificDayofMonth: 31` does not survive a 30-day month, and eight of
 * the live subscribers anchor on the 30th or 31st. `LastofMonth` is the correct
 * shape for them: it keeps "end of month" meaning end of month in February as well
 * as in August. Days 1-28 exist in every month and map directly.
 */
export function cadenceFor(plan: 'monthly' | 'annual', anchorDayOfMonth: number): CadenceSpec {
  if (plan === 'annual') return { ExecutionFrequencyType: 'Annually' };
  if (!Number.isInteger(anchorDayOfMonth) || anchorDayOfMonth < 1 || anchorDayOfMonth > 31) {
    throw new Error(`anchorDayOfMonth out of range: ${anchorDayOfMonth}`);
  }
  if (anchorDayOfMonth >= 29) return { ExecutionFrequencyType: 'LastofMonth' };
  return { ExecutionFrequencyType: 'SpecificDayofMonth', ExecutionFrequencyParameter: anchorDayOfMonth };
}

/** PaySimple rejects a StartDate in the past, so a schedule can never be created
 *  in a way that back-charges a period. That is also our own invariant: a lapsed
 *  period is written off, never collected. */
export function assertStartDateNotPast(startDate: Date, nowMs: number): void {
  const startDay = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate());
  const today = new Date(nowMs);
  const todayDay = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (startDay < todayDay) {
    throw new Error(
      `refusing to create a schedule starting ${startDate.toISOString().slice(0, 10)}, which is in the past - `
      + 'a lapsed period is written off, never back-charged',
    );
  }
}

export async function createRecurringSchedule(params: {
  accountId: number | string;
  customerId: number | string;
  amount: number;
  startDate: Date;
  plan: 'monthly' | 'annual';
  anchorDayOfMonth: number;
  description?: string;
  invoiceNumber?: string;
  nowMs?: number;
}): Promise<RecurringSchedule> {
  const nowMs = params.nowMs ?? Date.now();
  assertStartDateNotPast(params.startDate, nowMs);
  if (!(params.amount > 0)) {
    // A $0 comp seat must never reach this function. PaySimple cannot process a
    // zero charge, and a comped member should not be billed at all.
    throw new Error(`refusing to schedule a non-positive amount: ${params.amount}`);
  }

  const cadence = cadenceFor(params.plan, params.anchorDayOfMonth);
  const body = {
    AccountId: Number(params.accountId),
    CustomerId: Number(params.customerId),
    PaymentAmount: params.amount,
    StartDate: params.startDate.toISOString(),
    ...cadence,
    // No EndDate: an open-ended membership runs until it is suspended.
    Description: params.description ?? 'Colaberry Enterprise AI membership',
    ...(params.invoiceNumber ? { InvoiceNumber: params.invoiceNumber } : {}),
  };

  return apiRequest<RecurringSchedule>('POST', '/v4/recurringpayment', body);
}

export async function getRecurringSchedule(scheduleId: string | number): Promise<RecurringSchedule> {
  return apiRequest<RecurringSchedule>('GET', `/v4/recurringpayment/${scheduleId}`);
}

/**
 * Stop a schedule from drawing again. Cancellation at PaySimple is a state change,
 * not a delete, so the history stays readable.
 */
export async function suspendRecurringSchedule(scheduleId: string | number): Promise<void> {
  await apiRequest('PUT', `/v4/recurringpayment/${scheduleId}/suspend`);
}
