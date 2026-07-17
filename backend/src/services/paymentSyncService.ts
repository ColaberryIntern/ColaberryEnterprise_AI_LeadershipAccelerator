import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { Enrollment } from '../models';
import { env } from '../config/env';
import { listPayments, getCustomerById } from './paysimpleService';
import type { PaySimplePayment } from './paysimpleService';

/* ------------------------------------------------------------------ */
/*  PaySimple payment reconciliation                                   */
/*                                                                     */
/*  Pulls payments from the PaySimple API and reconciles each          */
/*  enrollment's payment state so Revenue (SUM amount_paid where paid) */
/*  reflects PaySimple's authoritative truth:                          */
/*    - a payment that goes through  -> payment_status='paid' + amount */
/*    - a payment that fails/reverses -> payment_status='failed'       */
/*      (subtracted from revenue)                                      */
/*  This is the safety net + reversal handler on top of the real-time  */
/*  webhook (which intentionally never flips a 'paid' row to 'failed').*/
/*                                                                     */
/*  Failure-first: listPayments times out + retries (bounded); a bad   */
/*  row is logged and skipped; the sync is idempotent (only writes on  */
/*  an actual state change) and safe to re-run any time.               */
/* ------------------------------------------------------------------ */

// PaySimple statuses that mean money received.
export const COLLECTED_STATUSES = new Set<string>([
  'settled', 'authorized', 'captured', 'posted', 'paid', 'success', 'completed',
]);
// Statuses that mean the payment did NOT / no longer stands -> reverse it.
export const FAILED_STATUSES = new Set<string>([
  'failed', 'returned', 'voided', 'declined', 'reversed', 'chargeback', 'refunded', 'canceled', 'cancelled',
]);

export interface NormalizedPayment {
  paysimplePaymentId: string;
  customerId: string | null;
  externalId: string | null;
  email: string | null;
  amount: number;
  status: string; // normalized lowercase
  paymentDate: Date | null;
}

export interface EnrollmentRow {
  id: string;
  email: string | null;
  paysimple_customer_id: string | null;
  paysimple_external_id: string | null;
  payment_status: string;
  amount_paid: number | null;
}

export interface EnrollmentIndex {
  byExternalId: Map<string, string>;
  byCustomerId: Map<string, string>;
  byEmail: Map<string, string>;
  byId: Map<string, EnrollmentRow>;
}

export interface SyncSummary {
  skipped?: boolean;
  reason?: string;
  pulled: number;
  matchedEnrollments: number;
  unmatchedPayments: number;
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

function firstDefined(...vals: unknown[]): unknown {
  for (const v of vals) if (v !== undefined && v !== null && v !== '') return v;
  return undefined;
}
function parseDate(raw: unknown): Date | null {
  if (!raw) return null;
  const d = new Date(String(raw));
  return isNaN(d.getTime()) ? null : d;
}

export function normalizePayment(raw: PaySimplePayment): NormalizedPayment | null {
  const r = raw as Record<string, any>;
  const id = firstDefined(r.Id, r.PaymentId, r.id, r.payment_id);
  if (id === undefined) return null;
  const amount = Number(firstDefined(r.Amount, r.amount, 0));
  const cid = firstDefined(r.CustomerId, r.customer_id);
  const ext = firstDefined(r.order_external_id, r.external_id, r.ExternalId);
  const email = firstDefined(r.Email, r.CustomerEmail, r.customer?.email, r.customer_email);
  return {
    paysimplePaymentId: String(id),
    customerId: cid != null ? String(cid) : null,
    externalId: ext != null ? String(ext) : null,
    email: email != null ? String(email).trim() : null,
    amount: Number.isFinite(amount) ? amount : 0,
    status: normalizeStatus(firstDefined(r.Status, r.PaymentStatus, r.payment_status, 'unknown')),
    paymentDate: parseDate(firstDefined(r.PaymentDate, r.SettledDate, r.CreatedOn, r.payment_date)),
  };
}

// external id (our order) -> stored customer id -> payer email (case-insensitive).
export function resolveEnrollmentId(p: NormalizedPayment, idx: EnrollmentIndex): string | null {
  if (p.externalId && idx.byExternalId.has(p.externalId)) return idx.byExternalId.get(p.externalId)!;
  if (p.customerId && idx.byCustomerId.has(p.customerId)) return idx.byCustomerId.get(p.customerId)!;
  if (p.email && idx.byEmail.has(p.email.toLowerCase())) return idx.byEmail.get(p.email.toLowerCase())!;
  return null;
}

// Decide an enrollment's target state from its most-recent matched payment:
// latest is collected -> pay it; latest is a failure/reversal -> reverse it;
// otherwise (pending/unknown) -> leave untouched. Returns null when no change.
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

/* ----------------------- enrollment index ------------------------- */

async function buildEnrollmentIndex(): Promise<EnrollmentIndex> {
  const rows = (await Enrollment.findAll({
    attributes: ['id', 'email', 'paysimple_customer_id', 'paysimple_external_id', 'payment_status', 'amount_paid'],
    raw: true,
  })) as unknown as EnrollmentRow[];

  const idx: EnrollmentIndex = {
    byExternalId: new Map(), byCustomerId: new Map(), byEmail: new Map(), byId: new Map(),
  };
  for (const r of rows) {
    idx.byId.set(r.id, r);
    if (r.paysimple_external_id) idx.byExternalId.set(r.paysimple_external_id, r.id);
    if (r.paysimple_customer_id) idx.byCustomerId.set(r.paysimple_customer_id, r.id);
    if (r.email) idx.byEmail.set(r.email.toLowerCase(), r.id);
  }
  return idx;
}

/* ----------------------------- sync ------------------------------- */

export async function syncPaySimplePayments(opts?: {
  sinceDays?: number;
  since?: Date;
  dryRun?: boolean;
  now?: Date;
}): Promise<SyncSummary> {
  const dryRun = opts?.dryRun ?? false;
  const base = (extra: Partial<SyncSummary>): SyncSummary => ({
    pulled: 0, matchedEnrollments: 0, unmatchedPayments: 0, markedPaid: 0, markedFailed: 0, unchanged: 0, dryRun, ...extra,
  });

  if (!env.paysimpleApiUser || !env.paysimpleApiKey) {
    console.warn('[PaymentSync] skipped — PaySimple API credentials not configured');
    return base({ skipped: true, reason: 'missing_credentials' });
  }

  const now = opts?.now ?? new Date();
  const since = opts?.since ?? new Date(now.getTime() - (opts?.sinceDays ?? 120) * 24 * 60 * 60 * 1000);

  const raw = await listPayments({ since });
  const idx = await buildEnrollmentIndex();
  const customerEmailCache = new Map<string, string | null>();
  const summary = base({});
  summary.pulled = raw.length;

  // Group the LATEST matched payment per enrollment (terminal status governs;
  // a decline-then-settle correctly resolves to paid).
  const latestByEnrollment = new Map<string, NormalizedPayment>();

  for (const rp of raw) {
    const p = normalizePayment(rp);
    if (!p) continue;
    let enrId = resolveEnrollmentId(p, idx);

    if (!enrId && p.customerId && !p.email) {
      let email = customerEmailCache.get(p.customerId);
      if (email === undefined) {
        const cust = await getCustomerById(p.customerId);
        email = cust?.Email ? String(cust.Email).trim() : null;
        customerEmailCache.set(p.customerId, email);
      }
      if (email && idx.byEmail.has(email.toLowerCase())) enrId = idx.byEmail.get(email.toLowerCase())!;
    }

    if (!enrId) { summary.unmatchedPayments++; continue; }
    const prev = latestByEnrollment.get(enrId);
    if (!prev || (p.paymentDate?.getTime() ?? 0) >= (prev.paymentDate?.getTime() ?? 0)) {
      latestByEnrollment.set(enrId, p);
    }
  }

  summary.matchedEnrollments = latestByEnrollment.size;

  for (const [enrId, latest] of latestByEnrollment) {
    const target = decideTargetState(latest);
    if (!target) { summary.unchanged++; continue; }
    const cur = idx.byId.get(enrId);
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
    `[PaymentSync] ${dryRun ? '(dry-run) ' : ''}done: pulled=${summary.pulled} matched=${summary.matchedEnrollments} ` +
    `paid=${summary.markedPaid} failed(reversed)=${summary.markedFailed} unchanged=${summary.unchanged} ` +
    `unmatched=${summary.unmatchedPayments}`
  );
  return summary;
}
