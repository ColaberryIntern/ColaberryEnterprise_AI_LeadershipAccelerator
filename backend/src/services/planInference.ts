/** Best-effort plan guess from a raw dollar amount, shared by every place that
 *  needs to label a payment/membership when no subscription row exists to say
 *  so directly. Single source of truth so the two services that need this
 *  (subscriptionAnalyticsService, revenuePaymentsService) can't drift apart on
 *  what counts as "close enough" to a known plan price. */

export type InferablePlan = 'annual' | 'monthly';

export const AMOUNT_MATCH_TOLERANCE = 30; // dollars

// Nominal per-term charge for each self-serve plan (subscriptionService.PLANS).
const KNOWN_TERM_AMOUNTS: Array<{ amount: number; plan: InferablePlan }> = [
  { amount: 1788, plan: 'annual' },
  { amount: 199, plan: 'monthly' },
];

export function inferPlanFromAmountPaid(amountPaid: number | null | undefined): InferablePlan | null {
  if (amountPaid == null) return null;
  let best: { plan: InferablePlan; diff: number } | null = null;
  for (const k of KNOWN_TERM_AMOUNTS) {
    const diff = Math.abs(amountPaid - k.amount);
    if (!best || diff < best.diff) best = { plan: k.plan, diff };
  }
  return best && best.diff <= AMOUNT_MATCH_TOLERANCE ? best.plan : null;
}
