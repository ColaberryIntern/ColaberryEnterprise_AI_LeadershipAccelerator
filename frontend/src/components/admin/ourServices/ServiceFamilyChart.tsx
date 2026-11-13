import React from 'react';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { EmptyState } from '../shell';
import type { EvidenceService } from '../../../services/ourServicesApi';

/**
 * ServiceFamilyChart - "Proof by service family": distinct confirmed case studies per service `category`.
 * A case study linked to two services in one family counts once for that family. A service with no category is
 * grouped under "Uncategorized".
 */
interface Props { services: EvidenceService[] }

const PALETTE = ['var(--chart-5)', 'var(--chart-1)', 'var(--chart-6)', 'var(--chart-4)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-7)', 'var(--chart-8)'];

/** PURE: families sorted by proof (desc), then name. */
export function familyProof(services: EvidenceService[]): Array<{ family: string; caseStudies: number; services: number }> {
  const fam = new Map<string, { ids: Set<string>; services: number }>();
  for (const s of services) {
    const key = s.category?.trim() || 'Uncategorized';
    const cur = fam.get(key) ?? { ids: new Set<string>(), services: 0 };
    cur.services += 1;
    for (const c of s.caseStudies) cur.ids.add(c.id);
    fam.set(key, cur);
  }
  return [...fam.entries()]
    .map(([family, v]) => ({ family, caseStudies: v.ids.size, services: v.services }))
    .sort((a, b) => b.caseStudies - a.caseStudies || a.family.localeCompare(b.family));
}

export default function ServiceFamilyChart({ services }: Props): React.ReactElement {
  const fams = familyProof(services);
  const total = fams.reduce((a, f) => a + f.caseStudies, 0);
  if (!fams.length) return <EmptyState icon="pie-chart-line" tone="quiet" title="No services yet." />;
  if (total === 0) return <EmptyState icon="pie-chart-line" tone="quiet" title="No confirmed case studies yet. Link one from Intake." description={`${fams.length} famil${fams.length === 1 ? 'y has' : 'ies have'} no proof.`} />;
  const data = fams.filter((f) => f.caseStudies > 0);
  const summary = `Confirmed case studies per service family: ${fams.map((f) => `${f.family} ${f.caseStudies}`).join(', ')}.`;
  return (
    <div role="img" aria-label={summary} style={{ width: '100%', height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="caseStudies" nameKey="family" outerRadius="88%" stroke="var(--surface-card)" strokeWidth={2} isAnimationActive={false}>
            {data.map((d, i) => <Cell key={d.family} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.8} />)}
          </Pie>
          <Tooltip />
          <Legend layout="vertical" align="right" verticalAlign="middle" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
