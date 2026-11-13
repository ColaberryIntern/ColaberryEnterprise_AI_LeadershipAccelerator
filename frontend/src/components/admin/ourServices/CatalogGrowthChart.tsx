import React from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState } from '../shell';
import type { GrowthPoint } from '../../../services/ourServicesApi';
import { quarterLabel } from './ourServicesModel';

/**
 * CatalogGrowthChart - services (line) and confirmed case-study links (bars), cumulative per quarter. The series
 * comes from real timestamps on the server (`service_offerings.created_at`, `case_study_service_links.decided_at`);
 * nothing is back-filled.
 */
interface Props { series: GrowthPoint[] }

export default function CatalogGrowthChart({ series }: Props): React.ReactElement {
  if (!series.length) return <EmptyState icon="line-chart-line" tone="quiet" title="No history yet." description="Growth appears after the first service is added." />;
  const data = series.map((p) => ({ q: quarterLabel(p.quarter), services: p.servicesTotal, links: p.linksTotal }));
  const last = data[data.length - 1];
  const summary = `Catalog growth by quarter, ${data[0].q} to ${last.q}. Now ${last.services} services and ${last.links} confirmed case-study links.`;
  return (
    <div role="img" aria-label={summary} style={{ width: '100%', height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
          <XAxis dataKey="q" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
          <Tooltip />
          <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="links" name="Linked case studies" fill="var(--red-100)" radius={[3, 3, 0, 0]} />
          <Line dataKey="services" name="Services" stroke="var(--red-500)" strokeWidth={2} dot={{ r: 3, fill: 'var(--red-500)' }} type="monotone" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
