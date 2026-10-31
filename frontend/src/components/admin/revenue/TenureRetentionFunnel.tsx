import React, { useState } from 'react';
import { SectionCard } from '../shell';
import { TenureBucket, SubscriptionPlanKey } from '../../../services/subscriptionAnalyticsApi';
import { PLAN_COLOR, PLAN_LABEL } from './format';
import ExplorerRosterModal from './ExplorerRosterModal';
import MemberRosterModal from './MemberRosterModal';
import { getTenureBucketRoster } from '../../../services/subscriptionAnalyticsApi';

const ORDINAL: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' };

interface Props {
  buckets: TenureBucket[];
}

// Only plans that actually accrue tenure appear in the funnel's bars/legend —
// deposit_holder/other never get a tenure anchor (see backend), so they'd
// always render as an empty, meaningless legend entry.
const PLAN_ORDER: SubscriptionPlanKey[] = ['annual', 'monthly', 'comp'];

const monthSubtitle = (month: number): string =>
  `Subscribers currently in their ${month === 5 ? '5th month or later' : `${ORDINAL[month]} month`}, sorted by next payment date.`;

/** Tenure funnel — a snapshot heatmap of how many current subscribers are how
 *  many months into their subscription, split by plan, with a ratio against the
 *  bucket above. Explorer (free trial, no subscription yet) sits at the top.
 *  Clicking a bucket's label/track drills into everyone in that month; clicking
 *  one of its colored plan segments narrows further to just that plan.
 *
 *  ── THE RATIO IS NOT RETENTION ─────────────────────────────────────────────
 *
 *  The caption used to read "how many carry over from the bucket above", which
 *  describes retention — and the page was rendering 114% and 213% under it.
 *  Retention above 100% is impossible, so the copy was making a promise the
 *  number could not keep.
 *
 *  The number itself is fine. It compares two buckets AS THEY STAND TODAY, and
 *  those buckets hold different cohorts, so a later month holding more members
 *  than an earlier one is ordinary rather than anomalous. Nothing here tracks a
 *  person across time; the subscription model is too new for an acquisition-month
 *  matrix to carry enough data yet.
 *
 *  So the fix is copy plus the field name behind it (`retentionPct` ->
 *  `snapshotRatioPct`), not arithmetic. The old name is what the caption was
 *  written against, and leaving it would invite the same sentence back. */
export default function TenureRetentionFunnel({ buckets }: Props) {
  const [showExplorers, setShowExplorers] = useState(false);
  const [monthDrill, setMonthDrill] = useState<{ month: number; label: string } | null>(null);
  const [segmentDrill, setSegmentDrill] = useState<{ month: number; plan: SubscriptionPlanKey; label: string } | null>(null);
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <SectionCard
      title="Subscriber tenure"
      subtitle="How many months in each subscriber is. The % compares a bucket with the one above it today — a snapshot across different cohorts, not retention, so it can exceed 100%."
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
        const onRowClick = isExplorer ? () => setShowExplorers(true) : () => setMonthDrill({ month: monthIndex, label: b.label });
        return (
          <div
            key={b.label}
            className="d-flex align-items-center gap-3 my-2"
            style={{ fontSize: 13, cursor: 'pointer' }}
            onClick={onRowClick}
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
                      onClick={
                        isExplorer
                          ? undefined
                          : (e) => {
                              e.stopPropagation();
                              setSegmentDrill({ month: monthIndex, plan: p, label: `${PLAN_LABEL[p]} · ${b.label}` });
                            }
                      }
                      style={{
                        display: 'block',
                        height: '100%',
                        flex: b.byPlan[p],
                        background: PLAN_COLOR[p],
                        borderRadius: 4,
                      }}
                      title={`${PLAN_LABEL[p]}: ${b.byPlan[p]} — click to filter to just ${PLAN_LABEL[p]}`}
                    />
                  ))}
                </span>
              )}
            </span>
            <span className="text-nowrap text-end" style={{ width: 108, fontVariantNumeric: 'tabular-nums' }}>
              <span className="fw-semibold">{b.count}</span>
              {b.snapshotRatioPct !== null && (
                <span
                  className="text-muted"
                  // Names the bucket being compared against, so the number reads as the
                  // comparison it is. Without this the figure floats free and the nearest
                  // available meaning is "retention".
                  title={`${b.snapshotRatioPct}% of ${buckets[i - 1]?.label ?? 'the bucket above'}'s headcount, measured today. A comparison between two different groups of people — not retention, which is why it can exceed 100%.`}
                >
                  {' '}
                  ({b.snapshotRatioPct}%)
                </span>
              )}
            </span>
          </div>
        );
      })}

      {showExplorers && <ExplorerRosterModal onClose={() => setShowExplorers(false)} />}
      {monthDrill && (
        <MemberRosterModal
          title={monthDrill.label}
          subtitle={monthSubtitle(monthDrill.month)}
          fetcher={() => getTenureBucketRoster(monthDrill.month)}
          onClose={() => setMonthDrill(null)}
        />
      )}
      {segmentDrill && (
        <MemberRosterModal
          title={segmentDrill.label}
          subtitle={`${PLAN_LABEL[segmentDrill.plan]} subscribers only, within this tenure month, sorted by next payment date.`}
          fetcher={async () => {
            const monthRoster = await getTenureBucketRoster(segmentDrill.month);
            return monthRoster.filter((r) => r.plan === segmentDrill.plan);
          }}
          onClose={() => setSegmentDrill(null)}
        />
      )}
    </SectionCard>
  );
}
