import React from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState } from '../shell';
import type { EvidenceService } from '../../../services/ourServicesApi';
import { SOURCE_FILL, confirmedCount } from './ourServicesModel';

/**
 * ServiceEvidenceBarChart - confirmed case studies per service, stacked Inside vs Outside, WEAKEST FIRST so the
 * gaps sit at the top. A service with no proof gets its label in the danger color. Confirmed links only.
 */
interface Props { services: EvidenceService[] }

const shorten = (s: string): string => (s.length > 32 ? `${s.slice(0, 30)}…` : s);

/** PURE: weakest first (score, then total proof, then name). */
export function weakestFirst(services: EvidenceService[]): EvidenceService[] {
  return [...services].sort((a, b) => a.evidenceScore - b.evidenceScore || confirmedCount(a) - confirmedCount(b) || a.name.localeCompare(b.name));
}

interface TickProps { x?: number; y?: number; payload?: { value: string; index: number } }

export default function ServiceEvidenceBarChart({ services }: Props): React.ReactElement {
  const sorted = weakestFirst(services);
  const total = sorted.reduce((a, s) => a + confirmedCount(s), 0);
  if (!sorted.length) {
    return <EmptyState icon="bar-chart-horizontal-line" tone="quiet" title="No services yet." description="Add a service to start tracking its evidence." />;
  }
  if (total === 0) {
    return <EmptyState icon="bar-chart-horizontal-line" tone="quiet" title="No confirmed case studies yet. Link one from Intake." description={`${sorted.length} service${sorted.length === 1 ? ' has' : 's have'} no confirmed proof.`} />;
  }
  const data = sorted.map((s) => ({ name: s.name, label: shorten(s.name), inside: s.insideCount, outside: s.outsideCount, zero: confirmedCount(s) === 0 }));
  const height = Math.max(260, data.length * 28 + 60);
  const Tick = ({ x = 0, y = 0, payload }: TickProps): React.ReactElement => {
    const row = payload ? data[payload.index] : undefined;
    return (
      <text x={x} y={y} dy={4} textAnchor="end" fontSize={11} fill={row?.zero ? 'var(--status-danger)' : 'var(--text-muted)'}>
        {payload?.value}
      </text>
    );
  };
  const summary = `Confirmed case studies per service, weakest first. ${data.filter((d) => d.zero).length} of ${data.length} services have none.`;
  return (
    <figure className="mb-0">
      <div role="img" aria-label={summary} style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid horizontal={false} stroke="var(--border-subtle)" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
            <YAxis type="category" dataKey="label" width={200} tick={<Tick />} interval={0} />
            <Tooltip formatter={(v: unknown, n: unknown) => [String(v), String(n)]} labelFormatter={(_l: unknown, p: ReadonlyArray<{ payload?: { name?: string } }>) => p?.[0]?.payload?.name ?? ''} />
            <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="inside" name="Inside" stackId="p" fill={SOURCE_FILL.inside} radius={[3, 0, 0, 3]} />
            <Bar dataKey="outside" name="Outside (Drive)" stackId="p" fill={SOURCE_FILL.outside} fillOpacity={0.75} radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="visually-hidden">
        <ul>{data.map((d) => <li key={d.name}>{d.name}: {d.inside} inside, {d.outside} outside</li>)}</ul>
      </figcaption>
    </figure>
  );
}
