import React from 'react';
import { SectionCard } from '../shell';
import { PlanBreakdownRow } from '../../../services/subscriptionAnalyticsApi';
import { money } from './format';

interface Props {
  rows: PlanBreakdownRow[];
}

// Fixed categorical order/color per plan — never reassigned by rank or filter
// state, matching the same green/blue split the "Collected by type" section
// below already uses for its two categories.
const PLAN_COLOR: Record<string, string> = {
  annual: '#15803d',
  monthly: '#1f5fd0',
  comp: 'var(--text-muted)',
};

/** How many subscribers are on each plan, by current active headcount + $/mo
 *  contribution. Same bar-list visual as "Collected by type" further down, but
 *  grouped by plan instead of by transaction type. */
export default function PlanBreakdownCard({ rows }: Props) {
  const total = rows.reduce((s, r) => s + r.count, 0) || 1;
  return (
    <SectionCard title="Subscribers by plan" icon="vip-crown-2-line">
      {rows.map((r) => (
        <div key={r.plan} className="d-flex align-items-center gap-3 my-2" style={{ fontSize: 13 }}>
          <span style={{ width: 96, color: 'var(--bs-secondary-color)' }}>{r.label}</span>
          <span
            className="flex-grow-1"
            style={{ height: 9, borderRadius: 6, background: 'var(--bs-tertiary-bg)', overflow: 'hidden' }}
            title={`${r.count} on ${r.label}`}
          >
            <span
              style={{
                display: 'block',
                height: '100%',
                width: `${Math.max(2, Math.round((r.count / total) * 100))}%`,
                background: PLAN_COLOR[r.plan],
                borderRadius: 6,
              }}
            ></span>
          </span>
          <span className="text-nowrap text-end" style={{ width: 132, fontVariantNumeric: 'tabular-nums' }}>
            <span className="fw-semibold">{r.count}</span>
            <span className="text-muted"> · {money(r.amount)}/mo</span>
          </span>
        </div>
      ))}
    </SectionCard>
  );
}
