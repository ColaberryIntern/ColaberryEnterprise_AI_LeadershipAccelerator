import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

/* ------------------------------------------------------------------ */
/*  Subscription analytics — the recurring-revenue lens for           */
/*  /admin/revenue, distinct from revenuePaymentsService's cash        */
/*  ledger. Built on the `subscriptions` table: one row per checkout/  */
/*  renewal attempt (V1 billing is NOT auto-recurring — renewal is a   */
/*  fresh manual checkout, so "next payment due" = current_period_end, */
/*  not a scheduled charge). A student's current state is their newest */
/*  non-failed row. "Lapsed" and "failed" below are COMPUTED from that */
/*  — nothing in this codebase flags them today, so this is read-only  */
/*  reporting; it does not revoke access.                              */
/* ------------------------------------------------------------------ */

export type SubscriptionPlanKey = 'annual' | 'monthly' | 'comp';

export interface SubscriptionKpis {
  mrr: number;
  arr: number;
  activeSubscribers: number; // paying (annual/monthly), excludes comp
  compedSeats: number;
  arpu: number; // mrr / activeSubscribers
}

export interface PlanBreakdownRow {
  plan: SubscriptionPlanKey;
  label: string;
  count: number;
  amount: number; // dollars/month contribution (mrr-equivalent), 0 for comp
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
  label: string; // 'Free Trial' | 'Month 1' | 'Month 2' | ... | 'Month 5+'
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

interface SubscriptionRow {
  id: string;
  enrollment_id: string;
  plan: SubscriptionPlanKey;
  status: 'pending' | 'active' | 'canceled' | 'failed';
  amount_cents: number;
  started_at: string | null;
  current_period_end: string | null;
  created_at: string;
  full_name: string | null;
  email: string | null;
  enrollment_type: string | null;
}

const PLAN_LABELS: Record<SubscriptionPlanKey, string> = {
  annual: 'Annual',
  monthly: 'Monthly',
  comp: 'Free Access',
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS; // bucketing granularity only — display, not billing math
const TENURE_BUCKET_COUNT = 5; // Month 1..4, then a "Month 5+" tail

const monthlyEquivalent = (plan: SubscriptionPlanKey, amountCents: number): number => {
  if (plan === 'comp') return 0;
  const dollars = amountCents / 100;
  return plan === 'annual' ? dollars / 12 : dollars;
};

async function fetchAllSubscriptions(): Promise<SubscriptionRow[]> {
  return (await sequelize.query(
    `SELECT s.id, s.enrollment_id, s.plan, s.status, s.amount_cents,
            s.started_at, s.current_period_end, s.created_at,
            e.full_name, e.email, e.enrollment_type
       FROM subscriptions s
       JOIN enrollments e ON e.id = s.enrollment_id
      ORDER BY s.enrollment_id, s.created_at DESC`,
    { type: QueryTypes.SELECT }
  )) as SubscriptionRow[];
}

/** Explorers still in their free trial (no converted subscription yet). Activating
 *  a subscription always flips enrollment_type off 'explorer' (subscriptionService's
 *  grantMembership) — so 'explorer' and "has an active subscription" never overlap,
 *  and a failed/pending checkout attempt correctly leaves someone counted here. */
async function fetchExplorerCount(): Promise<number> {
  const rows = (await sequelize.query(
    `SELECT COUNT(*)::int AS count FROM enrollments WHERE enrollment_type = 'explorer'`,
    { type: QueryTypes.SELECT }
  )) as Array<{ count: number }>;
  return rows[0]?.count ?? 0;
}

export async function getSubscriptionAnalytics(nowMs: number = Date.now()): Promise<SubscriptionAnalytics> {
  const rows = await fetchAllSubscriptions();

  // Group by enrollment, newest-first (query already orders this way).
  const byEnrollment = new Map<string, SubscriptionRow[]>();
  for (const r of rows) {
    const list = byEnrollment.get(r.enrollment_id);
    if (list) list.push(r);
    else byEnrollment.set(r.enrollment_id, [r]);
  }

  const kpis: SubscriptionKpis = { mrr: 0, arr: 0, activeSubscribers: 0, compedSeats: 0, arpu: 0 };
  const planCounts: Record<SubscriptionPlanKey, { count: number; amount: number }> = {
    annual: { count: 0, amount: 0 },
    monthly: { count: 0, amount: 0 },
    comp: { count: 0, amount: 0 },
  };
  const upcomingPayments: UpcomingPayment[] = [];
  const attention: AttentionRow[] = [];
  // tenureMonths[enrollment_id] = months since the enrollment's FIRST non-failed
  // subscription started, for the tenure funnel below.
  const tenureAnchor = new Map<string, { startedMs: number; currentPlan: SubscriptionPlanKey }>();

  for (const [enrollmentId, subs] of byEnrollment) {
    const current = subs.find((s) => s.status !== 'failed') || null;
    const latest = subs[0]; // newest row regardless of status, for failed-attempt detection

    if (current && current.status === 'active') {
      const amount = monthlyEquivalent(current.plan, current.amount_cents);
      if (current.plan !== 'comp') {
        kpis.mrr += amount;
        kpis.activeSubscribers += 1;
      } else {
        kpis.compedSeats += 1;
      }
      planCounts[current.plan].count += 1;
      planCounts[current.plan].amount += amount;

      if (current.current_period_end) {
        const dueMs = new Date(current.current_period_end).getTime();
        if (dueMs >= nowMs) {
          upcomingPayments.push({
            enrollment_id: enrollmentId,
            payer_name: current.full_name || current.email || '—',
            payer_email: current.email || '',
            plan: current.plan,
            amount: current.amount_cents / 100,
            due_date: new Date(dueMs).toISOString(),
            in_days: Math.ceil((dueMs - nowMs) / DAY_MS),
          });
        } else if (current.plan !== 'comp') {
          // Lapsed: still "active" on record but the period has passed with no renewal.
          attention.push({
            enrollment_id: enrollmentId,
            payer_name: current.full_name || current.email || '—',
            payer_email: current.email || '',
            kind: 'lapsed',
            plan: current.plan,
            reference_date: new Date(dueMs).toISOString(),
            days_overdue: Math.floor((nowMs - dueMs) / DAY_MS),
          });
        }
      }
    }

    // Failed-attempt detection: the newest row for this enrollment is a failed
    // checkout AND there is no active/canceled row already covering them (i.e.
    // they don't already have real access via an older active subscription).
    if (latest.status === 'failed' && (!current || current.status !== 'active')) {
      attention.push({
        enrollment_id: enrollmentId,
        payer_name: latest.full_name || latest.email || '—',
        payer_email: latest.email || '',
        kind: 'failed',
        plan: latest.plan,
        reference_date: new Date(latest.created_at).toISOString(),
        days_overdue: 0,
      });
    }

    // Tenure anchor = earliest non-failed row's started_at (fall back to
    // created_at for a pending row with no started_at yet).
    const nonFailed = subs.filter((s) => s.status !== 'failed');
    if (nonFailed.length > 0 && current && current.status === 'active') {
      const earliest = nonFailed[nonFailed.length - 1]; // list is newest-first
      const startedMs = new Date(earliest.started_at || earliest.created_at).getTime();
      if (Number.isFinite(startedMs)) {
        tenureAnchor.set(enrollmentId, { startedMs, currentPlan: current.plan });
      }
    }
  }

  kpis.arr = kpis.mrr * 12;
  kpis.arpu = kpis.activeSubscribers > 0 ? kpis.mrr / kpis.activeSubscribers : 0;

  const planBreakdown: PlanBreakdownRow[] = (['annual', 'monthly', 'comp'] as SubscriptionPlanKey[]).map((plan) => ({
    plan,
    label: PLAN_LABELS[plan],
    count: planCounts[plan].count,
    amount: planCounts[plan].amount,
  }));

  upcomingPayments.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
  // Most urgent first: longest-overdue lapses, then failed attempts by recency.
  attention.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'lapsed' ? -1 : 1;
    if (a.kind === 'lapsed') return b.days_overdue - a.days_overdue;
    return new Date(b.reference_date).getTime() - new Date(a.reference_date).getTime();
  });

  // Tenure funnel: bucket every currently-active subscriber by months since
  // their tenure anchor. Free Trial = Explorers with no subscription at all.
  // retentionPct is a snapshot ratio (this bucket's headcount vs. the bucket
  // above it, right now) — not per-person cohort tracking across time, since
  // the subscription model only launched recently and there isn't enough
  // history yet for a true cohort-retention curve.
  const buckets: TenureBucket[] = [];
  const freeTrialCount = await fetchExplorerCount();
  const emptyPlanCounts = (): Record<SubscriptionPlanKey, number> => ({ annual: 0, monthly: 0, comp: 0 });
  const bucketCounts: Array<{ count: number; byPlan: Record<SubscriptionPlanKey, number> }> = Array.from(
    { length: TENURE_BUCKET_COUNT },
    () => ({ count: 0, byPlan: emptyPlanCounts() })
  );

  for (const { startedMs, currentPlan } of tenureAnchor.values()) {
    const monthsElapsed = Math.floor((nowMs - startedMs) / MONTH_MS);
    const bucketIndex = Math.min(Math.max(monthsElapsed, 0), TENURE_BUCKET_COUNT - 1);
    bucketCounts[bucketIndex].count += 1;
    bucketCounts[bucketIndex].byPlan[currentPlan] += 1;
  }

  buckets.push({ label: 'Free Trial', count: freeTrialCount, byPlan: emptyPlanCounts(), retentionPct: null });
  bucketCounts.forEach((b, i) => {
    const label = i === TENURE_BUCKET_COUNT - 1 ? `Month ${i + 1}+` : `Month ${i + 1}`;
    const prev = buckets[buckets.length - 1];
    const retentionPct = prev.count > 0 ? Math.round((b.count / prev.count) * 100) : null;
    buckets.push({ label, count: b.count, byPlan: b.byPlan, retentionPct });
  });

  return { kpis, planBreakdown, upcomingPayments, tenureFunnel: buckets, attention };
}
