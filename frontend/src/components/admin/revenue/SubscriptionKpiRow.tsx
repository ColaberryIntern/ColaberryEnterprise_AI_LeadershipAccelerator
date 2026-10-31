import React from 'react';
import { StatCard } from '../shell';
import { SubscriptionKpis } from '../../../services/subscriptionAnalyticsApi';
import { money } from './format';

interface Props {
  kpis: SubscriptionKpis;
}

/** MRR / ARR / active-subscriber headcount / ARPU — the recurring-revenue lens,
 *  distinct from the cash-reconciliation stat cards further down the page.
 *
 *  ── WHY EVERY TILE CARRIES THE LAPSED CAVEAT ───────────────────────────────
 *
 *  MRR includes members whose paid period has ended and who have not renewed
 *  (renewal is a manual checkout here, not an auto-charge — see the backend's
 *  note). ARR, ARPU and the headcount are all derived from that same set, so
 *  the overstatement propagates into all four. Showing it on MRR alone would
 *  leave ARR — the figure most likely to be quoted — looking clean.
 *
 *  The VALUES are unchanged on purpose: no number moves under someone who has
 *  been reading this page. The caveat is what was missing. */
export default function SubscriptionKpiRow({ kpis }: Props) {
  const lapsed = kpis.lapsedSubscribers > 0;
  const who = `${kpis.lapsedSubscribers} lapsed`;

  return (
    <div className="row g-3 mb-3">
      <div className="col-6 col-lg-3">
        <StatCard
          label="MRR"
          value={money(kpis.mrr)}
          icon="line-chart-line"
          tone={lapsed ? 'warning' : 'primary'}
          hint={
            lapsed
              ? `${money(kpis.collectibleMrr)} collectible · ${money(kpis.lapsedMrr)} from ${who}`
              : 'Monthly recurring revenue'
          }
        />
      </div>
      <div className="col-6 col-lg-3">
        <StatCard
          label="ARR"
          value={money(kpis.arr)}
          icon="calendar-2-line"
          tone={lapsed ? 'warning' : 'primary'}
          hint={lapsed ? `MRR × 12 · incl. ${money(kpis.lapsedMrr * 12)} lapsed` : 'MRR × 12'}
        />
      </div>
      <div className="col-6 col-lg-3">
        <StatCard
          label="Active subscribers"
          value={kpis.activeSubscribers}
          icon="group-line"
          tone={lapsed ? 'warning' : 'success'}
          hint={[
            lapsed ? `${who}` : null,
            kpis.compedSeats > 0 ? `+${kpis.compedSeats} comped` : null,
            kpis.otherPaidCount > 0 ? `+${kpis.otherPaidCount} other-paid` : null,
          ].filter(Boolean).join(' · ') || 'Paying, not comped'}
        />
      </div>
      <div className="col-6 col-lg-3">
        <StatCard
          label="ARPU"
          value={money(kpis.arpu)}
          icon="user-star-line"
          tone="info"
          hint={lapsed ? `Avg. per subscriber / mo · incl. ${who}` : 'Avg. revenue per subscriber / mo'}
        />
      </div>
    </div>
  );
}
