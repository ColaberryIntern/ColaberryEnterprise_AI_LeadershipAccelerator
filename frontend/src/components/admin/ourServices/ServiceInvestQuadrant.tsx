import React from 'react';
import { CartesianGrid, Cell, ReferenceArea, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { EmptyState } from '../shell';
import type { EvidenceService, EvidenceSummary } from '../../../services/ourServicesApi';
import { confirmedCount, demandSplit } from './ourServicesModel';

/**
 * ServiceInvestQuadrant - "Where to invest next". X = evidence score, Y = open Gov opportunities that match,
 * bubble size = confirmed case studies. The four quadrants are ReferenceAreas split at score 50 and at the median
 * known open-match count.
 *
 * HIDDEN when matches are unknown: if the live opportunity feed could not be read, every service's match count is
 * null and plotting them at 0 would be a lie, so the card explains instead.
 */
interface Props { services: EvidenceService[]; feed: EvidenceSummary['opportunityFeed'] }

export type Quadrant = 'build' | 'bid' | 'proven' | 'low';
export const QUADRANT_META: Record<Quadrant, { label: string; fill: string; dot: string }> = {
  build: { label: '🎯 Build evidence now', fill: 'var(--status-danger-bg)', dot: 'var(--status-danger)' },
  bid: { label: '🏆 Bid with confidence', fill: 'var(--status-success-bg)', dot: 'var(--status-success)' },
  proven: { label: '📣 Proven: find more bids', fill: 'var(--status-info-bg)', dot: 'var(--status-info)' },
  low: { label: '💤 Low priority', fill: 'var(--surface-subtle)', dot: 'var(--text-subtle)' },
};
export const SCORE_SPLIT = 50;

/** PURE: which quadrant a point falls in. */
export function quadrantOf(score: number, matches: number, ySplit: number): Quadrant {
  const high = matches >= ySplit;
  if (score < SCORE_SPLIT) return high ? 'build' : 'low';
  return high ? 'bid' : 'proven';
}

export default function ServiceInvestQuadrant({ services, feed }: Props): React.ReactElement {
  const known = services.filter((s) => s.openOpportunityMatches != null);
  if (feed.source !== 'live' || !known.length) {
    return (
      <EmptyState icon="focus-3-line" tone="quiet" title="Open opportunity matches are not available right now."
        description={feed.source === 'snapshot'
          ? 'Only the curated snapshot of opportunities could be read, so demand per service is unknown. The chart returns when the live feed answers.'
          : 'The opportunity feed could not be read, so demand per service is unknown. Nothing is plotted rather than guessing 0.'} />
    );
  }
  const ySplit = demandSplit(known);
  const yMax = Math.max(ySplit * 2, ...known.map((s) => s.openOpportunityMatches ?? 0)) + 1;
  const data = known.map((s) => {
    const y = s.openOpportunityMatches ?? 0;
    return { name: s.name, x: s.evidenceScore, y, z: confirmedCount(s), q: quadrantOf(s.evidenceScore, y, ySplit) };
  });
  const counts = data.reduce<Record<Quadrant, number>>((a, d) => ({ ...a, [d.q]: a[d.q] + 1 }), { build: 0, bid: 0, proven: 0, low: 0 });
  const summary = `Evidence score against open matching opportunities. Build evidence now: ${counts.build}. Bid with confidence: ${counts.bid}. Proven, find more bids: ${counts.proven}. Low priority: ${counts.low}.`;
  const area = (q: Quadrant, x1: number, x2: number, y1: number, y2: number): React.ReactElement => (
    <ReferenceArea key={q} x1={x1} x2={x2} y1={y1} y2={y2} fill={QUADRANT_META[q].fill} fillOpacity={1} stroke="none" ifOverflow="hidden"
      label={{ value: QUADRANT_META[q].label, position: 'insideTopLeft', fontSize: 11, fill: 'var(--text-muted)' }} />
  );
  return (
    <figure className="mb-0">
      <div role="img" aria-label={summary} style={{ width: '100%', height: 400 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
            {area('build', 0, SCORE_SPLIT, ySplit, yMax)}
            {area('bid', SCORE_SPLIT, 100, ySplit, yMax)}
            {area('low', 0, SCORE_SPLIT, 0, ySplit)}
            {area('proven', SCORE_SPLIT, 100, 0, ySplit)}
            <CartesianGrid stroke="var(--border-subtle)" />
            <XAxis type="number" dataKey="x" domain={[0, 100]} name="Evidence score" tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              label={{ value: 'Evidence score →', position: 'insideBottom', offset: -12, fontSize: 12, fill: 'var(--text-muted)' }} />
            <YAxis type="number" dataKey="y" domain={[0, yMax]} allowDecimals={false} name="Open matches" tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              label={{ value: 'Matching open Gov opportunities →', angle: -90, position: 'insideLeft', fontSize: 12, fill: 'var(--text-muted)', style: { textAnchor: 'middle' } }} />
            <ZAxis type="number" dataKey="z" range={[60, 600]} name="Case studies" />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(v: unknown, n: unknown) => [String(v), String(n)]} />
            <Scatter data={data} name="Services">
              {data.map((d) => <Cell key={d.name} fill={QUADRANT_META[d.q].dot} fillOpacity={0.8} stroke="var(--surface-card)" />)}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="visually-hidden">
        <ul>{data.map((d) => <li key={d.name}>{d.name}: evidence {d.x}, {d.y} open matches, {d.z} case studies ({QUADRANT_META[d.q].label})</li>)}</ul>
      </figcaption>
    </figure>
  );
}
