import React, { useState } from 'react';
import { SectionCard } from '../shell';
import { TenureBucket, SubscriptionPlanKey } from '../../../services/subscriptionAnalyticsApi';
import { PLAN_COLOR, PLAN_LABEL } from './format';
import ExplorerRosterModal from './ExplorerRosterModal';
import MemberRosterModal from './MemberRosterModal';

interface Props {
  buckets: TenureBucket[];
}

// Only plans that actually accrue tenure appear in the funnel's bars/legend —
// deposit_holder/other never get a tenure anchor (see backend), so they'd
// always render as an empty, meaningless legend entry.
const PLAN_ORDER: SubscriptionPlanKey[] = ['annual', 'monthly', 'comp'];

/** Tenure funnel — a snapshot heatmap of how many current subscribers are how
 *  many months into their subscription, split by plan, with a retention %
 *  against the bucket above. Explorer (free trial, no subscription yet) sits
 *  at the top; higher tenure buckets get thinner as people churn out. This is
 *  a headcount-ratio snapshot, not per-person cohort tracking across time —
 *  the subscription model is too new for a full acquisition-month matrix to
 *  carry enough data yet. Every bucket drills down into its roster. */
export default function TenureRetentionFunnel({ buckets }: Props) {
  const [showExplorers, setShowExplorers] = useState(false);
  const [monthDrill, setMonthDrill] = useState<{ month: number; label: string } | null>(null);
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
            {PLAN_LABEL[p]}
          </span>
        ))}
      </div>

      {buckets.map((b, i) => {
        const widthPct = Math.max(b.count > 0 ? 4 : 0, Math.round((b.count / maxCount) * 100));
        // buckets[0] is always "Explorer"; buckets[1..5] are Month 1..5+ (1-based month index = i).
        const isExplorer = i === 0;
        const monthIndex = i; // i=1 -> Month 1 ... i=5 -> Month 5+
        const onClick = isExplorer ? () => setShowExplorers(true) : () => setMonthDrill({ month: monthIndex, label: b.label });
        return (
          <div
            key={b.label}
            className="d-flex align-items-center gap-3 my-2"
            style={{ fontSize: 13, cursor: 'pointer' }}
            onClick={onClick}
            role="button"
            title={`View all ${b.count} in ${b.label}`}
          >
            <span style={{ width: 84, color: 'var(--red-600, #c0392b)', textDecoration: 'underline' }}>
              {b.label}
            </span>
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
                      title={`${PLAN_LABEL[p]}: ${b.byPlan[p]}`}
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

      {showExplorers && <ExplorerRosterModal onClose={() => setShowExplorers(false)} />}
      {monthDrill && (
        <MemberRosterModal
          monthIndex={monthDrill.month}
          bucketLabel={monthDrill.label}
          onClose={() => setMonthDrill(null)}
        />
      )}
    </SectionCard>
  );
}
