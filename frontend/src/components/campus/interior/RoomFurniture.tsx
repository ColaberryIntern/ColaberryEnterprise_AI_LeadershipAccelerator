import React from 'react';
import { art } from '../art/artColor';
import { P } from './roomModel';
import type { Layout, Spot } from './roomModel';

/** The furniture under the people, ported from the prototype's furnitureSVG: lecture rows, benches with laptops, round tables, desks. */
export function Furniture({ sp }: { sp: Spot; layout: Layout }): React.ReactElement | null {
  if (sp.row !== undefined) {
    const a = P(0.12, sp.row + 0.03), z = P(0.88, sp.row + 0.03), h = 16 * a.s;
    return (
      <g>
        <path d={`M${a.x} ${a.y - h}L${z.x} ${z.y - h}L${z.x} ${z.y + 4 * a.s}L${a.x} ${a.y + 4 * a.s}Z`} fill={art(sp.bench ? 'in-bench' : 'in-row')} />
        <rect x={a.x} y={a.y - h - 4 * a.s} width={z.x - a.x} height={5 * a.s} fill={art(sp.bench ? 'in-bench-top' : 'in-row-top')} />
        {sp.bench && [0.22, 0.46, 0.7].map((u) => { const q = P(u, sp.row! + 0.03); return <rect key={u} x={q.x - 12 * q.s} y={q.y - h - 16 * q.s} width={24 * q.s} height={13 * q.s} rx={2} fill={art('in-laptop')} />; })}
      </g>
    );
  }
  if (sp.table) {
    const q = P(sp.table[0], sp.table[1]);
    return (
      <g>
        <ellipse cx={q.x} cy={q.y - 14 * q.s} rx={44 * q.s} ry={15 * q.s} fill={art('in-table')} stroke={art('in-table-leg')} strokeWidth={2 * q.s} />
        <rect x={q.x - 3 * q.s} y={q.y - 14 * q.s} width={6 * q.s} height={14 * q.s} fill={art('in-table-leg')} />
      </g>
    );
  }
  if (sp.board) {
    const a = P(0.24, 0.46), z = P(0.76, 0.46), c = P(0.78, 0.6), d = P(0.22, 0.6);
    return (
      <g>
        <polygon points={`${a.x},${a.y} ${z.x},${z.y} ${c.x},${c.y} ${d.x},${d.y}`} fill={art('in-board-top')} />
        <polygon points={`${d.x},${d.y} ${c.x},${c.y} ${c.x},${c.y + 10} ${d.x},${d.y + 10}`} fill={art('in-board-side')} />
        {[0.3, 0.42, 0.54, 0.66].map((u) => { const q = P(u, 0.53); return <rect key={u} x={q.x - 9 * q.s} y={q.y - 6 * q.s} width={18 * q.s} height={11 * q.s} rx={1} fill={art('in-board-pc')} />; })}
      </g>
    );
  }
  if (sp.desk && sp.dual) {
    const q = P(sp.u, sp.t + 0.04);
    return (
      <g>
        <rect x={q.x - 30 * q.s} y={q.y - 20 * q.s} width={60 * q.s} height={20 * q.s} fill={art('in-pod')} stroke={art('in-pod-edge')} />
        <rect x={q.x - 27 * q.s} y={q.y - 42 * q.s} width={25 * q.s} height={17 * q.s} rx={2} fill={art('in-monitor')} />
        <rect x={q.x + 2 * q.s} y={q.y - 42 * q.s} width={25 * q.s} height={17 * q.s} rx={2} fill={art('in-monitor')} />
        <rect x={q.x - 24 * q.s} y={q.y - 39 * q.s} width={19 * q.s} height={3 * q.s} fill={art('in-monitor-1')} opacity={0.7} />
        <rect x={q.x + 5 * q.s} y={q.y - 39 * q.s} width={12 * q.s} height={3 * q.s} fill={art('in-monitor-2')} opacity={0.8} />
      </g>
    );
  }
  if (sp.desk) {
    const q = P(sp.u, sp.t + 0.04);
    return (
      <g>
        <rect x={q.x - 28 * q.s} y={q.y - 20 * q.s} width={56 * q.s} height={20 * q.s} fill={art('in-desk')} />
        <rect x={q.x - 14 * q.s} y={q.y - 40 * q.s} width={28 * q.s} height={18 * q.s} rx={2} fill={art('in-laptop')} />
      </g>
    );
  }
  return null;
}

/** One furniture piece per row / table / desk (the prototype's furnSeen), with the floor depth it sorts at. */
export function furniturePieces(all: Spot[]): { key: string; t: number; sp: Spot }[] {
  const seen = new Set<string>();
  const out: { key: string; t: number; sp: Spot }[] = [];
  for (const sp of all) {
    const key = sp.board ? 'board' : sp.row !== undefined ? `r${sp.row}` : sp.table ? `t${sp.table.join(',')}` : sp.desk ? `d${sp.u},${sp.t}` : null;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, t: sp.board ? 0.52 : sp.row !== undefined ? sp.row + 0.031 : sp.table ? sp.table[1] + 0.001 : sp.t + 0.041, sp });
  }
  return out;
}

/** WP-5: the people moved to Figure.tsx (gear, level coin, rings, lanyards); re-exported for the room. */
export { Figure } from './Figure';
export type { FigurePerson } from './Figure';
