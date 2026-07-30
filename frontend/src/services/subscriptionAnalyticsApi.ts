import api from '../utils/api';

// Subscription analytics for /admin/revenue — MRR/ARR, plan mix, upcoming
// renewals, the tenure funnel, and the lapsed/failed "needs attention" list.
// Mirrors the shape of backend/src/services/subscriptionAnalyticsService.ts.

export type SubscriptionPlanKey = 'annual' | 'monthly' | 'comp';

export interface SubscriptionKpis {
  mrr: number;
  arr: number;
  activeSubscribers: number;
  compedSeats: number;
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
