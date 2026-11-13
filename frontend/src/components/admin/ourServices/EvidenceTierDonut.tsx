import React from 'react';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { EmptyState } from '../shell';
import type { EvidenceService, EvidenceTier } from '../../../services/ourServicesApi';
import { TIER_META, TIER_ORDER, TIER_RANGE } from './ourServicesModel';

/** EvidenceTierDonut - "Evidence health": services grouped by the server's evidence tier. */
interface Props { services: EvidenceService[] }

/** PURE: count per tier, in display order. */
export function tierCounts(services: EvidenceService[]): Array<{ tier: EvidenceTier; count: number }> {
  return TIER_ORDER.map((tier) => ({ tier, count: services.filter((s) => s.evidenceTier === tier).length }));
}

export default function EvidenceTierDonut({ services }: Props): React.ReactElement {
  if (!services.length) return <EmptyState icon="donut-chart-line" tone="quiet" title="No services yet." description="Tiers appear once the catalog has a service." />;
  const counts = tierCounts(services);
  const data = counts.filter((c) => c.count > 0).map((c) => ({ name: `${TIER_META[c.tier].label} (${TIER_RANGE[c.tier]})`, value: c.count, tier: c.tier }));
  const summary = `Services by evidence tier: ${counts.map((c) => `${TIER_META[c.tier].label} ${c.count}`).join(', ')}.`;
  return (
    <div role="img" aria-label={summary} style={{ width: '100%', height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="88%" stroke="var(--surface-card)" strokeWidth={2} isAnimationActive={false}>
            {data.map((d) => <Cell key={d.tier} fill={TIER_META[d.tier].fill} />)}
          </Pie>
          <Tooltip />
          <Legend layout="vertical" align="right" verticalAlign="middle" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
