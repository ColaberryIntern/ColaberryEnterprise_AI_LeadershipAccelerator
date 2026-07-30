import React from 'react';
import { SectionCard } from '../shell';
import { PlanBreakdownRow } from '../../../services/subscriptionAnalyticsApi';
import { money, PLAN_COLOR } from './format';

interface Props {
  rows: PlanBreakdownRow[];
}

/** How many subscribers are on each plan, by current headcount + dollar
 *  contribution — recurring $/mo for Annual/Monthly, one-time $ held for
 *  Deposit Holders (not recurring revenue), $0 for Free Access/Other. */
export default function PlanBreakdownCard({ rows }: Props) {
  const total = rows.reduce((s, r) => s + r.count, 0) || 1;
  return (
    <SectionCard title="Subscribers by plan" icon="vip-crown-2-line">
      {rows.map((r) => (
        <div key={r.plan} className="d-flex align-items-center gap-3 my-2" style={{ fontSize: 13 }}>
          <span style={{ width: 108, color: 'var(--bs-secondary-color)' }}>{r.label}</span>
          <span
            className="flex-grow-1"
            style={{ height: 9, borderRadius: 6, background: 'var(--bs-tertiary-bg)', overflow: 'hidden' }}
            title={`${r.count} ${r.label}`}
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
          <span className="text-nowrap text-end" style={{ width: 140, fontVariantNumeric: 'tabular-nums' }}>
            <span className="fw-semibold">{r.count}</span>
            {r.plan === 'annual' || r.plan === 'monthly' ? (
              <span className="text-muted"> · {money(r.amount)}/mo</span>
            ) : r.plan === 'deposit_holder' ? (
              <span className="text-muted"> · {money(r.amount)} held</span>
            ) : null}
          </span>
        </div>
      ))}
    </SectionCard>
  );
}
