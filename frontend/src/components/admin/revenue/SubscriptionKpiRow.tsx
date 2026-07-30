import React from 'react';
import { StatCard } from '../shell';
import { SubscriptionKpis } from '../../../services/subscriptionAnalyticsApi';
import { money } from './format';

interface Props {
  kpis: SubscriptionKpis;
}

/** MRR / ARR / active-subscriber headcount / ARPU — the recurring-revenue lens,
 *  distinct from the cash-reconciliation stat cards further down the page. */
export default function SubscriptionKpiRow({ kpis }: Props) {
  return (
    <div className="row g-3 mb-3">
      <div className="col-6 col-lg-3">
        <StatCard label="MRR" value={money(kpis.mrr)} icon="line-chart-line" tone="primary" hint="Monthly recurring revenue" />
      </div>
      <div className="col-6 col-lg-3">
        <StatCard label="ARR" value={money(kpis.arr)} icon="calendar-2-line" tone="primary" hint="MRR × 12" />
      </div>
      <div className="col-6 col-lg-3">
        <StatCard
          label="Active subscribers"
          value={kpis.activeSubscribers}
          icon="group-line"
          tone="success"
          hint={[
            kpis.compedSeats > 0 ? `+${kpis.compedSeats} comped` : null,
            kpis.otherPaidCount > 0 ? `+${kpis.otherPaidCount} other-paid` : null,
          ].filter(Boolean).join(' · ') || 'Paying, not comped'}
        />
      </div>
      <div className="col-6 col-lg-3">
        <StatCard label="ARPU" value={money(kpis.arpu)} icon="user-star-line" tone="info" hint="Avg. revenue per subscriber / mo" />
      </div>
    </div>
  );
}
