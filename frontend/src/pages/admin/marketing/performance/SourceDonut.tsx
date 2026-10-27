import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { FunnelCampaignRow } from '../acquisitionFunnelApi';
import { formatCount, formatPct, rate, signupsBySource } from './performanceMetrics';

/**
 * Signups by source, as a donut with the total in the middle.
 *
 * RECHARTS, NOT d3. The reference implementation drew this with `d3.arc`/`d3.pie`, but the only d3
 * package installed here is `d3-force`; `d3-shape` would be a new dependency for one chart. This
 * page ALREADY renders a recharts FunnelChart on its Revenue tab, so recharts is both present and
 * the established convention - `JourneySankeyChart.tsx` records the same reasoning.
 *
 * THE AGGREGATION HAPPENS BEFORE THIS COMPONENT. `signupsBySource` folds the endpoint's
 * (source, campaign) rows into one slice per source; see the note there for why a pie fed the raw
 * rows draws several same-coloured slices for one source.
 */

const SERIES = [1, 2, 3, 4, 5, 6, 7, 8];

function seriesColor(i: number): string {
  return `var(--chart-${SERIES[i % SERIES.length]})`;
}

export default function SourceDonut({
  campaigns, loading, error,
}: {
  campaigns: FunnelCampaignRow[];
  loading?: boolean;
  error?: boolean;
}) {
  const slices = signupsBySource(campaigns);
  const total = slices.reduce((sum, s) => sum + s.signups, 0);

  if (error) {
    return <div className="mp-fail" data-testid="funnel-donut-error">Failed to load</div>;
  }

  if (loading && slices.length === 0) {
    return (
      <div className="mp-dn">
        <div className="mp-dn__chart">
          {/* A ring-shaped placeholder, so the card does not change size when the chart lands. */}
          <div
            className="mp-skeleton"
            style={{ width: '100%', height: '100%', borderRadius: '50%' }}
          />
        </div>
      </div>
    );
  }

  if (slices.length === 0) {
    return (
      <div className="mp-fail" data-testid="funnel-donut-empty">
        No signups carried a source in this window
      </div>
    );
  }

  return (
    <div className="mp-dn">
      <div className="mp-dn__chart">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="signups"
              nameKey="label"
              innerRadius="62%"
              outerRadius="96%"
              paddingAngle={1}
              cornerRadius={3}
              // Slice order follows `slices`, which `signupsBySource` already sorted biggest
              // first - so the ring and the legend below read in the same order.
              isAnimationActive={false}
              stroke="none"
            >
              {slices.map((slice, i) => (
                <Cell key={slice.label + String(slice.source)} fill={seriesColor(i)} />
              ))}
            </Pie>
            <Tooltip
              // Parameter types are left to inference on purpose: recharts' `Formatter` generics
              // are what they are, and annotating them by hand is how the signature silently
              // stops matching on the next minor release.
              formatter={(value, name) => {
                const n = Number(value);
                return [`${formatCount(n)} (${formatPct(rate(n, total))})`, String(name)];
              }}
              contentStyle={{
                background: 'var(--surface-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 10,
                fontSize: '0.75rem',
                color: 'var(--text-body)',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="mp-dn__center">
          <span className="mp-dn__total">{formatCount(total)}</span>
          <span className="mp-dn__totalLabel">signups</span>
        </div>
      </div>
      <ul className="mp-dn__legend">
        {slices.map((slice, i) => (
          <li key={slice.label + String(slice.source)} data-testid="funnel-donut-legend-row">
            <span className="mp-dn__swatch" style={{ background: seriesColor(i) }} />
            <span>
              {slice.label} {'·'} {formatCount(slice.signups)}{' '}
              ({formatPct(rate(slice.signups, total), 0)})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
