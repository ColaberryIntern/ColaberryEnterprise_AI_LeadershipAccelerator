import React, { useState } from 'react';

/**
 * Career Prep v27 (CP3.5): the two small charts on Your progress, as plain SVG (the kit's LineTrend and
 * WeeklyBars live together in this one file). Single series, the accent color only (status colors are never
 * used for series), a <title> tooltip on hover, a readout line that shows the focused point's value for
 * keyboard users, and a "Show as table" toggle with the same data.
 */
export interface Point { label: string; value: number }

function ChartFrame({ title, points, unit, focused, children }: { title: string; points: Point[]; unit: string; focused: Point | null; children: React.ReactNode }): React.ReactElement {
  const [table, setTable] = useState(false);
  return (
    <figure className="cp-chart">
      <figcaption>{title}<button type="button" className="cp-linkbtn" onClick={() => setTable(!table)} aria-pressed={table}>{table ? 'Show as chart' : 'Show as table'}</button></figcaption>
      {table ? (
        <table className="cp-table"><thead><tr><th scope="col">Week</th><th scope="col">{unit}</th></tr></thead>
          <tbody>{points.map((p) => <tr key={p.label}><td>{p.label}</td><td>{p.value}</td></tr>)}</tbody></table>
      ) : (
        <>
          {children}
          <p className="cp-readout" aria-live="polite" data-testid="cp-chart-readout">{focused ? `${focused.label}: ${focused.value} ${unit.toLowerCase()}` : ''}</p>
        </>
      )}
    </figure>
  );
}

const W = 320;
const H = 120;
const PAD = 18;

/** Readiness by week, 0 to 100, with an optional dashed "ready" line. */
export function LineTrend({ points, target, title }: { points: Point[]; target?: number; title: string }): React.ReactElement {
  const [focused, setFocused] = useState<Point | null>(null);
  const x = (i: number) => PAD + (points.length < 2 ? (W - 2 * PAD) / 2 : (i * (W - 2 * PAD)) / (points.length - 1));
  const y = (v: number) => H - PAD - (v / 100) * (H - 2 * PAD);
  return (
    <ChartFrame title={title} points={points} unit="Readiness" focused={focused}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${points.map((p) => `${p.label} ${p.value}`).join(', ')}`} className="cp-svg">
        {target !== undefined && <line x1={PAD} x2={W - PAD} y1={y(target)} y2={y(target)} className="cp-ready" strokeDasharray="4 4" />}
        {points.length > 1 && <polyline points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} className="cp-series" fill="none" />}
        {points.map((p, i) => (
          <circle key={p.label} cx={x(i)} cy={y(p.value)} r={5} className="cp-dotpt" tabIndex={0} onFocus={() => setFocused(p)} onBlur={() => setFocused(null)}>
            <title>{`${p.label}: ${p.value}`}</title>
          </circle>
        ))}
      </svg>
    </ChartFrame>
  );
}

/** Minutes practiced per week. */
export function WeeklyBars({ points, title }: { points: Point[]; title: string }): React.ReactElement {
  const [focused, setFocused] = useState<Point | null>(null);
  const max = Math.max(1, ...points.map((p) => p.value));
  const bw = (W - 2 * PAD) / Math.max(1, points.length);
  return (
    <ChartFrame title={title} points={points} unit="Minutes" focused={focused}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${points.map((p) => `${p.label} ${p.value} minutes`).join(', ')}`} className="cp-svg">
        {points.map((p, i) => {
          const h = (p.value / max) * (H - 2 * PAD);
          return (
            <rect key={p.label} x={PAD + i * bw + 2} y={H - PAD - h} width={Math.max(2, bw - 4)} height={h} className="cp-bar-rect" tabIndex={0}
              onFocus={() => setFocused(p)} onBlur={() => setFocused(null)}><title>{`${p.label}: ${p.value} minutes`}</title></rect>
          );
        })}
      </svg>
    </ChartFrame>
  );
}
