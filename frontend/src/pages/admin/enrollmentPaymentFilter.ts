/**
 * Payment-state filter and badge for the admin enrollment roster.
 *
 * `payment_status` alone cannot tell a checkout that was started and never
 * paid from a free Explorer signup: both are `pending`, and on 2026-09-17
 * that was 408 active enrollments. The difference is the latest subscription
 * row: a checkout mints one (`status: 'pending'`) and an Explorer signup never
 * does. So an ABANDONED CHECKOUT is `payment_status === 'pending'` with a
 * latest subscription that is also `pending`.
 *
 * `payment_status` guards the other direction: a former member who paid and
 * later cancelled can still carry a pending renewal checkout as their latest
 * subscription, but their `payment_status` stays `paid`, so they are not
 * listed as a prospect. Two of seven people on a hand-pulled list that day
 * were exactly that, and were nearly called as leads.
 *
 * Until this module the dropdown offered Paid / Pending Invoice / Failed and
 * `pending` rendered as a bare grey word, so the only way to find these
 * people was a database query.
 */

export type PaymentFilter = 'all' | 'paid' | 'pending_invoice' | 'failed' | 'abandoned_checkout' | 'not_paid';

export type PaymentFilterEnrollment = {
  payment_status?: string;
  subscription?: { plan: string; status: string; created_at?: string | null } | null;
};

export const PAYMENT_FILTER_OPTIONS: ReadonlyArray<{ value: PaymentFilter; label: string }> = [
  { value: 'all', label: 'All Payments' },
  { value: 'paid', label: 'Paid' },
  { value: 'abandoned_checkout', label: 'Abandoned checkout' },
  { value: 'not_paid', label: 'Not paid (any)' },
  { value: 'pending_invoice', label: 'Pending Invoice' },
  { value: 'failed', label: 'Failed' },
];

export function isAbandonedCheckout(e: PaymentFilterEnrollment): boolean {
  return (e.payment_status ?? '') === 'pending' && e.subscription?.status === 'pending';
}

export function matchesPaymentFilter(e: PaymentFilterEnrollment, filter: PaymentFilter): boolean {
  switch (filter) {
    case 'all': return true;
    case 'abandoned_checkout': return isAbandonedCheckout(e);
    case 'not_paid': return (e.payment_status ?? '') === 'pending';
    default: return (e.payment_status ?? '') === filter;
  }
}

export type PaymentBadge = {
  label: string;
  tone: 'success' | 'danger' | 'warning' | 'neutral' | undefined;
  /** Second line under the badge, e.g. "monthly checkout started Sep 16". */
  detail: string | null;
};

const shortDate = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export function paymentBadgeFor(e: PaymentFilterEnrollment): PaymentBadge {
  const status = e.payment_status || 'failed';
  if (status === 'paid') return { label: 'Paid', tone: 'success', detail: null };
  if (status === 'pending_invoice') return { label: 'Pending Invoice', tone: 'warning', detail: null };
  if (status === 'failed') return { label: 'Failed', tone: 'danger', detail: null };
  if (isAbandonedCheckout(e)) {
    const when = shortDate(e.subscription?.created_at);
    const plan = e.subscription?.plan ? `${e.subscription.plan} checkout` : 'checkout';
    return { label: 'Abandoned checkout', tone: 'warning', detail: when ? `${plan} started ${when}` : plan };
  }
  if (status === 'pending') return { label: 'Not paid', tone: 'neutral', detail: null };
  return { label: status, tone: undefined, detail: null };
}
