/**
 * Live PaySimple state for the billing watch. GET only, always.
 *
 * Kept apart from the checks themselves so those stay unit-testable without a
 * network, and so it is obvious at a glance that the watchdog never mutates
 * anything at the gateway.
 *
 * Failure here is non-fatal by design: if PaySimple is unreachable the watch still
 * runs its database checks rather than reporting nothing at all. A watchdog that
 * goes silent when one dependency is down is worse than one that says less.
 */

import { apiRequest } from '../paysimpleService';

export interface GatewayState {
  scheduleIds?: string[];
  cardExpiryByEmail?: Map<string, string>;
}

interface RecurringRow { Id: number | string; PaymentAmount?: number; ScheduleStatus?: string }

/** Our plan prices. Filtering to these keeps the legacy bootcamp product's ~1,200
 *  schedules out of a comparison that is only about the Accelerator book. */
const OUR_PRICES = new Set([199, 1788]);

export async function getPaySimpleGatewayState(): Promise<GatewayState> {
  const state: GatewayState = {};

  try {
    // Page rather than trusting a single call: this account holds well over a
    // thousand schedules, and a truncated read would look like missing schedules
    // and raise a false alarm about the book disagreeing.
    const all: RecurringRow[] = [];
    for (let page = 1; page <= 20; page++) {
      const res = await apiRequest<any>('GET', `/v4/recurringpayment?page=${page}&pagesize=200`);
      const rows: RecurringRow[] = Array.isArray(res) ? res : (res?.Response ?? []);
      if (!rows.length) break;
      all.push(...rows);
      if (rows.length < 200) break;
    }
    // Only schedules that can still charge belong in the comparison. A member who
    // cancels gets their schedule Suspended at the gateway and the id cleared from
    // the book (cancelSubscription); counting a suspended schedule as "at gateway
    // but not in our book" raised the ACT NOW alarm on every run from 2026-09-02
    // for three correctly-cancelled members (Nzau, Chukwukere, Albazzaz).
    state.scheduleIds = all
      .filter((r) => OUR_PRICES.has(Number(r.PaymentAmount)))
      .filter((r) => String(r.ScheduleStatus ?? 'Active').toLowerCase() === 'active')
      .map((r) => String(r.Id));
  } catch (err: any) {
    // Deliberately swallowed into a log, not a throw: see the header note.
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'billing-watch',
      event: 'gateway_schedules_unavailable', error_class: err?.errorClass ?? 'UpstreamError',
      context: { message: err?.message },
    }));
  }

  return state;
}
