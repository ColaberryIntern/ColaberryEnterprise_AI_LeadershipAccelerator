import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { env } from '../config/env';
import { listRecentPayments } from './paysimpleService';
import { isCollected, normalizeStatus } from './paymentSyncService';

/* ------------------------------------------------------------------ */
/*  App payment reconcile — heal missed-webhook membership payments     */
/*                                                                     */
/*  When a student checks out on enterprise.colaberry.ai our app stores */
/*  their PaySimple customer id on the enrollment. If the payment       */
/*  webhook then fails to link the payment (as happened for Shefat —    */
/*  his subscription carried a placeholder customer id while the real   */
/*  payment went through his correctly-created customer), the           */
/*  enrollment stays 'pending' and the membership never counts.         */
/*                                                                     */
/*  This job closes that gap. For each of OUR checkout customers        */
/*  (enrollment carries a paysimple_customer_id WE stored) that is not   */
/*  yet paid, it looks up that customer's live PaySimple payments and    */
/*  links their membership payment (>= $100; the $50 open-house deposit  */
/*  is handled separately as account_credits).                          */
/*                                                                     */
/*  SCOPE GUARD: it only ever considers payments whose CustomerId is a   */
/*  customer id WE stored during checkout. It NEVER matches by amount or  */
/*  email across the shared gateway, so bootcamp tuition and direct/     */
/*  manual PaySimple charges can never leak into revenue.               */
/*                                                                     */
/*  Idempotent (only touches not-yet-paid enrollments; never reuses a    */
/*  payment id already linked elsewhere) and failure-first.             */
/* ------------------------------------------------------------------ */

// Within the already-scoped set of OUR customers, a payment >= $100 is a membership
// (the only sub-$100 Accelerator charge is the $50 deposit). This is NOT how we scope
// which payments count — the customer-id match does that — only how we tell a member's
// membership payment apart from their deposit.
const MEMBERSHIP_MIN_CENTS = 10000;

interface RawPayment {
  Id: number;
  Status: string;
  Amount: number;
  CustomerId?: number;
  PaymentDate?: string;
}

/**
 * Pure scope guard: from a raw PaySimple payment list, keep only LIVE membership
 * payments (>= $100) whose CustomerId is one of OUR stored checkout customers, grouped
 * by customer id. This is the guarantee that direct/bootcamp charges never leak in —
 * a payment is in scope ONLY if its customer id is in `ourCids`. Exported for testing.
 */
export function selectLinkableMembershipPayments(
  payments: RawPayment[],
  ourCids: Set<string>
): Map<string, Array<{ amountCents: number; pid: string; date: string | undefined }>> {
  const out = new Map<string, Array<{ amountCents: number; pid: string; date: string | undefined }>>();
  for (const p of payments) {
    const cid = String(p.CustomerId);
    if (!ourCids.has(cid)) continue; // SCOPE GUARD — our customers only
    if (!isCollected(normalizeStatus(p.Status))) continue;
    const cents = Math.round(Number(p.Amount) * 100);
    if (cents < MEMBERSHIP_MIN_CENTS) continue; // skip the $50 deposit
    const list = out.get(cid) || [];
    list.push({ amountCents: cents, pid: String(p.Id), date: p.PaymentDate });
    out.set(cid, list);
  }
  return out;
}

export interface AppReconcileSummary {
  skipped?: boolean;
  reason?: string;
  dryRun: boolean;
  candidates: number; // unpaid enrollments carrying a stored customer id
  linked: number; // enrollments newly marked paid + linked
  subscriptionsActivated: number;
  duplicateSubsCanceled: number;
  noPaymentFound: number;
  linkedTotalCents: number;
  details: Array<{ email: string; amountCents: number; pid: string }>;
}

interface Candidate {
  id: string;
  email: string;
  cid: string;
}

export async function reconcileAppPayments(opts?: { dryRun?: boolean }): Promise<AppReconcileSummary> {
  const dryRun = opts?.dryRun ?? false;
  const s: AppReconcileSummary = {
    dryRun, candidates: 0, linked: 0, subscriptionsActivated: 0, duplicateSubsCanceled: 0,
    noPaymentFound: 0, linkedTotalCents: 0, details: [],
  };

  if (!env.paysimpleApiUser || !env.paysimpleApiKey) {
    console.warn('[AppReconcile] skipped — PaySimple API credentials not configured');
    return { ...s, skipped: true, reason: 'missing_credentials' };
  }

  // 1) Our checkout customers whose enrollment is not yet paid.
  const candidates = (await sequelize.query(
    `SELECT id, lower(email) AS email, paysimple_customer_id AS cid
       FROM enrollments
      WHERE paysimple_customer_id IS NOT NULL
        AND payment_status <> 'paid'`,
    { type: QueryTypes.SELECT }
  )) as Candidate[];
  s.candidates = candidates.length;
  if (candidates.length === 0) return s;

  const ourCids = new Set(candidates.map((c) => String(c.cid)));

  // 2) Pull recent payments and keep only LIVE ones under OUR customer ids.
  const since = new Date(env.paysimpleReconcileStart);
  const payments = await listRecentPayments({ since });
  const liveByCid = new Map<string, Array<{ amountCents: number; pid: string; date: string | undefined }>>();
  for (const p of payments) {
    const cid = String(p.CustomerId);
    if (!ourCids.has(cid)) continue; // SCOPE GUARD — our customers only
    if (!isCollected(normalizeStatus(p.Status))) continue;
    const cents = Math.round(Number(p.Amount) * 100);
    if (cents < MEMBERSHIP_MIN_CENTS) continue; // skip the $50 deposit
    const list = liveByCid.get(cid) || [];
    list.push({ amountCents: cents, pid: String(p.Id), date: p.PaymentDate });
    liveByCid.set(cid, list);
  }

  // 3) Never reuse a payment id already linked to any enrollment/subscription.
  const usedPids = new Set<string>(
    ((await sequelize.query(
      `SELECT paysimple_payment_id AS pid FROM enrollments WHERE paysimple_payment_id IS NOT NULL
       UNION SELECT paysimple_payment_id FROM subscriptions WHERE paysimple_payment_id IS NOT NULL`,
      { type: QueryTypes.SELECT }
    )) as Array<{ pid: string }>).map((r) => r.pid)
  );

  for (const c of candidates) {
    const pays = (liveByCid.get(String(c.cid)) || [])
      .filter((p) => !usedPids.has(p.pid))
      .sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
    const membership = pays[0];
    if (!membership) { s.noPaymentFound++; continue; }

    usedPids.add(membership.pid); // don't double-assign within this run
    s.linked++;
    s.linkedTotalCents += membership.amountCents;
    s.details.push({ email: c.email, amountCents: membership.amountCents, pid: membership.pid });

    if (dryRun) continue;

    // Mark the enrollment paid + link the payment.
    await sequelize.query(
      `UPDATE enrollments
          SET payment_status = 'paid',
              amount_paid = :amt,
              paysimple_payment_id = COALESCE(paysimple_payment_id, :pid),
              enrolled_at = COALESCE(enrolled_at, NOW())
        WHERE id = :id AND payment_status <> 'paid'`,
      { replacements: { amt: membership.amountCents / 100, pid: membership.pid, id: c.id }, type: QueryTypes.UPDATE }
    );

    // Activate the most-recent pending subscription; cancel any sibling duplicates.
    const pend = (await sequelize.query(
      `SELECT id FROM subscriptions WHERE enrollment_id = :id AND status = 'pending' ORDER BY created_at DESC`,
      { replacements: { id: c.id }, type: QueryTypes.SELECT }
    )) as Array<{ id: string }>;
    if (pend.length > 0) {
      const [keep, ...dupes] = pend;
      const [, activated] = await sequelize.query(
        `UPDATE subscriptions
            SET status = 'active', paysimple_payment_id = COALESCE(paysimple_payment_id, :pid),
                started_at = COALESCE(started_at, NOW()),
                current_period_end = COALESCE(current_period_end, NOW() + interval '1 month')
          WHERE id = :sid AND status = 'pending'`,
        { replacements: { pid: membership.pid, sid: keep.id }, type: QueryTypes.UPDATE }
      );
      if (activated) s.subscriptionsActivated++;
      for (const d of dupes) {
        const [, canceled] = await sequelize.query(
          `UPDATE subscriptions SET status = 'canceled', canceled_at = NOW(),
                  cancel_reason = 'duplicate checkout submission (reconcile)'
            WHERE id = :sid AND status = 'pending'`,
          { replacements: { sid: d.id }, type: QueryTypes.UPDATE }
        );
        if (canceled) s.duplicateSubsCanceled++;
      }
    }
  }

  console.log(
    `[AppReconcile] ${dryRun ? '(dry-run) ' : ''}done: candidates=${s.candidates} linked=${s.linked} ` +
    `($${(s.linkedTotalCents / 100).toFixed(2)}) subsActivated=${s.subscriptionsActivated} ` +
    `dupSubsCanceled=${s.duplicateSubsCanceled} noPaymentFound=${s.noPaymentFound}`
  );
  return s;
}
