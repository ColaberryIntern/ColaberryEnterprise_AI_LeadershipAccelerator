import React from 'react';
import { SectionCard } from '../shell';
import { TenureBucket, SubscriptionPlanKey } from '../../../services/subscriptionAnalyticsApi';

interface Props {
  buckets: TenureBucket[];
}

// Fixed categorical order/color, never reassigned — same pair PlanBreakdownCard
// uses. Comp is included for completeness even though it's usually a thin sliver.
const PLAN_ORDER: SubscriptionPlanKey[] = ['annual', 'monthly', 'comp'];
const PLAN_COLOR: Record<SubscriptionPlanKey, string> = {
  annual: '#15803d',
  monthly: '#1f5fd0',
  comp: 'var(--text-muted)',
};
const PLAN_SWATCH_LABEL: Record<SubscriptionPlanKey, string> = {
  annual: 'Annual',
  monthly: 'Monthly',
  comp: 'Free Access',
};

/** Tenure funnel — a snapshot heatmap of how many current subscribers are how
 *  many months into their subscription, split by plan, with a retention %
 *  against the bucket above. Free Trial (Explorers, no subscription yet) sits
 *  at the top; higher tenure buckets get thinner as people churn out. This is
 *  a headcount-ratio snapshot, not per-person cohort tracking across time —
 *  the subscription model is too new for a full acquisition-month matrix to
 *  carry enough data yet. */
export default function TenureRetentionFunnel({ buckets }: Props) {
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <SectionCard
      title="Subscriber tenure"
      subtitle="Who's how many months in, and how many carry over from the bucket above."
      icon="stack-line"
    >
      <div className="d-flex align-items-center gap-3 mb-3 small text-muted">
        {PLAN_ORDER.map((p) => (
          <span key={p} className="d-inline-flex align-items-center gap-1">
            <span style={{ width: 10, height: 10, borderRadius: 2, background: PLAN_COLOR[p], display: 'inline-block' }} />
            {PLAN_SWATCH_LABEL[p]}
          </span>
        ))}
      </div>

      {buckets.map((b) => {
        const widthPct = Math.max(b.count > 0 ? 4 : 0, Math.round((b.count / maxCount) * 100));
        return (
          <div key={b.label} className="d-flex align-items-center gap-3 my-2" style={{ fontSize: 13 }}>
            <span style={{ width: 84, color: 'var(--bs-secondary-color)' }}>{b.label}</span>
            <span
              className="flex-grow-1 d-flex"
              style={{ height: 16, borderRadius: 4, background: 'var(--bs-tertiary-bg)', overflow: 'hidden' }}
              title={`${b.count} subscriber${b.count === 1 ? '' : 's'} in ${b.label}`}
            >
              {b.count > 0 && (
                <span style={{ display: 'flex', width: `${widthPct}%`, height: '100%', gap: 2 }}>
                  {PLAN_ORDER.filter((p) => b.byPlan[p] > 0).map((p) => (
                    <span
                      key={p}
                      style={{
                        display: 'block',
                        height: '100%',
                        flex: b.byPlan[p],
                        background: PLAN_COLOR[p],
                        borderRadius: 4,
                      }}
                      title={`${PLAN_SWATCH_LABEL[p]}: ${b.byPlan[p]}`}
                    />
                  ))}
                </span>
              )}
            </span>
            <span className="text-nowrap text-end" style={{ width: 108, fontVariantNumeric: 'tabular-nums' }}>
              <span className="fw-semibold">{b.count}</span>
              {b.retentionPct !== null && <span className="text-muted"> ({b.retentionPct}%)</span>}
            </span>
          </div>
        );
      })}
    </SectionCard>
  );
}
