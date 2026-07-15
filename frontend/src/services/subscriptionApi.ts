import portalApi from '../utils/portalApi';

// Student self-serve subscription. Two plans; V1 checkout is a PaySimple hosted
// one-time payment that activates the plan + converts an Explorer to a member.

export type PlanId = 'annual' | 'monthly';

export interface PlanConfig {
  id: PlanId;
  label: string;
  price: number;
  amount_cents: number;
  cadence: 'year' | 'month';
  per_month: number;
  period_days: number;
  blurb: string;
}

export interface SubscriptionState {
  plan: PlanId;
  status: string;
  amount_cents: number;
  started_at: string | null;
  current_period_end: string | null;
  canceled: boolean;
  cancel_reason: string | null;
  access_until: string | null;
  next_payment: { date: string; in_days: number } | null;
}

export interface SubscriptionView {
  plans: PlanConfig[];
  needs_subscription: boolean;
  subscription: SubscriptionState | null;
}

export async function fetchSubscription(): Promise<SubscriptionView> {
  const { data } = await portalApi.get<SubscriptionView>('/api/portal/subscription');
  return data;
}

export async function startSubscriptionCheckout(plan: PlanId): Promise<{ payment_link: string; plan: PlanId; amount: number }> {
  const { data } = await portalApi.post('/api/portal/subscription/checkout', { plan });
  return data;
}

export async function cancelSubscription(reason: string): Promise<{ ok: boolean; access_until: string | null }> {
  const { data } = await portalApi.post('/api/portal/subscription/cancel', { reason });
  return data;
}
