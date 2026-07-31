import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { inferPlanFromAmountPaid } from './planInference';

/* ------------------------------------------------------------------ */
/*  Revenue payments — the unified "all payments" view                 */
/*                                                                     */
/*  There is no single payments table; money lives across four         */
/*  enrollment-linked tables. This service merges them into one        */
/*  normalized transaction list + a summary that reconciles EXACTLY to */
/*  the dashboard Revenue KPI (cohortService.getDashboardStats):       */
/*    collected = SUM(enrollments.amount_paid where paid)              */
/*              + SUM(account_credits.amount_cents where available)/100 */
/*                                                                     */
/*  Sources:                                                            */
/*   - memberships → enrollments.amount_paid (+ subscription plan/id)  */
/*   - deposits    → account_credits (Open House $50 holds)            */
/*   - refunds     → refunds (money returned; shown negative)          */
/* ------------------------------------------------------------------ */

export interface RevenueTransaction {
  id: string;
  date: string | null; // ISO — frontend renders "17h ago" + absolute
  payer_name: string;
  payer_email: string;
  type: 'membership' | 'deposit' | 'refund';
  plan: string | null;
  amount: number; // dollars; refunds are negative
  status: string; // active | settled | available | applied | void | pending | succeeded | failed
  paysimple_payment_id: string | null;
  refundable: boolean; // has a payment id AND not already refunded/void
  counted: boolean; // contributes to the collected total
  enrollment_id: string | null; // -> student profile drawer (/admin/accelerator?enrollment=)
  lead_id: number | null; // -> lead profile (/admin/leads/:id), resolved by payer email
}

export interface RevenueSummary {
  collected: number;
  memberships: number;
  deposits: number; // available deposits
  refunds: number; // succeeded refunds (positive number)
  net: number; // collected - refunds
  membershipCount: number;
  depositAvailableCount: number;
  depositAppliedCount: number;
  refundCount: number;
}

const cap = (s: string | null | undefined): string | null =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : null;

export async function getRevenuePayments(): Promise<{ summary: RevenueSummary; transactions: RevenueTransaction[] }> {
  // 1) Memberships — paid enrollments carrying a real amount, with their latest subscription.
  const memberships = (await sequelize.query(
    `SELECT e.id AS enrollment_id, e.full_name, e.email, e.amount_paid::float8 AS amount,
            COALESCE(e.enrolled_at, s.started_at) AS date,
            COALESCE(e.paysimple_payment_id, s.paysimple_payment_id) AS pid,
            s.plan, s.status AS sub_status
       FROM enrollments e
       LEFT JOIN LATERAL (
         SELECT plan, status, paysimple_payment_id, started_at
           FROM subscriptions WHERE enrollment_id = e.id
           ORDER BY (status = 'active') DESC, created_at DESC LIMIT 1
       ) s ON true
      WHERE e.payment_status = 'paid' AND e.amount_paid > 0 AND e.status = 'active'`,
    { type: QueryTypes.SELECT }
  )) as any[];

  // 2) Open House $50 deposits.
  const deposits = (await sequelize.query(
    `SELECT ac.id, e.id AS enrollment_id, e.full_name, e.email,
            (ac.amount_cents / 100.0)::float8 AS amount, ac.created_at AS date,
            ac.status, ac.source_event_id
       FROM account_credits ac
       JOIN enrollments e ON e.id = ac.enrollment_id
      WHERE ac.reason = 'open_house_deposit'`,
    { type: QueryTypes.SELECT }
  )) as any[];

  // 3) Refunds.
  const refunds = (await sequelize.query(
    `SELECT r.id, r.enrollment_id, r.customer_email, (r.amount_cents / 100.0)::float8 AS amount,
            r.created_at AS date, r.status, r.method, r.paysimple_payment_id AS pid, e.full_name
       FROM refunds r
       LEFT JOIN enrollments e ON e.id = r.enrollment_id`,
    { type: QueryTypes.SELECT }
  )) as any[];

  const tx: RevenueTransaction[] = [];

  for (const m of memberships) {
    // Most subscription rows in production never make it past 'pending' (a
    // known missed-webhook activation gap — see subscriptionAnalyticsService),
    // so a real paid membership frequently has no subscription row to label it
    // at all. Fall back to guessing the plan from the amount actually charged
    // rather than leaving it blank.
    const plan = cap(m.plan) || (inferPlanFromAmountPaid(Number(m.amount)) ? cap(inferPlanFromAmountPaid(Number(m.amount))) : null);
    tx.push({
      id: `mem-${m.enrollment_id}`,
      date: m.date ? new Date(m.date).toISOString() : null,
      payer_name: m.full_name || m.email || '—',
      payer_email: m.email || '',
      type: 'membership',
      plan,
      amount: Number(m.amount),
      status: m.sub_status === 'active' ? 'active' : 'settled',
      paysimple_payment_id: m.pid || null,
      refundable: !!m.pid,
      counted: true,
      enrollment_id: m.enrollment_id,
      lead_id: null,
    });
  }

  for (const d of deposits) {
    const pid =
      typeof d.source_event_id === 'string' && d.source_event_id.startsWith('ps-payment-')
        ? d.source_event_id.slice('ps-payment-'.length)
        : null;
    tx.push({
      id: `dep-${d.id}`,
      date: d.date ? new Date(d.date).toISOString() : null,
      payer_name: d.full_name || d.email || '—',
      payer_email: d.email || '',
      type: 'deposit',
      plan: null,
      amount: Number(d.amount),
      status: d.status, // available | applied | void
      paysimple_payment_id: pid,
      refundable: d.status === 'available' && !!pid,
      counted: d.status === 'available',
      enrollment_id: d.enrollment_id,
      lead_id: null,
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
      status: r.status, // succeeded | pending | failed
      paysimple_payment_id: r.pid || null,
      refundable: false,
      counted: false, // refunds reduce net separately, shown as negative
      enrollment_id: r.enrollment_id,
      lead_id: null,
    });
  }

  // Resolve a lead id per payer email so each row can deep-link to the lead profile
  // (/admin/leads/:id needs a numeric id — there is no email route).
  const emails = [...new Set(tx.map((t) => t.payer_email).filter(Boolean).map((e) => e.toLowerCase()))];
  if (emails.length > 0) {
    const leadRows = (await sequelize.query(
      `SELECT DISTINCT ON (lower(email)) lower(email) AS email, id
         FROM leads WHERE lower(email) IN (:emails) ORDER BY lower(email), id ASC`,
      { replacements: { emails }, type: QueryTypes.SELECT }
    )) as Array<{ email: string; id: number }>;
    const leadByEmail = new Map(leadRows.map((r) => [r.email, Number(r.id)]));
    for (const t of tx) {
      t.lead_id = t.payer_email ? leadByEmail.get(t.payer_email.toLowerCase()) ?? null : null;
    }
  }

  tx.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

  const membershipRev = memberships.reduce((s, m) => s + Number(m.amount), 0);
  const depositAvail = deposits.filter((d) => d.status === 'available').reduce((s, d) => s + Number(d.amount), 0);
  const refundSucceeded = refunds.filter((r) => r.status === 'succeeded').reduce((s, r) => s + Number(r.amount), 0);
  const collected = membershipRev + depositAvail;

  const summary: RevenueSummary = {
    collected,
    memberships: membershipRev,
    deposits: depositAvail,
    refunds: refundSucceeded,
    net: collected - refundSucceeded,
    membershipCount: memberships.length,
    depositAvailableCount: deposits.filter((d) => d.status === 'available').length,
    depositAppliedCount: deposits.filter((d) => d.status === 'applied').length,
    refundCount: refunds.filter((r) => r.status === 'succeeded').length,
  };

  return { summary, transactions: tx };
}
