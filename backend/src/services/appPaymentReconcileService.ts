import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { env } from '../config/env';
import { listRecentPayments, getCustomerById } from './paysimpleService';
import { isCollected, normalizeStatus } from './paymentSyncService';

/* ------------------------------------------------------------------ */
/*  App payment reconcile — heal missed-webhook membership payments     */
/*                                                                     */
/*  When a student checks out on enterprise.colaberry.ai our app stores */
/*  their PaySimple customer id and opens a PENDING subscription. The   */
/*  payment webhook normally activates it. When that webhook is missed  */
/*  the enrollment stays 'pending', the student keeps Explorer access    */
/*  they already paid to leave, and the membership never counts.        */
/*                                                                     */
/*  This job closes that gap, via two match paths:                      */
/*                                                                     */
/*  A) CUSTOMER-ID path — the charge landed on a customer id WE stored   */
/*     at checkout (on the enrollment OR on the subscription row).      */
/*                                                                     */
/*  B) CHECKOUT-WINDOW path — PaySimple's HOSTED payment page creates    */
/*     its OWN customer record for the payer, so the charge's           */
/*     CustomerId is frequently NOT the one we pre-created and path A    */
/*     can never match it. Confirmed live 2026-08-12: Arinze Ohagwu's    */
/*     checkout made customer 43728423 while his settled $199 landed on  */
/*     43728431, minted by the hosted page 4 minutes later. Three        */
/*     students ($597) sat unlinked this way, one locked out for 2 days. */
/*                                                                     */
/*  SCOPE GUARD (both paths): origin, never amount-or-email alone. A     */
/*  payment is only ever considered when OUR APP recorded that it        */
/*  started that checkout — a pending subscription row for that person,  */
/*  for that exact amount, opened shortly before the charge. In path B    */
/*  the payer email only decides WHICH of our pending checkouts a charge  */
/*  belongs to; it never pulls a payment into scope by itself. Bootcamp   */
/*  tuition and direct/manual charges on the shared gateway have no       */
/*  matching pending checkout, so they can never leak into revenue.      */
/*                                                                     */
/*  Idempotent (never reuses a payment id already linked anywhere) and   */
/*  failure-first.                                                      */
/* ------------------------------------------------------------------ */

// Within the already-scoped set of OUR customers, a payment >= $100 is a membership
// (the only sub-$100 Accelerator charge is the $50 deposit). This is NOT how we scope
// which payments count — the origin match does that — only how we tell a member's
// membership payment apart from their deposit.
const MEMBERSHIP_MIN_CENTS = 10000;

// How long after a checkout is opened we still accept its charge. Generous because a
// student can sit on the hosted page (re-enter a card, switch to bank) before paying;
// safe because amount + payer email + an app-originated pending row must ALL agree.
const CHECKOUT_MATCH_WINDOW_MS = 6 * 3600 * 1000;

// PaySimple stamps PaymentDate from its own clock; allow a little skew so a charge
// recorded a moment "before" our row was written is not discarded.
const CHECKOUT_CLOCK_SKEW_MS = 10 * 60 * 1000;

interface RawPayment {
  Id: number;
  Status: string;
  Amount: number;
  CustomerId?: number;
  PaymentDate?: string;
}

/**
 * Pure scope guard for path A: from a raw PaySimple payment list, keep only LIVE
 * membership payments (>= $100) whose CustomerId is one of OUR stored checkout
 * customers, grouped by customer id. A payment is in scope ONLY if its customer id is
 * in `ourCids`. Exported for testing.
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

export interface PendingCheckout {
  startedMs: number;
  amountCents: number;
}

/**
 * Pure scope guard for path B (the hosted-customer case). True only when the payer is
 * this exact person AND our app opened a pending checkout for that same amount just
 * before the charge. All three must agree — email alone never qualifies a payment,
 * which is what keeps direct/bootcamp charges on the shared gateway out of revenue.
 * Exported for testing.
 */
export function matchesAppCheckout(
  pay: { amountCents: number; paidMs: number; payerEmail: string },
  enrollmentEmail: string,
  checkouts: PendingCheckout[],
  windowMs: number = CHECKOUT_MATCH_WINDOW_MS
): boolean {
  const payer = (pay.payerEmail || '').trim().toLowerCase();
  const want = (enrollmentEmail || '').trim().toLowerCase();
  if (!payer || !want || payer !== want) return false;      // must be the same person
  if (!Number.isFinite(pay.paidMs)) return false;
  return checkouts.some(
    (c) =>
      c.amountCents === pay.amountCents &&                   // must be the amount WE asked for
      pay.paidMs >= c.startedMs - CHECKOUT_CLOCK_SKEW_MS &&  // must follow OUR checkout
      pay.paidMs <= c.startedMs + windowMs
  );
}

export interface AppReconcileSummary {
  skipped?: boolean;
  reason?: string;
  dryRun: boolean;
  candidates: number; // people with an app-originated checkout not yet linked
  linked: number; // enrollments newly marked paid + linked
  linkedByCustomerId: number; // path A
  linkedByCheckoutWindow: number; // path B (hosted-page customer mismatch)
  subscriptionsActivated: number;
  duplicateSubsCanceled: number;
  noPaymentFound: number;
  linkedTotalCents: number;
  details: Array<{ email: string; amountCents: number; pid: string; via: 'customer_id' | 'checkout_window' }>;
}

interface Candidate {
  id: string;
  email: string;
  cids: string[];
  checkouts: PendingCheckout[];
}

/**
 * Everyone with an app-originated checkout that has not been linked to a payment:
 * either a still-pending subscription (the self-serve plan flow) or a stored checkout
 * customer id on an unpaid enrollment (the legacy one-time CB- flow). Customer ids are
 * gathered from BOTH the enrollment and its subscription rows — startCheckout has
 * historically written it only to the subscription, which is why 62 of 86 pending
 * checkouts were invisible to this job before 2026-08-12.
 */
async function loadCandidates(): Promise<Candidate[]> {
  const rows = (await sequelize.query(
    `SELECT e.id,
            lower(e.email) AS email,
            ARRAY_REMOVE(
              ARRAY_AGG(DISTINCT s.paysimple_customer_id) || ARRAY[e.paysimple_customer_id],
              NULL
            ) AS cids,
            COALESCE(
              JSONB_AGG(
                JSONB_BUILD_OBJECT(
                  'startedMs', (EXTRACT(EPOCH FROM s.created_at) * 1000)::bigint,
                  'amountCents', s.amount_cents
                )
              ) FILTER (WHERE s.status = 'pending'),
              '[]'::jsonb
            ) AS checkouts
       FROM enrollments e
       LEFT JOIN subscriptions s ON s.enrollment_id = e.id
      WHERE e.paysimple_payment_id IS NULL
        AND (
              s.status = 'pending'
           OR (e.paysimple_customer_id IS NOT NULL AND e.payment_status <> 'paid')
            )
      GROUP BY e.id, e.email, e.paysimple_customer_id`,
    { type: QueryTypes.SELECT }
  )) as Array<{ id: string; email: string; cids: string[] | null; checkouts: PendingCheckout[] | string }>;

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    cids: (r.cids || []).map(String),
    checkouts: (typeof r.checkouts === 'string' ? JSON.parse(r.checkouts) : r.checkouts || []).map(
      (c: any) => ({ startedMs: Number(c.startedMs), amountCents: Number(c.amountCents) })
    ),
  }));
}

export async function reconcileAppPayments(opts?: { dryRun?: boolean }): Promise<AppReconcileSummary> {
  const dryRun = opts?.dryRun ?? false;
  const s: AppReconcileSummary = {
    dryRun, candidates: 0, linked: 0, linkedByCustomerId: 0, linkedByCheckoutWindow: 0,
    subscriptionsActivated: 0, duplicateSubsCanceled: 0, noPaymentFound: 0, linkedTotalCents: 0, details: [],
  };

  if (!env.paysimpleApiUser || !env.paysimpleApiKey) {
    console.warn('[AppReconcile] skipped — PaySimple API credentials not configured');
    return { ...s, skipped: true, reason: 'missing_credentials' };
  }

  const candidates = await loadCandidates();
  s.candidates = candidates.length;
  if (candidates.length === 0) return s;

  const ourCids = new Set(candidates.flatMap((c) => c.cids));

  // Never reuse a payment id already linked to any enrollment/subscription.
  const usedPids = new Set<string>(
    ((await sequelize.query(
      `SELECT paysimple_payment_id AS pid FROM enrollments WHERE paysimple_payment_id IS NOT NULL
       UNION SELECT paysimple_payment_id FROM subscriptions WHERE paysimple_payment_id IS NOT NULL`,
      { type: QueryTypes.SELECT }
    )) as Array<{ pid: string }>).map((r) => r.pid)
  );

  // Live membership charges since the reconcile epoch, unlinked, most recent first.
  const since = new Date(env.paysimpleReconcileStart);
  const payments = await listRecentPayments({ since });
  const liveByCid = selectLinkableMembershipPayments(payments as RawPayment[], ourCids);

  // Every collected, unlinked membership charge — the pool path B searches. Path A's
  // customer-id matches are a subset; both are gated by `usedPids` at assignment time.
  const unlinkedPool = (payments as RawPayment[])
    .filter((p) => isCollected(normalizeStatus(p.Status)))
    .filter((p) => Math.round(Number(p.Amount) * 100) >= MEMBERSHIP_MIN_CENTS)
    .filter((p) => !usedPids.has(String(p.Id)))
    .map((p) => ({
      pid: String(p.Id),
      cid: String(p.CustomerId),
      amountCents: Math.round(Number(p.Amount) * 100),
      date: p.PaymentDate,
      paidMs: Date.parse(p.PaymentDate || ''),
    }))
    .sort((a, b) => (a.paidMs || 0) - (b.paidMs || 0));

  // Payer email lookups are one API call per customer — cached, and only ever made for
  // a charge whose amount and timing already line up with one of our pending checkouts.
  const emailCache = new Map<string, string>();
  const payerEmail = async (cid: string): Promise<string> => {
    if (!emailCache.has(cid)) {
      const c = await getCustomerById(cid);
      emailCache.set(cid, (c?.Email || '').trim().toLowerCase());
    }
    return emailCache.get(cid) || '';
  };

  for (const c of candidates) {
    // Path A — the charge landed on a customer id we stored.
    const byCid = c.cids
      .flatMap((cid) => liveByCid.get(cid) || [])
      .filter((p) => !usedPids.has(p.pid))
      .sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());

    let membership: { amountCents: number; pid: string } | undefined = byCid[0];
    let via: 'customer_id' | 'checkout_window' = 'customer_id';

    // Path B — hosted page minted its own customer; fall back to the checkout window.
    if (!membership && c.checkouts.length > 0) {
      const amounts = new Set(c.checkouts.map((k) => k.amountCents));
      for (const p of unlinkedPool) {
        if (usedPids.has(p.pid)) continue;
        if (!amounts.has(p.amountCents)) continue; // cheap filter before any API call
        const plausible = c.checkouts.some(
          (k) => p.paidMs >= k.startedMs - CHECKOUT_CLOCK_SKEW_MS && p.paidMs <= k.startedMs + CHECKOUT_MATCH_WINDOW_MS
        );
        if (!plausible) continue;
        if (!matchesAppCheckout({ amountCents: p.amountCents, paidMs: p.paidMs, payerEmail: await payerEmail(p.cid) }, c.email, c.checkouts)) continue;
        membership = { amountCents: p.amountCents, pid: p.pid };
        via = 'checkout_window';
        break;
      }
    }

    if (!membership) { s.noPaymentFound++; continue; }

    usedPids.add(membership.pid); // don't double-assign within this run
    s.linked++;
    if (via === 'customer_id') s.linkedByCustomerId++; else s.linkedByCheckoutWindow++;
    s.linkedTotalCents += membership.amountCents;
    s.details.push({ email: c.email, amountCents: membership.amountCents, pid: membership.pid, via });

    if (dryRun) continue;

    // Mark the enrollment paid + link the payment.
    await sequelize.query(
      `UPDATE enrollments
          SET payment_status = 'paid',
              amount_paid = :amt,
              paysimple_payment_id = COALESCE(paysimple_payment_id, :pid),
              enrolled_at = COALESCE(enrolled_at, NOW())
        WHERE id = :id`,
      { replacements: { amt: membership.amountCents / 100, pid: membership.pid, id: c.id }, type: QueryTypes.UPDATE }
    );

    // Activate the most-recent pending subscription; cancel any sibling duplicates
    // (a student who re-tried checkout because the app never acknowledged payment).
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
    `(byCustomerId=${s.linkedByCustomerId} byCheckoutWindow=${s.linkedByCheckoutWindow}) ` +
    `($${(s.linkedTotalCents / 100).toFixed(2)}) subsActivated=${s.subscriptionsActivated} ` +
    `dupSubsCanceled=${s.duplicateSubsCanceled} noPaymentFound=${s.noPaymentFound}`
  );
  return s;
}
