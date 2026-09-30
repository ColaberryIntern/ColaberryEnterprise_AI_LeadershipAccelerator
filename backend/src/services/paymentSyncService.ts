import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { getPayment } from './paysimpleService';
import type { PaySimplePayment } from './paysimpleService';
import { env } from '../config/env';

/* ------------------------------------------------------------------ */
/*  PaySimple payment reconciliation (precise — our payments only)     */
/*                                                                     */
/*  Reconciles ONLY the payments WE recorded through our own checkout  */
/*  flow — the `paysimple_payment_id`s stored on subscriptions (via    */
/*  activateByRef) and enrollments (via markEnrollmentPaid). For each,  */
/*  it calls getPayment(id) and reads the CURRENT status straight from  */
/*  PaySimple, then:                                                    */
/*    - settled/authorized  -> payment_status='paid' + amount           */
/*    - failed/returned/voided/refunded/chargeback -> 'failed'          */
/*      (subtracted from revenue)                                       */
/*                                                                     */
/*  It NEVER matches by email or customer id, so an old bootcamp/       */
/*  tuition charge for someone who also has a platform enrollment can   */
/*  never leak into revenue. It only ever touches an enrollment whose   */
/*  payment WE already recorded. This is the reversal-safety-net on top */
/*  of the real-time webhook; catching a brand-new webhook-MISSED       */
/*  payment is out of scope here (the webhook is the record path).      */
/*                                                                     */
/*  Idempotent (writes only on a real state change), failure-first     */
/*  (a getPayment error skips that one payment), safe to re-run.        */
/* ------------------------------------------------------------------ */

export const COLLECTED_STATUSES = new Set<string>([
  'settled', 'authorized', 'captured', 'posted', 'paid', 'success', 'completed',
]);
export const FAILED_STATUSES = new Set<string>([
  'failed', 'returned', 'voided', 'declined', 'reversed', 'chargeback', 'refunded', 'canceled', 'cancelled',
]);

export interface NormalizedPayment {
  paysimplePaymentId: string;
  amount: number;
  status: string; // normalized lowercase
  paymentDate: Date | null;
}

export interface SyncSummary {
  skipped?: boolean;
  reason?: string;
  knownPayments: number;
  fetched: number;
  fetchErrors: number;
  markedPaid: number;
  markedFailed: number;
  unchanged: number;
  dryRun: boolean;
}

/* ------------------------- pure helpers --------------------------- */

export function normalizeStatus(raw: unknown): string {
  return String(raw ?? 'unknown').trim().toLowerCase();
}
export function isCollected(raw: unknown): boolean {
  return COLLECTED_STATUSES.has(normalizeStatus(raw));
}
export function isFailed(raw: unknown): boolean {
  return FAILED_STATUSES.has(normalizeStatus(raw));
}
function parseDate(raw: unknown): Date | null {
  if (!raw) return null;
  const d = new Date(String(raw));
  return isNaN(d.getTime()) ? null : d;
}

export function normalizePayment(raw: PaySimplePayment): NormalizedPayment | null {
  const r = raw as Record<string, any>;
  const id = r.Id ?? r.PaymentId ?? r.id;
  if (id === undefined || id === null) return null;
  const amount = Number(r.Amount ?? r.amount ?? 0);
  return {
    paysimplePaymentId: String(id),
    amount: Number.isFinite(amount) ? amount : 0,
    status: normalizeStatus(r.Status ?? r.PaymentStatus ?? 'unknown'),
    paymentDate: parseDate(r.PaymentDate ?? r.ActualSettledDate ?? r.CreatedOn),
  };
}

// The enrollment's most-recent recorded payment governs: a decline-then-settle
// resolves to paid; a settle-then-chargeback resolves to failed.
export function decideTargetState(
  latest: NormalizedPayment
): { payment_status: 'paid' | 'failed'; amount_paid?: number; paysimple_payment_id?: string } | null {
  if (isCollected(latest.status)) {
    return { payment_status: 'paid', amount_paid: latest.amount, paysimple_payment_id: latest.paysimplePaymentId };
  }
  if (isFailed(latest.status)) {
    return { payment_status: 'failed', paysimple_payment_id: latest.paysimplePaymentId };
  }
  return null;
}

/* ------------------------ data gathering -------------------------- */

interface KnownPayment { enrollmentId: string; paymentId: string; }
interface EnrollmentState { payment_status: string; amount_paid: number | null; }

// Every (enrollment, PaySimple payment id) we recorded from our own checkout.
async function gatherKnownPayments(): Promise<KnownPayment[]> {
  const rows = (await sequelize.query(
    `SELECT enrollment_id, paysimple_payment_id AS payment_id
       FROM subscriptions
      WHERE paysimple_payment_id IS NOT NULL AND enrollment_id IS NOT NULL
     UNION
     SELECT id AS enrollment_id, paysimple_payment_id AS payment_id
       FROM enrollments
      WHERE paysimple_payment_id IS NOT NULL`,
    { type: QueryTypes.SELECT }
  )) as Array<{ enrollment_id: string; payment_id: string }>;
  return rows.map((r) => ({ enrollmentId: r.enrollment_id, paymentId: r.payment_id }));
}

async function getEnrollmentStates(ids: string[]): Promise<Map<string, EnrollmentState>> {
  const out = new Map<string, EnrollmentState>();
  if (ids.length === 0) return out;
  const rows = (await sequelize.query(
    `SELECT id, payment_status, amount_paid FROM enrollments WHERE id IN (:ids)`,
    { replacements: { ids }, type: QueryTypes.SELECT }
  )) as Array<{ id: string; payment_status: string; amount_paid: number | null }>;
  for (const r of rows) out.set(r.id, { payment_status: r.payment_status, amount_paid: r.amount_paid });
  return out;
}

/* ----------------------------- sync ------------------------------- */

export async function syncPaySimplePayments(opts?: { dryRun?: boolean }): Promise<SyncSummary> {
  const dryRun = opts?.dryRun ?? false;
  const base = (extra: Partial<SyncSummary>): SyncSummary => ({
    knownPayments: 0, fetched: 0, fetchErrors: 0, markedPaid: 0, markedFailed: 0, unchanged: 0, dryRun, ...extra,
  });

  if (!env.paysimpleApiUser || !env.paysimpleApiKey) {
    console.warn('[PaymentSync] skipped — PaySimple API credentials not configured');
    return base({ skipped: true, reason: 'missing_credentials' });
  }

  const known = await gatherKnownPayments();
  const summary = base({ knownPayments: known.length });
  if (known.length === 0) {
    console.log('[PaymentSync] no recorded PaySimple payment ids to reconcile');
    return summary;
  }

  // Fetch each unique payment once (cache), then keep the latest per enrollment.
  const paymentCache = new Map<string, NormalizedPayment | null>();
  const latestByEnrollment = new Map<string, NormalizedPayment>();

  for (const k of known) {
    let p = paymentCache.get(k.paymentId);
    if (p === undefined) {
      try {
        const raw = await getPayment(k.paymentId);
        p = normalizePayment(raw);
        summary.fetched++;
      } catch (err: any) {
        console.warn(`[PaymentSync] getPayment ${k.paymentId} failed: ${err?.message}`);
        summary.fetchErrors++;
        p = null;
      }
      paymentCache.set(k.paymentId, p);
    }
    if (!p) continue;
    const prev = latestByEnrollment.get(k.enrollmentId);
    if (!prev || (p.paymentDate?.getTime() ?? 0) >= (prev.paymentDate?.getTime() ?? 0)) {
      latestByEnrollment.set(k.enrollmentId, p);
    }
  }

  const states = await getEnrollmentStates([...latestByEnrollment.keys()]);

  for (const [enrId, latest] of latestByEnrollment) {
    const target = decideTargetState(latest);
    if (!target) { summary.unchanged++; continue; }
    const cur = states.get(enrId);
    const amountChanged =
      target.payment_status === 'paid' &&
      Number(cur?.amount_paid ?? -1) !== Number(target.amount_paid ?? 0);
    const statusChanged = cur?.payment_status !== target.payment_status;
    if (!statusChanged && !amountChanged) { summary.unchanged++; continue; }

    if (!dryRun) {
      try {
        await sequelize.query(
          `UPDATE enrollments SET
             payment_status = :status,
             amount_paid = COALESCE(:amount, amount_paid),
             paysimple_payment_id = COALESCE(:pid, paysimple_payment_id),
             enrolled_at = CASE WHEN :status = 'paid' AND enrolled_at IS NULL THEN NOW() ELSE enrolled_at END
           WHERE id = :id`,
          {
            replacements: {
              id: enrId,
              status: target.payment_status,
              amount: target.payment_status === 'paid' ? (target.amount_paid ?? 0) : null,
              pid: target.paysimple_payment_id ?? null,
            },
            type: QueryTypes.UPDATE,
          }
        );
      } catch (err: any) {
        console.error(`[PaymentSync] update failed for enrollment ${enrId}: ${err?.message}`);
        continue;
      }
    }
    if (target.payment_status === 'paid') summary.markedPaid++;
    else summary.markedFailed++;
  }

  console.log(
    `[PaymentSync] ${dryRun ? '(dry-run) ' : ''}done: known=${summary.knownPayments} fetched=${summary.fetched} ` +
    `paid=${summary.markedPaid} failed(reversed)=${summary.markedFailed} unchanged=${summary.unchanged} ` +
    `fetchErrors=${summary.fetchErrors}`
  );
  return summary;
}
