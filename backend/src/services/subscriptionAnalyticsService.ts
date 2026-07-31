import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { inferPlanFromAmountPaid } from './planInference';

/* ------------------------------------------------------------------ */
/*  Subscription analytics — the recurring-revenue lens for            */
/*  /admin/revenue, distinct from revenuePaymentsService's cash        */
/*  ledger. "Is this a paying member" is answered by the ENROLLMENT    */
/*  (payment_status='paid'), the same signal cohortService's canonical */
/*  revenue KPI already trusts — NOT by subscriptions.status, which is */
/*  unreliable in production: most subscription rows are stuck         */
/*  'pending' because the post-payment activation webhook frequently   */
/*  never fires (a known, separate gap — see appPaymentReconcileService,*/
/*  "Heal missed-webhook membership payments"), even though the        */
/*  enrollment itself is genuinely paid. Subscription rows are used     */
/*  only to ENRICH a paying enrollment with plan/tenure/renewal detail  */
/*  when they exist and are informative.                                */
/*                                                                       */
/*  "Lapsed" and "failed" below are COMPUTED, not stored — nothing in   */
/*  this codebase flags them today, so this is read-only reporting; it  */
/*  does not revoke access.                                              */
/* ------------------------------------------------------------------ */

export type SubscriptionPlanKey = 'annual' | 'monthly' | 'comp' | 'deposit_holder' | 'other';

export interface SubscriptionKpis {
  mrr: number;
  arr: number;
  activeSubscribers: number; // paying (annual/monthly), excludes comp/other/deposit_holder
  compedSeats: number;
  otherPaidCount: number; // paid members whose plan/amount can't be classified (e.g. sponsor-invoiced)
  arpu: number; // mrr / activeSubscribers
}

export interface PlanBreakdownRow {
  plan: SubscriptionPlanKey;
  label: string;
  count: number;
  amount: number; // dollars/month for annual/monthly; total dollars held for deposit_holder; 0 otherwise
}

export interface UpcomingPayment {
  enrollment_id: string;
  payer_name: string;
  payer_email: string;
  plan: SubscriptionPlanKey;
  amount: number; // dollars, full term amount
  due_date: string; // ISO — current_period_end
  in_days: number;
}

export interface TenureBucket {
  label: string; // 'Explorer' | 'Month 1' | 'Month 2' | ... | 'Month 5+'
  count: number;
  byPlan: Record<SubscriptionPlanKey, number>;
  retentionPct: number | null; // vs. previous bucket; null for the first bucket
}

export interface AttentionRow {
  enrollment_id: string;
  payer_name: string;
  payer_email: string;
  kind: 'lapsed' | 'failed';
  plan: SubscriptionPlanKey;
  reference_date: string; // ISO — the date the row became urgent (period end, or the failed attempt's date)
  days_overdue: number; // 0 for 'failed' (no period end to be overdue against)
}

export interface SubscriptionAnalytics {
  kpis: SubscriptionKpis;
  planBreakdown: PlanBreakdownRow[];
  upcomingPayments: UpcomingPayment[];
  tenureFunnel: TenureBucket[];
  attention: AttentionRow[];
}

export interface TenureRosterRow {
  enrollment_id: string;
  payer_name: string;
  payer_email: string;
  plan: SubscriptionPlanKey;
  monthly_amount: number;
  member_since: string | null;
}

interface MemberRow {
  enrollment_id: string;
  full_name: string | null;
  email: string | null;
  amount_paid: string | null; // numeric from PG comes back as string
  enrollment_created_at: string | null; // last-resort tenure anchor when there's no subscription row at all
  sub_id: string | null;
  plan: 'annual' | 'monthly' | 'comp' | null;
  sub_status: 'pending' | 'active' | 'canceled' | 'failed' | null;
  amount_cents: number | null;
  started_at: string | null;
  current_period_end: string | null;
  sub_created_at: string | null;
}

/** One enrollment's fully-resolved membership state — computed once, shared by
 *  the summary view (getSubscriptionAnalytics) and the per-bucket drill-down
 *  (getTenureBucketRoster) so they can never drift apart on what counts. */
interface ClassifiedMember {
  enrollmentId: string;
  payerName: string;
  payerEmail: string;
  plan: SubscriptionPlanKey;
  monthlyAmount: number;
  best: MemberRow | null;
  newest: MemberRow | null;
  memberSince: string | null; // ISO — the anchor date backing tenureBucketIndex
  tenureBucketIndex: number | null; // 0-based Month-1..Month-5+ index; null = not anchorable
}

const PLAN_LABELS: Record<SubscriptionPlanKey, string> = {
  annual: 'Annual',
  monthly: 'Monthly',
  comp: 'Free Access',
  deposit_holder: 'Deposit Holder',
  other: 'Other',
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS; // bucketing granularity only — display, not billing math
const TENURE_BUCKET_COUNT = 5; // Month 1..4, then a "Month 5+" tail
const UPCOMING_HORIZON_DAYS = 45; // "upcoming" means soon, not "any future date"

const monthlyEquivalent = (plan: 'annual' | 'monthly', amount: number): number =>
  plan === 'annual' ? amount / 12 : amount;

const emptyPlanCounts = (): Record<SubscriptionPlanKey, number> => ({
  annual: 0, monthly: 0, comp: 0, deposit_holder: 0, other: 0,
});

/** The one subscription row (if any) that best represents this enrollment's
 *  current plan/cycle: prefer an active row, else a row that at least has a
 *  real current_period_end (was activated at some point, later canceled),
 *  else the newest non-failed row, else null (every row failed — no usable
 *  "current" plan; the caller falls back to amount_paid). */
function pickBestSubscription(rows: MemberRow[]): MemberRow | null {
  const real = rows.filter((r) => r.sub_id != null);
  if (real.length === 0) return null;
  return (
    real.find((r) => r.sub_status === 'active') ||
    real.find((r) => r.current_period_end != null) ||
    real.find((r) => r.sub_status !== 'failed') ||
    null
  );
}

async function fetchPayingMembers(): Promise<MemberRow[]> {
  return (await sequelize.query(
    `SELECT e.id AS enrollment_id, e.full_name, e.email, e.amount_paid, e.created_at AS enrollment_created_at,
            s.id AS sub_id, s.plan, s.status AS sub_status, s.amount_cents,
            s.started_at, s.current_period_end, s.created_at AS sub_created_at
       FROM enrollments e
       LEFT JOIN subscriptions s ON s.enrollment_id = e.id
      WHERE e.payment_status = 'paid' AND e.enrollment_type != 'explorer'
      ORDER BY e.id, s.created_at DESC`,
    { type: QueryTypes.SELECT }
  )) as MemberRow[];
}

/** Explorers still in their free trial, split by whether they've paid the $50
 *  Open House "hold your spot" deposit — a real, if small, dollar commitment
 *  that deserves its own bucket rather than being invisible inside "Explorer". */
async function fetchExplorerCounts(): Promise<{ freeTrial: number; depositHolders: number; depositTotal: number }> {
  const rows = (await sequelize.query(
    `SELECT
        COUNT(*) FILTER (WHERE ac.enrollment_id IS NULL)::int AS free_trial,
        COUNT(*) FILTER (WHERE ac.enrollment_id IS NOT NULL)::int AS deposit_holders,
        COALESCE(SUM(ac.amount_cents) FILTER (WHERE ac.enrollment_id IS NOT NULL), 0)::int AS deposit_cents
       FROM enrollments e
       LEFT JOIN LATERAL (
         SELECT enrollment_id, amount_cents FROM account_credits
          WHERE enrollment_id = e.id AND reason = 'open_house_deposit' AND status = 'available'
          LIMIT 1
       ) ac ON true
      WHERE e.enrollment_type = 'explorer'`,
    { type: QueryTypes.SELECT }
  )) as Array<{ free_trial: number; deposit_holders: number; deposit_cents: number }>;
  const r = rows[0] || { free_trial: 0, deposit_holders: 0, deposit_cents: 0 };
  return { freeTrial: r.free_trial, depositHolders: r.deposit_holders, depositTotal: r.deposit_cents / 100 };
}

function classifyMember(enrollmentId: string, memberRows: MemberRow[], nowMs: number): ClassifiedMember {
  const first = memberRows[0];
  const payerName = first.full_name || first.email || '—';
  const payerEmail = first.email || '';
  const amountPaid = first.amount_paid != null ? Number(first.amount_paid) : null;
  const best = pickBestSubscription(memberRows);
  const newest = memberRows.find((r) => r.sub_id != null) || null;

  let plan: SubscriptionPlanKey;
  let monthlyAmount = 0;
  if (best) {
    plan = best.plan as SubscriptionPlanKey;
    monthlyAmount = plan === 'comp' ? 0 : monthlyEquivalent(plan as 'annual' | 'monthly', (best.amount_cents || 0) / 100);
  } else {
    const inferred = inferPlanFromAmountPaid(amountPaid);
    if (inferred) {
      plan = inferred;
      monthlyAmount = monthlyEquivalent(inferred, amountPaid as number);
    } else {
      plan = 'other';
    }
  }

  // Tenure anchor: any real, dated signal counts here — NOT gated on
  // best.sub_status === 'active'. Most subscription rows in production are
  // stuck 'pending' (the missed-webhook gap), so requiring 'active' silently
  // dropped genuinely paying members from every tenure bucket even though
  // they were correctly counted in the plan breakdown above — the exact
  // "20 vs 34" mismatch Ali caught. Falls back to the enrollment's own
  // created_at when there's no subscription row at all (plan inferred purely
  // from amount_paid) — still a real, if less precise, "since when" signal.
  let memberSince: string | null = null;
  let tenureBucketIndex: number | null = null;
  if (plan !== 'other') {
    const anchorSource = best?.started_at || best?.sub_created_at || first.enrollment_created_at;
    if (anchorSource) {
      const startedMs = new Date(anchorSource).getTime();
      if (Number.isFinite(startedMs) && startedMs > 0) {
        memberSince = new Date(startedMs).toISOString();
        const monthsElapsed = Math.floor((nowMs - startedMs) / MONTH_MS);
        tenureBucketIndex = Math.min(Math.max(monthsElapsed, 0), TENURE_BUCKET_COUNT - 1);
      }
    }
  }

  return { enrollmentId, payerName, payerEmail, plan, monthlyAmount, best, newest, memberSince, tenureBucketIndex };
}

async function classifyAllMembers(nowMs: number): Promise<ClassifiedMember[]> {
  const rows = await fetchPayingMembers();
  const byEnrollment = new Map<string, MemberRow[]>();
  for (const r of rows) {
    const list = byEnrollment.get(r.enrollment_id);
    if (list) list.push(r);
    else byEnrollment.set(r.enrollment_id, [r]);
  }
  return Array.from(byEnrollment.entries()).map(([id, memberRows]) => classifyMember(id, memberRows, nowMs));
}

/** Bucket label for a 1-based tenure month index (1..TENURE_BUCKET_COUNT). */
function monthLabel(oneBased: number): string {
  return oneBased === TENURE_BUCKET_COUNT ? `Month ${oneBased}+` : `Month ${oneBased}`;
}

export async function getSubscriptionAnalytics(nowMs: number = Date.now()): Promise<SubscriptionAnalytics> {
  const members = await classifyAllMembers(nowMs);

  const kpis: SubscriptionKpis = { mrr: 0, arr: 0, activeSubscribers: 0, compedSeats: 0, otherPaidCount: 0, arpu: 0 };
  const planCounts: Record<SubscriptionPlanKey, { count: number; amount: number }> = {
    annual: { count: 0, amount: 0 },
    monthly: { count: 0, amount: 0 },
    comp: { count: 0, amount: 0 },
    deposit_holder: { count: 0, amount: 0 },
    other: { count: 0, amount: 0 },
  };
  const upcomingPayments: UpcomingPayment[] = [];
  const attention: AttentionRow[] = [];
  const bucketCounts: Array<{ count: number; byPlan: Record<SubscriptionPlanKey, number> }> = Array.from(
    { length: TENURE_BUCKET_COUNT },
    () => ({ count: 0, byPlan: emptyPlanCounts() })
  );

  for (const m of members) {
    const { enrollmentId, payerName, payerEmail, plan, monthlyAmount, best, newest } = m;

    planCounts[plan].count += 1;
    if (plan === 'annual' || plan === 'monthly') {
      kpis.mrr += monthlyAmount;
      kpis.activeSubscribers += 1;
      planCounts[plan].amount += monthlyAmount;
    } else if (plan === 'comp') {
      kpis.compedSeats += 1;
    } else if (plan === 'other') {
      kpis.otherPaidCount += 1;
    }

    // Renewal/lapse only make sense with a real, activated period — and never
    // apply to a comped seat, which is never billed again.
    if (best && best.current_period_end && plan !== 'comp') {
      const dueMs = new Date(best.current_period_end).getTime();
      const inDays = Math.ceil((dueMs - nowMs) / DAY_MS);
      if (best.sub_status === 'active' && dueMs >= nowMs && inDays <= UPCOMING_HORIZON_DAYS) {
        upcomingPayments.push({
          enrollment_id: enrollmentId, payer_name: payerName, payer_email: payerEmail, plan,
          amount: (best.amount_cents || 0) / 100, due_date: new Date(dueMs).toISOString(), in_days: inDays,
        });
      } else if (best.sub_status === 'active' && dueMs < nowMs) {
        attention.push({
          enrollment_id: enrollmentId, payer_name: payerName, payer_email: payerEmail, kind: 'lapsed', plan,
          reference_date: new Date(dueMs).toISOString(), days_overdue: Math.floor((nowMs - dueMs) / DAY_MS),
        });
      }
    }

    // Failed-attempt detection: the newest subscription row is a failed
    // checkout and nothing else about this enrollment counts as a real,
    // currently-active plan (best would be that active row instead, if one existed).
    if (newest && newest.sub_status === 'failed' && (!best || best.sub_status !== 'active')) {
      attention.push({
        enrollment_id: enrollmentId, payer_name: payerName, payer_email: payerEmail, kind: 'failed',
        plan: (newest.plan as SubscriptionPlanKey) || 'other',
        reference_date: new Date(newest.sub_created_at as string).toISOString(), days_overdue: 0,
      });
    }

    if (m.tenureBucketIndex !== null) {
      bucketCounts[m.tenureBucketIndex].count += 1;
      bucketCounts[m.tenureBucketIndex].byPlan[plan] += 1;
    }
  }

  kpis.arr = kpis.mrr * 12;
  kpis.arpu = kpis.activeSubscribers > 0 ? kpis.mrr / kpis.activeSubscribers : 0;

  const { freeTrial: freeTrialCount, depositHolders, depositTotal } = await fetchExplorerCounts();
  planCounts.deposit_holder = { count: depositHolders, amount: depositTotal };

  const planOrder: SubscriptionPlanKey[] = ['annual', 'monthly', 'comp', 'deposit_holder'];
  if (planCounts.other.count > 0) planOrder.push('other'); // only surface if it's real, never hidden
  const planBreakdown: PlanBreakdownRow[] = planOrder.map((plan) => ({
    plan, label: PLAN_LABELS[plan], count: planCounts[plan].count, amount: planCounts[plan].amount,
  }));

  upcomingPayments.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
  attention.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'lapsed' ? -1 : 1;
    if (a.kind === 'lapsed') return b.days_overdue - a.days_overdue;
    return new Date(b.reference_date).getTime() - new Date(a.reference_date).getTime();
  });

  // Tenure funnel: bucket every anchorable member by months since their tenure
  // anchor. Explorer = free-trial signups with no deposit and no subscription.
  // retentionPct is a snapshot ratio (this bucket's headcount vs. the bucket
  // above it, right now) — not per-person cohort tracking across time, since
  // the subscription model only launched recently and there isn't enough
  // history yet for a true cohort-retention curve.
  const buckets: TenureBucket[] = [];
  buckets.push({ label: 'Explorer', count: freeTrialCount, byPlan: emptyPlanCounts(), retentionPct: null });
  bucketCounts.forEach((b, i) => {
    const prev = buckets[buckets.length - 1];
    const retentionPct = prev.count > 0 ? Math.round((b.count / prev.count) * 100) : null;
    buckets.push({ label: monthLabel(i + 1), count: b.count, byPlan: b.byPlan, retentionPct });
  });

  return { kpis, planBreakdown, upcomingPayments, tenureFunnel: buckets, attention };
}

/** Drill-down roster for one Month-N tenure bucket (1-based; TENURE_BUCKET_COUNT
 *  means "Month N+"). Shares classifyAllMembers with getSubscriptionAnalytics so
 *  a bucket's roster length always matches its displayed count exactly. */
export async function getTenureBucketRoster(oneBasedMonth: number, nowMs: number = Date.now()): Promise<TenureRosterRow[]> {
  const targetIndex = Math.min(Math.max(oneBasedMonth, 1), TENURE_BUCKET_COUNT) - 1;
  const members = await classifyAllMembers(nowMs);
  return members
    .filter((m) => m.tenureBucketIndex === targetIndex)
    .map((m) => ({
      enrollment_id: m.enrollmentId,
      payer_name: m.payerName,
      payer_email: m.payerEmail,
      plan: m.plan,
      monthly_amount: m.monthlyAmount,
      member_since: m.memberSince,
    }))
    .sort((a, b) => new Date(a.member_since || 0).getTime() - new Date(b.member_since || 0).getTime());
}
