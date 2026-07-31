import api from '../utils/api';

// Subscription analytics for /admin/revenue — MRR/ARR, plan mix, upcoming
// renewals, the tenure funnel, and the lapsed/failed "needs attention" list.
// Mirrors the shape of backend/src/services/subscriptionAnalyticsService.ts.

export type SubscriptionPlanKey = 'annual' | 'monthly' | 'comp' | 'deposit_holder' | 'other';

export interface SubscriptionKpis {
  mrr: number;
  arr: number;
  activeSubscribers: number;
  compedSeats: number;
  otherPaidCount: number;
  arpu: number;
}

export interface PlanBreakdownRow {
  plan: SubscriptionPlanKey;
  label: string;
  count: number;
  amount: number;
}

export interface UpcomingPayment {
  enrollment_id: string;
  payer_name: string;
  payer_email: string;
  plan: SubscriptionPlanKey;
  amount: number;
  due_date: string;
  in_days: number;
}

export interface TenureBucket {
  label: string;
  count: number;
  byPlan: Record<SubscriptionPlanKey, number>;
  retentionPct: number | null;
}

export interface AttentionRow {
  enrollment_id: string;
  payer_name: string;
  payer_email: string;
  kind: 'lapsed' | 'failed';
  plan: SubscriptionPlanKey;
  reference_date: string;
  days_overdue: number;
}

export interface SubscriptionAnalytics {
  kpis: SubscriptionKpis;
  planBreakdown: PlanBreakdownRow[];
  upcomingPayments: UpcomingPayment[];
  tenureFunnel: TenureBucket[];
  attention: AttentionRow[];
}

export async function getSubscriptionAnalytics(): Promise<SubscriptionAnalytics> {
  const { data } = await api.get('/api/admin/revenue/subscriptions');
  return data;
}

export interface TenureRosterRow {
  enrollment_id: string;
  payer_name: string;
  payer_email: string;
  plan: SubscriptionPlanKey;
  monthly_amount: number;
  member_since: string | null;
  next_payment_date: string | null;
}

/** Drill-down roster for one Month-N tenure bucket. month is 1-based; 5 means "Month 5+". */
export async function getTenureBucketRoster(month: number): Promise<TenureRosterRow[]> {
  const { data } = await api.get(`/api/admin/revenue/tenure/${month}`);
  return data.members;
}

/** Drill-down roster for one plan category ("just the Annual people", etc.),
 *  across every tenure month — behind each row of "Subscribers by plan". */
export async function getPlanRoster(plan: SubscriptionPlanKey): Promise<TenureRosterRow[]> {
  const { data } = await api.get(`/api/admin/revenue/plan/${plan}`);
  return data.members;
}
