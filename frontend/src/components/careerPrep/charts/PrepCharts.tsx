import React, { useState } from 'react';

/**
 * Career Prep v27 (CP3.5, shot L3-7): the charts on Your progress, as plain SVG ported from the design prototype's
 * lineChart / barChart. Single series in the accent color only (status colors are never used for a series), a
 * <title> tooltip on hover, a readout line that shows the focused point's value for keyboard users, and a "Show as
 * table" toggle with the same data (the accessible text alternative).
 */
export interface Point { label: string; value: number }

function ChartFrame({ title, points, unit, focused, children }: { title: string; points: Point[]; unit: string; focused: Point | null; children: React.ReactNode }): React.ReactElement {
  const [table, setTable] = useState(false);
  return (
    <figure className="cp-chart">
      {table ? (
        <table className="cp-table"><caption className="visually-hidden">{title}</caption><thead><tr><th scope="col">Week</th><th scope="col">{unit}</th></tr></thead>
          <tbody>{points.map((p) => <tr key={p.label}><td>{p.label}</td><td>{p.value}</td></tr>)}</tbody></table>
      ) : (
        <>
          {children}
          <p className="cp-readout" aria-live="polite" data-testid="cp-chart-readout">{focused ? `${focused.label}: ${focused.value} ${unit.toLowerCase()}` : ''}</p>
        </>
      )}
      <figcaption><span className="visually-hidden">{title}</span><button type="button" className="cp-linkbtn" onClick={() => setTable(!table)} aria-pressed={table}>{table ? 'Show as chart' : 'Show as table'}</button></figcaption>
    </figure>
  );
}

const W = 560;

/** The y range: whole tens around the values and the target, so a 52-to-69 climb is not flattened against 0-100. */
export function yRange(values: number[], target?: number): [number, number] {
  const all = target !== undefined ? [...values, target] : values;
  const lo = Math.max(0, Math.floor((Math.min(...all) - 5) / 10) * 10);
  const hi = Math.min(100, Math.ceil((Math.max(...all) + 5) / 10) * 10);
  return hi - lo < 20 ? [Math.max(0, hi - 20), Math.max(hi, 20)] : [lo, hi];
}

/** Readiness by week, with an optional dashed "ready" line. */
export function LineTrend({ points, target, title }: { points: Point[]; target?: number; title: string }): React.ReactElement {
  const [focused, setFocused] = useState<Point | null>(null);
  const H = 130;
  const P = 26;
  const [min, max] = yRange(points.map((p) => p.value), target);
  const x = (i: number) => P + (points.length < 2 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (points.length - 1));
  const y = (v: number) => H - 18 - ((v - min) / (max - min)) * (H - 34);
  const grid: number[] = [];
  for (let g = min; g <= max; g += 10) grid.push(g);
  const last = points.length - 1;
  return (
    <ChartFrame title={title} points={points} unit="Readiness" focused={focused}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${points.map((p) => `${p.label} ${p.value}`).join(', ')}${target !== undefined ? `; ready at ${target}` : ''}`} className="cp-svg" data-testid="cp-trend-svg">
        {grid.map((g) => <g key={g}><line className="cp-grid" x1={P} x2={W - P} y1={y(g)} y2={y(g)} /><text className="cp-ax" x={0} y={y(g) + 3}>{g}</text></g>)}
        {target !== undefined && (
          <g><line x1={P} x2={W - P} y1={y(target)} y2={y(target)} className="cp-ready" strokeDasharray="3 3" />
            <text className="cp-ax" x={W - P} y={y(target) - 4} textAnchor="end">{target} · ready</text></g>
        )}
        {points.length > 1 && <polyline points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} className="cp-series" fill="none" />}
        {points.map((p, i) => (
          <circle key={p.label} cx={x(i)} cy={y(p.value)} r={i === last ? 5 : 3.5} className={`cp-dotpt${i === last ? '' : ' is-past'}`} tabIndex={0} onFocus={() => setFocused(p)} onBlur={() => setFocused(null)}>
            <title>{`Week of ${p.label}: ${p.value}`}</title>
          </circle>
        ))}
        {points.length > 0 && <text className="cp-ax" x={x(0)} y={H - 2} textAnchor={points.length > 1 ? 'start' : 'middle'}>{points[0].label}</text>}
        {points.length > 1 && <text className="cp-ax" x={x(last)} y={H - 2} textAnchor="end">{points[last].label}</text>}
      </svg>
    </ChartFrame>
  );
}

/** Minutes practiced per week; this week full strength, earlier weeks lighter, a zero week a thin gray line. */
export function WeeklyBars({ points, title }: { points: Point[]; title: string }): React.ReactElement {
  const [focused, setFocused] = useState<Point | null>(null);
  const H = 120;
  const P = 8;
  const max = Math.max(30, ...points.map((p) => p.value));
  const step = (W - 2 * P) / Math.max(1, points.length);
  const bw = Math.max(4, step - 10);
  const last = points.length - 1;
  return (
    <ChartFrame title={title} points={points} unit="Minutes" focused={focused}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${points.map((p) => `${p.label} ${p.value} minutes`).join(', ')}`} className="cp-svg" data-testid="cp-weekly-svg">
        {points.map((p, i) => {
          const h = (p.value / max) * (H - 28);
          const x = P + i * step + 5;
          if (p.value === 0) return <rect key={p.label} x={x} y={H - 18} width={bw} height={2} className="cp-bar-zero" tabIndex={0} onFocus={() => setFocused(p)} onBlur={() => setFocused(null)}><title>{`Week of ${p.label}: 0 minutes`}</title></rect>;
          return (
            <rect key={p.label} x={x} y={H - 16 - h} width={bw} height={h} rx={4} className={`cp-bar-rect${i === last ? '' : ' is-past'}`} tabIndex={0}
              onFocus={() => setFocused(p)} onBlur={() => setFocused(null)}><title>{`Week of ${p.label}: ${p.value} minutes`}</title></rect>
          );
        })}
        {points.length > 0 && <text className="cp-ax" x={P + 5} y={H - 2}>{points[0].label}</text>}
        {points.length > 1 && <text className="cp-ax" x={P + last * step + 5 + bw} y={H - 2} textAnchor="end">{points[last].label}</text>}
      </svg>
    </ChartFrame>
  );
}

/** A small ring toward a count (the empty readiness: skills scored of the ones readiness needs). */
export function ProgressRing({ have, need, label }: { have: number; need: number; label: string }): React.ReactElement {
  const r = 40;
  const c = 2 * Math.PI * r;
  const f = need ? Math.min(1, have / need) : 0;
  return (
    <svg viewBox="0 0 100 100" className="cp-mini-ring" role="img" aria-label={label} data-testid="cp-progress-ring">
      <circle cx="50" cy="50" r={r} className="bg" fill="none" strokeWidth={10} />
      {f > 0 && <circle cx="50" cy="50" r={r} className="fg" fill="none" strokeWidth={10} strokeDasharray={c} strokeDashoffset={c * (1 - f)} />}
      <text x="50" y="57" textAnchor="middle">{`${have}/${need}`}</text>
    </svg>
  );
}
