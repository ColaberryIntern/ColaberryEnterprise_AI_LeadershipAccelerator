/**
 * Catch a declined scheduled charge that never reached our book.
 *
 * The webhook path (`scheduledChargeWebhook.ts`, PR #3532, 2026-10-31) marks a
 * subscription past_due when PaySimple tells us a scheduled charge failed. It only
 * sees declines that arrive as events after it shipped. Five members declined on
 * 28-30 Sep and 28-30 Oct, before it existed, and on 2026-11-17 all five were still
 * `active` with a period end weeks in the past: three cards closed or reported lost,
 * $0 collected, full access. A dropped or missed webhook would hide a decline the
 * same way again.
 *
 * This pass asks PaySimple directly. For every active, scheduled, non-comp row whose
 * period has already ended, it reads the schedule's most recent charge. If that
 * charge failed, the row is marked past_due through the same `markPastDueForSchedule`
 * the webhook uses, with PaySimple's own decline reason. The one-time catch-up and
 * the daily run are the same function with a different `since`.
 *
 * Deliberately NOT done here:
 *  - Advancing a period on a successful charge the webhook missed. That is money
 *    moving the book, and `schedule_stopped_collecting` already asks a person.
 *  - Touching a row that a newer active row covers (the member paid another way).
 *    Its schedule is an orphan; it is reported, and suspended only by hand.
 *  - Contacting the member or stopping access. Both are a person's call.
 *
 * Idempotent: `markPastDueForSchedule` only moves an `active` row, so a second run
 * changes nothing.
 */

import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { getPayment, listRecentPayments, type PaySimplePayment } from '../paysimpleService';
import { markPastDueForSchedule, scheduledChargeOutcome, suspendScheduleForSubscription } from '../subscriptionScheduleService';
import { failureReasonOf } from './scheduledChargeWebhook';

/** Default look-back for the daily run: one monthly cycle plus slack. */
export const DAILY_LOOKBACK_DAYS = 45;

/** Active, scheduled, paid rows whose period has already ended. `covered` is true when
 *  the same enrollment holds a newer active row (the member paid another way). */
export const RECONCILE_CANDIDATES_SQL = `SELECT s.id, s.enrollment_id, s.paysimple_schedule_id AS schedule_id,
            s.current_period_end::date::text AS period_end, e.full_name, e.email,
            EXISTS (
              SELECT 1 FROM subscriptions s2
               WHERE s2.enrollment_id = s.enrollment_id AND s2.id <> s.id
                 AND s2.status = 'active'
                 AND s2.current_period_end > s.current_period_end
            ) AS covered
       FROM subscriptions s JOIN enrollments e ON e.id = s.enrollment_id
      WHERE s.status = 'active' AND s.plan <> 'comp'
        AND s.paysimple_schedule_id IS NOT NULL
        AND s.current_period_end < now()
      ORDER BY s.current_period_end, s.id`;

export interface ReconcileCandidate {
  id: string;
  enrollment_id: string;
  schedule_id: string;
  period_end: string;
  full_name: string | null;
  email: string | null;
  covered: boolean;
}

export type ReconcileAction =
  | 'mark_past_due'
  | 'covered_by_newer_row'
  | 'latest_charge_succeeded'
  | 'latest_charge_unrecognized'
  | 'no_charge_seen';

export interface ReconcileRow {
  subscriptionId: string;
  scheduleId: string;
  name: string | null;
  email: string | null;
  periodEnd: string;
  action: ReconcileAction;
  paymentId?: string;
  paymentDate?: string;
  reason?: string;
  /** Execute only: whether the row actually moved (false on a re-run). */
  marked?: boolean;
  error?: string;
}

export interface ReconcileReport {
  execute: boolean;
  since: string;
  rows: ReconcileRow[];
}

/** The newest charge per schedule id, from a list of gateway payments. */
export function latestChargeBySchedule(payments: PaySimplePayment[]): Map<string, PaySimplePayment> {
  const latest = new Map<string, PaySimplePayment>();
  for (const p of payments) {
    if (!p?.RecurringScheduleId) continue;
    const key = String(p.RecurringScheduleId);
    const prev = latest.get(key);
    const at = Date.parse(p.PaymentDate ?? '') || 0;
    const prevAt = prev ? Date.parse(prev.PaymentDate ?? '') || 0 : -1;
    if (!prev || at > prevAt || (at === prevAt && Number(p.Id) > Number(prev.Id))) latest.set(key, p);
  }
  return latest;
}

/** What one candidate row should become, given its schedule's newest charge. Pure. */
export function decideReconcile(
  candidate: Pick<ReconcileCandidate, 'covered'>,
  latest: PaySimplePayment | undefined,
): ReconcileAction {
  if (candidate.covered) return 'covered_by_newer_row';
  if (!latest) return 'no_charge_seen';
  const outcome = scheduledChargeOutcome(latest.Status);
  if (outcome === 'failed') return 'mark_past_due';
  if (outcome === 'success') return 'latest_charge_succeeded';
  return 'latest_charge_unrecognized';
}

function log(level: 'info' | 'error', event: string, context: Record<string, unknown>): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(), level, service: 'declined-charge-reconcile',
    event, outcome: level === 'info' ? 'success' : 'failure', context,
  });
  if (level === 'info') console.log(line); else console.error(line);
}

export async function reconcileDeclinedScheduledCharges(opts: {
  execute?: boolean;
  since?: Date;
  nowMs?: number;
} = {}): Promise<ReconcileReport> {
  const execute = Boolean(opts.execute);
  const nowMs = opts.nowMs ?? Date.now();
  const since = opts.since ?? new Date(nowMs - DAILY_LOOKBACK_DAYS * 86_400_000);

  const candidates = await sequelize.query<ReconcileCandidate>(RECONCILE_CANDIDATES_SQL, { type: QueryTypes.SELECT });
  const report: ReconcileReport = { execute, since: since.toISOString(), rows: [] };
  if (!candidates.length) return report;

  const latest = latestChargeBySchedule(await listRecentPayments({ since }));

  for (const c of candidates) {
    const scheduleId = String(c.schedule_id);
    const charge = latest.get(scheduleId);
    const row: ReconcileRow = {
      subscriptionId: c.id, scheduleId, name: c.full_name, email: c.email, periodEnd: c.period_end,
      action: decideReconcile(c, charge),
      paymentId: charge ? String(charge.Id) : undefined,
      paymentDate: charge?.PaymentDate,
    };
    report.rows.push(row);
    if (row.action !== 'mark_past_due' || !charge) continue;

    try {
      // The list endpoint leaves FailureData null; the single payment carries the decline.
      const detail = await getPayment(charge.Id);
      row.reason = `scheduled payment ${charge.Id} ${detail.Status ?? charge.Status}: ${failureReasonOf(detail)} (found by reconcile)`;
      if (execute) {
        row.marked = await markPastDueForSchedule(scheduleId, row.reason);
        log('info', 'marked_past_due', { subscriptionId: c.id, scheduleId, paymentId: String(charge.Id), marked: row.marked });
      }
    } catch (err: any) {
      row.error = err?.message ?? String(err);
      log('error', 'reconcile_row_failed', {
        subscriptionId: c.id, scheduleId, error_class: err?.errorClass ?? 'UpstreamError', message: row.error,
      });
    }
  }
  return report;
}

export interface OrphanSuspendResult {
  scheduleId: string;
  outcome: 'would_suspend' | 'suspended' | 'refused' | 'failed';
  subscriptionId?: string;
  reason?: string;
}

/**
 * Stop a schedule whose member is paid up on a newer row. It refuses unless that is
 * provably the case: suspending the only live schedule of a member who is NOT paid
 * another way would silently stop billing them, which is the failure this file exists
 * to catch. Dry by default.
 */
export async function suspendOrphanSchedule(
  scheduleId: string,
  opts: { execute?: boolean } = {},
): Promise<OrphanSuspendResult> {
  const sid = String(scheduleId ?? '').trim();
  if (!/^\d+$/.test(sid)) return { scheduleId: sid, outcome: 'refused', reason: 'not a schedule id' };

  const rows = await sequelize.query<ReconcileCandidate>(RECONCILE_CANDIDATES_SQL, { type: QueryTypes.SELECT });
  const row = rows.find((r) => String(r.schedule_id) === sid);
  if (!row) return { scheduleId: sid, outcome: 'refused', reason: 'no active, lapsed, scheduled row carries this schedule' };
  if (!row.covered) {
    return { scheduleId: sid, subscriptionId: row.id, outcome: 'refused', reason: 'no newer active row covers this member, so this schedule is not an orphan' };
  }
  if (!opts.execute) return { scheduleId: sid, subscriptionId: row.id, outcome: 'would_suspend' };

  const r = await suspendScheduleForSubscription(row.id, sid);
  return r.suspended
    ? { scheduleId: sid, subscriptionId: row.id, outcome: 'suspended' }
    : { scheduleId: sid, subscriptionId: row.id, outcome: 'failed', reason: r.error };
}
