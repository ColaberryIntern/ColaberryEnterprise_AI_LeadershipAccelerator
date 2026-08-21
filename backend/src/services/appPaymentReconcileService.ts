import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { env } from '../config/env';
import { listRecentPayments, getCustomerById } from './paysimpleService';
import { isCollected, normalizeStatus } from './paymentSyncService';
import { activateByRef } from './subscriptionService';

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
/*  That guard was DOCUMENTED for both paths but only ever IMPLEMENTED   */
/*  for path B (fixed 2026-08-19). Path A matched on customer id alone —  */
/*  no amount, no time window — so any collected charge >= $100 that      */
/*  happened to land on a stored customer id was linked, including one    */
/*  that predated the checkout entirely. Path A now runs the same origin  */
/*  test as path B, minus the email equality: path A exists precisely for */
/*  payers whose PaySimple record carries a different address (confirmed  */
/*  live for three students), so an email check there would silently stop */
/*  reconciling them and shift revenue attribution.                       */
/*                                                                     */
/*  INVARIANT: no PaySimple customer id may be claimed by two             */
/*  enrollments. A shared id is how a stranger's charge reaches the wrong */
/*  person, and it is detectable as a duplicate long before it is         */
/*  detectable as a mis-charge. Enforced here, at the point of the money  */
/*  decision, and reported every run — see sharedCustomerIds().          */
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
  /** Full plan price on the pending row (subscriptions.amount_cents). */
  amountCents: number;
  /** What PaySimple was actually asked to charge = amount_cents − applied_credit_cents.
   *  A student with the $50 Open House credit is charged $149 against a $199 pending
   *  row, so matching on amountCents ALONE rejects every credit-discounted payment.
   *  Optional: absent (older rows, callers that never applied a credit) means it equals
   *  amountCents. */
  chargeCents?: number;
}

/**
 * The ORIGIN guard, shared by both paths: our app opened a pending checkout for this
 * amount, shortly before the charge landed. This is what keeps bootcamp tuition and
 * direct/manual charges on the shared PaySimple gateway out of Accelerator revenue.
 *
 * The amount may match either the checkout's full plan price or the credit-discounted
 * amount actually requested — both are amounts WE asked for on that checkout. Nothing
 * else qualifies. Pure; exported for testing.
 */
export function matchesCheckoutOrigin(
  pay: { amountCents: number; paidMs: number },
  checkouts: PendingCheckout[],
  windowMs: number = CHECKOUT_MATCH_WINDOW_MS
): boolean {
  if (!Number.isFinite(pay.paidMs)) return false;
  return checkouts.some(
    (c) =>
      // must be an amount WE asked for — list price, or list less the applied credit
      (c.amountCents === pay.amountCents || (c.chargeCents ?? c.amountCents) === pay.amountCents) &&
      pay.paidMs >= c.startedMs - CHECKOUT_CLOCK_SKEW_MS &&  // must follow OUR checkout
      pay.paidMs <= c.startedMs + windowMs
  );
}

/**
 * Pure scope guard for path B (the hosted-customer case). Path B has no customer-id
 * link at all, so on top of the shared origin guard it must also prove the payer IS
 * this person. All three must agree — email alone never qualifies a payment.
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
  return matchesCheckoutOrigin(pay, checkouts, windowMs);
}

/**
 * The duplicate-customer-id invariant, as a pure function over (enrollment, cid) claims:
 * every PaySimple customer id claimed by more than one enrollment, mapped to the
 * enrollments claiming it. A non-empty result means the gateway cache is contaminated
 * and path A cannot safely attribute a charge on those ids to anybody.
 * Exported for testing.
 */
export function sharedCustomerIds(claims: Array<{ enrollmentId: string; cid: string }>): Map<string, string[]> {
  const byCid = new Map<string, Set<string>>();
  for (const { enrollmentId, cid } of claims) {
    if (!cid || !enrollmentId) continue;
    const set = byCid.get(cid) || new Set<string>();
    set.add(enrollmentId);
    byCid.set(cid, set);
  }
  const shared = new Map<string, string[]>();
  for (const [cid, owners] of byCid) {
    if (owners.size > 1) shared.set(cid, [...owners].sort());
  }
  return shared;
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
  /** Payments dropped by path A's origin guard: on one of our customer ids, but for an
   *  amount we never asked for on that checkout, or landing outside its window. */
  rejectedByOriginGuard: number;
  /** INVARIANT BREACH monitor: PaySimple customer ids claimed by more than one
   *  enrollment. Non-empty means path A skipped those ids rather than guess. */
  sharedCustomerIds: Array<{ cid: string; enrollmentIds: string[] }>;
  /** A candidate whose writes threw. Left fully re-runnable for the next pass. */
  linkFailures: number;
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
                  'amountCents', s.amount_cents,
                  'chargeCents', s.amount_cents - COALESCE(s.applied_credit_cents, 0)
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
      (c: any) => ({
        startedMs: Number(c.startedMs),
        amountCents: Number(c.amountCents),
        chargeCents: Number(c.chargeCents ?? c.amountCents),
      })
    ),
  }));
}

/**
 * Every (enrollment, PaySimple customer id) claim we hold, across BOTH the enrollment
 * row and its subscription rows — the full contamination surface. A single-table UNIQUE
 * index cannot express this, which is one reason the invariant is enforced here rather
 * than in the schema (see the header note).
 */
async function loadCustomerIdClaims(): Promise<Array<{ enrollmentId: string; cid: string }>> {
  const rows = (await sequelize.query(
    `SELECT id AS "enrollmentId", paysimple_customer_id::text AS cid
       FROM enrollments WHERE paysimple_customer_id IS NOT NULL
      UNION
     SELECT enrollment_id AS "enrollmentId", paysimple_customer_id::text AS cid
       FROM subscriptions WHERE paysimple_customer_id IS NOT NULL AND enrollment_id IS NOT NULL`,
    { type: QueryTypes.SELECT }
  )) as Array<{ enrollmentId: string; cid: string }>;
  return rows.map((r) => ({ enrollmentId: String(r.enrollmentId), cid: String(r.cid) }));
}

export async function reconcileAppPayments(opts?: { dryRun?: boolean }): Promise<AppReconcileSummary> {
  const dryRun = opts?.dryRun ?? false;
  const s: AppReconcileSummary = {
    dryRun, candidates: 0, linked: 0, linkedByCustomerId: 0, linkedByCheckoutWindow: 0,
    subscriptionsActivated: 0, duplicateSubsCanceled: 0, noPaymentFound: 0, linkedTotalCents: 0,
    rejectedByOriginGuard: 0, sharedCustomerIds: [], linkFailures: 0, details: [],
  };

  if (!env.paysimpleApiUser || !env.paysimpleApiKey) {
    console.warn('[AppReconcile] skipped — PaySimple API credentials not configured');
    return { ...s, skipped: true, reason: 'missing_credentials' };
  }

  const candidates = await loadCandidates();
  s.candidates = candidates.length;
  if (candidates.length === 0) return s;

  // INVARIANT: a PaySimple customer id belongs to exactly one enrollment. When one is
  // shared, we cannot tell whose money a charge on it is — so path A refuses to use it
  // (fail closed) and the breach is reported on every run, not once at boot.
  const shared = sharedCustomerIds(await loadCustomerIdClaims());
  s.sharedCustomerIds = [...shared].map(([cid, enrollmentIds]) => ({ cid, enrollmentIds }));
  if (shared.size > 0) {
    console.warn(JSON.stringify({
      level: 'warn', service: 'app-payment-reconcile', event: 'shared_paysimple_customer_id',
      error_class: 'ContractViolation', outcome: 'partial',
      context: { count: shared.size, shared: s.sharedCustomerIds },
    }));
  }

  const ourCids = new Set(candidates.flatMap((c) => c.cids).filter((cid) => !shared.has(cid)));

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
    // Path A — the charge landed on a customer id we stored AND it originated from one
    // of this enrollment's own pending checkouts. Customer id alone is not enough: it
    // linked charges for amounts we never asked for, and charges that predated the
    // checkout entirely. Deliberately no email test here — path A is the alias case,
    // where the PaySimple record carries a different address than the enrollment.
    const byCidAll = c.cids
      .flatMap((cid) => liveByCid.get(cid) || [])
      .filter((p) => !usedPids.has(p.pid))
      .sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());

    const byCid = byCidAll.filter((p) =>
      matchesCheckoutOrigin({ amountCents: p.amountCents, paidMs: Date.parse(p.date || '') }, c.checkouts)
    );
    s.rejectedByOriginGuard += byCidAll.length - byCid.length;

    // `date` rides along so activation can anchor the billing period on the day the
    // money actually arrived. This job runs well after the fact by design — it exists
    // to heal payments whose webhook never landed — so its own clock is the wrong
    // basis for a billing period. See activateByRef.
    let membership: { amountCents: number; pid: string; date?: string } | undefined = byCid[0];
    let via: 'customer_id' | 'checkout_window' = 'customer_id';

    // Path B — hosted page minted its own customer; fall back to the checkout window.
    if (!membership && c.checkouts.length > 0) {
      for (const p of unlinkedPool) {
        if (usedPids.has(p.pid)) continue;
        // Same origin guard as path A — run first, so the payer-email lookup (one
        // PaySimple API call per customer) only happens for a charge that already lines
        // up with one of our checkouts.
        if (!matchesCheckoutOrigin({ amountCents: p.amountCents, paidMs: p.paidMs }, c.checkouts)) continue;
        if (!matchesAppCheckout({ amountCents: p.amountCents, paidMs: p.paidMs, payerEmail: await payerEmail(p.cid) }, c.email, c.checkouts)) continue;
        membership = { amountCents: p.amountCents, pid: p.pid, date: p.date };
        via = 'checkout_window';
        break;
      }
    }

    if (!membership) { s.noPaymentFound++; continue; }

    usedPids.add(membership.pid); // don't double-assign within this run
    const countLinked = () => {
      s.linked++;
      if (via === 'customer_id') s.linkedByCustomerId++; else s.linkedByCheckoutWindow++;
      s.linkedTotalCents += membership!.amountCents;
      s.details.push({ email: c.email, amountCents: membership!.amountCents, pid: membership!.pid, via });
    };

    if (dryRun) { countLinked(); continue; }

    try {
      // Activate the most-recent pending subscription through activateByRef — the SAME
      // shared activation the payment webhook uses. This job used to activate with its
      // own raw UPDATE, which flipped the status but skipped everything else activation
      // means: consuming the account credit that discounted the checkout, converting
      // Explorer → paying member, and anchoring the billing period on the class start
      // date. Five students reconciled this way kept an 'available' $50 credit they had
      // already spent ($250 of exposure, found 2026-08-19). Two implementations of
      // "activate a subscription" that disagree is how that happened, so there is now
      // one. Cancel any sibling duplicates (a student who re-tried checkout because the
      // app never acknowledged payment) — that part is not activation and stays here.
      const pend = (await sequelize.query(
        `SELECT id, payment_ref, paysimple_payment_id FROM subscriptions
          WHERE enrollment_id = :id AND status = 'pending' ORDER BY created_at DESC`,
        { replacements: { id: c.id }, type: QueryTypes.SELECT }
      )) as Array<{ id: string; payment_ref: string; paysimple_payment_id: string | null }>;

      if (pend.length > 0) {
        const [keep, ...dupes] = pend;
        // COALESCE semantics preserved: never overwrite a payment id already on the row.
        const activated = await activateByRef(keep.payment_ref, {
          paymentId: keep.paysimple_payment_id ?? membership.pid,
          amount: membership.amountCents / 100,
          paidAt: membership.date,
        });
        if (activated && activated.status === 'active') s.subscriptionsActivated++;

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

      // Link the payment onto the enrollment. activateByRef marks the enrollment paid,
      // but the payment id is this job's own idempotency anchor (loadCandidates keys off
      // it) and no activation path writes it. Written LAST on purpose: it is what takes
      // this candidate out of the next run, so if anything above throws the whole
      // candidate is still picked up and retried rather than half-finished.
      await sequelize.query(
        `UPDATE enrollments
            SET payment_status = 'paid',
                amount_paid = :amt,
                paysimple_payment_id = COALESCE(paysimple_payment_id, :pid),
                enrolled_at = COALESCE(enrolled_at, NOW())
          WHERE id = :id`,
        { replacements: { amt: membership.amountCents / 100, pid: membership.pid, id: c.id }, type: QueryTypes.UPDATE }
      );

      countLinked();
    } catch (err: any) {
      // One bad candidate must never abort the run for everyone else. The payment id is
      // still held in usedPids for this pass, and the candidate is left re-runnable.
      s.linkFailures++;
      console.error(JSON.stringify({
        level: 'error', service: 'app-payment-reconcile', event: 'link_failed',
        error_class: err?.error_class || err?.name || 'Error', outcome: 'failure',
        context: { enrollmentId: c.id, pid: membership.pid, via, message: err?.message },
      }));
    }
  }

  console.log(
    `[AppReconcile] ${dryRun ? '(dry-run) ' : ''}done: candidates=${s.candidates} linked=${s.linked} ` +
    `(byCustomerId=${s.linkedByCustomerId} byCheckoutWindow=${s.linkedByCheckoutWindow}) ` +
    `($${(s.linkedTotalCents / 100).toFixed(2)}) subsActivated=${s.subscriptionsActivated} ` +
    `dupSubsCanceled=${s.duplicateSubsCanceled} noPaymentFound=${s.noPaymentFound} ` +
    `rejectedByOriginGuard=${s.rejectedByOriginGuard} sharedCustomerIds=${s.sharedCustomerIds.length} ` +
    `linkFailures=${s.linkFailures}`
  );
  return s;
}
