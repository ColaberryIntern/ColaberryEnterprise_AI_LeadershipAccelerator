import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

/* ------------------------------------------------------------------ */
/*  Revenue payments — the unified "all payments" view                 */
/*                                                                     */
/*  Reads straight from the payment ledger (payments table), the single */
/*  source of truth for Accelerator revenue, plus admin-issued refunds. */
/*  Revenue reconciles EXACTLY to the dashboard KPI:                    */
/*    collected = SUM(payments.amount_cents WHERE is_live)/100          */
/*  A bounced/reversed payment stays in the list (counted=false) so the */
/*  admin can see it, but it does not add to the collected total.       */
/* ------------------------------------------------------------------ */

export interface RevenueTransaction {
  id: string;
  date: string | null; // ISO — frontend renders "17h ago" + absolute
  payer_name: string;
  payer_email: string;
  type: 'membership' | 'deposit' | 'refund';
  plan: string | null;
  amount: number; // dollars; refunds are negative
  status: string; // PaySimple status (Settled | Posted | ReverseNSF | Returned | ...) or refund status
  paysimple_payment_id: string | null;
  refundable: boolean; // live, has a payment id, and not already refunded/void
  counted: boolean; // contributes to the collected total (is_live)
  enrollment_id: string | null;
}

export interface RevenueSummary {
  collected: number;
  memberships: number;
  deposits: number;
  refunds: number; // succeeded refunds (positive number)
  net: number; // collected - refunds
  membershipCount: number;
  depositAvailableCount: number; // live deposits
  depositAppliedCount: number; // bounced/returned deposits (not counted)
  refundCount: number;
}

function planLabel(type: string, amount: number): string | null {
  if (type === 'deposit') return 'Deposit';
  if (type === 'membership') return amount >= 1000 ? 'Annual' : 'Monthly';
  return null;
}

export async function getRevenuePayments(): Promise<{ summary: RevenueSummary; transactions: RevenueTransaction[] }> {
  // 1) Ledger rows (live + dead), newest first.
  const ledger = (await sequelize.query(
    `SELECT id, paysimple_payment_id, payer_email, payer_name, amount_cents, status,
            is_live, payment_type, payment_date, enrollment_id
       FROM payments
      ORDER BY payment_date DESC NULLS LAST`,
    { type: QueryTypes.SELECT }
  )) as any[];

  // 2) Which payment ids already have a refund/void (so we don't offer it twice).
  const refundedIds = new Set<string>(
    ((await sequelize.query(
      `SELECT DISTINCT paysimple_payment_id AS pid FROM refunds WHERE status IN ('succeeded','pending')`,
      { type: QueryTypes.SELECT }
    )) as Array<{ pid: string }>).map((r) => r.pid)
  );

  // 3) Refund ledger (shown as negative rows; succeeded ones reduce net).
  const refunds = (await sequelize.query(
    `SELECT r.id, r.enrollment_id, r.customer_email, (r.amount_cents / 100.0)::float8 AS amount,
            r.created_at AS date, r.status, r.method, r.paysimple_payment_id AS pid, e.full_name
       FROM refunds r
       LEFT JOIN enrollments e ON e.id = r.enrollment_id`,
    { type: QueryTypes.SELECT }
  )) as any[];

  const tx: RevenueTransaction[] = [];

  for (const p of ledger) {
    const amount = Number(p.amount_cents) / 100;
    tx.push({
      id: `pay-${p.id}`,
      date: p.payment_date ? new Date(p.payment_date).toISOString() : null,
      payer_name: p.payer_name || p.payer_email || '—',
      payer_email: p.payer_email || '',
      type: p.payment_type === 'deposit' ? 'deposit' : 'membership',
      plan: planLabel(p.payment_type, amount),
      amount,
      status: p.status,
      paysimple_payment_id: p.paysimple_payment_id || null,
      refundable: !!p.is_live && !!p.paysimple_payment_id && !refundedIds.has(p.paysimple_payment_id),
      counted: !!p.is_live,
      enrollment_id: p.enrollment_id || null,
    });
  }

  for (const r of refunds) {
    tx.push({
      id: `ref-${r.id}`,
      date: r.date ? new Date(r.date).toISOString() : null,
      payer_name: r.full_name || r.customer_email || '—',
      payer_email: r.customer_email || '',
      type: 'refund',
      plan: r.method === 'void' ? 'Void' : 'Reversal',
      amount: -Math.abs(Number(r.amount)),
      status: r.status,
      paysimple_payment_id: r.pid || null,
      refundable: false,
      counted: false,
      enrollment_id: r.enrollment_id || null,
    });
  }

  tx.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

  // Summary — sourced from the ledger so it reconciles to the KPI exactly.
  const liveRows = ledger.filter((p) => p.is_live);
  const membershipRev =
    liveRows.filter((p) => p.payment_type === 'membership').reduce((s, p) => s + Number(p.amount_cents), 0) / 100;
  const depositRev =
    liveRows.filter((p) => p.payment_type === 'deposit').reduce((s, p) => s + Number(p.amount_cents), 0) / 100;
  const collected = membershipRev + depositRev;
  const refundSucceeded = refunds.filter((r) => r.status === 'succeeded').reduce((s, r) => s + Number(r.amount), 0);

  const summary: RevenueSummary = {
    collected,
    memberships: membershipRev,
    deposits: depositRev,
    refunds: refundSucceeded,
    net: collected - refundSucceeded,
    membershipCount: liveRows.filter((p) => p.payment_type === 'membership').length,
    depositAvailableCount: liveRows.filter((p) => p.payment_type === 'deposit').length,
    depositAppliedCount: ledger.filter((p) => !p.is_live && p.payment_type === 'deposit').length,
    refundCount: refunds.filter((r) => r.status === 'succeeded').length,
  };

  return { summary, transactions: tx };
}
