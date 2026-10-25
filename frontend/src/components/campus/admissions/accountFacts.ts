import { useEffect, useState } from 'react';
import { fetchEnrollment, type PortalEnrollmentView } from '../../../services/portalEnrollmentApi';
import { fetchSubscription, type SubscriptionView } from '../../../services/subscriptionApi';
import type { SideTop } from '../interior/pageSummary';

/**
 * "Your account" (C21, v6 D3): the Admissions room's left-wall board and the plans page's account card, from the same sources as
 * Settings' Enrollment and Subscription tabs (GET /api/portal/enrollment, GET /api/portal/subscription). Each is fetched on its own
 * and fails soft: a row whose source did not answer is left out rather than guessed, and with neither source there is no board.
 */
export interface AccountFacts { enrollment: PortalEnrollmentView | null; subscription: SubscriptionView | null }

const PLAN_NAME: Record<string, string> = { annual: 'Annual membership', monthly: 'Month-to-month' };

/** True when the learner's own plan is active (the plans page's "Your current tier"). */
export function isSubscribed(f: AccountFacts): boolean {
  const s = f.subscription?.subscription;
  return !!s && !s.canceled && s.status === 'active'; // the same test Settings' Subscription tab uses
}

export function accountRows(f: AccountFacts): SideTop | null {
  const rows: SideTop['rows'] = [];
  if (f.enrollment) {
    const e = f.enrollment;
    rows.push({ label: 'Enrollment', value: e.status === 'not_enrolled' ? 'Not enrolled yet' : e.enrolled_cohort ? `Enrolled · ${e.enrolled_cohort.name}` : 'Enrolled' });
  }
  if (f.subscription) {
    const s = f.subscription.subscription;
    rows.push({ label: 'Plan', value: !s ? 'None yet' : s.canceled ? `${PLAN_NAME[s.plan] ?? s.plan} · canceled` : PLAN_NAME[s.plan] ?? s.plan });
    if (s?.next_payment) rows.push({ label: 'Next payment', value: `in ${s.next_payment.in_days} days` });
  }
  return rows.length ? { title: 'Your account', rows } : null;
}

/** Both sources, fetched while `open`; null until the first answer. */
export function useAccountFacts(open: boolean): AccountFacts | null {
  const [facts, setFacts] = useState<AccountFacts | null>(null);
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    void Promise.all([fetchEnrollment().catch(() => null), fetchSubscription().catch(() => null)])
      .then(([enrollment, subscription]) => { if (alive) setFacts({ enrollment, subscription }); });
    return () => { alive = false; };
  }, [open]);
  return facts;
}
