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
    const key = sp.row !== undefined ? `r${sp.row}` : sp.table ? `t${sp.table.join(',')}` : sp.desk ? `d${sp.u},${sp.t}` : null;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, t: sp.row !== undefined ? sp.row + 0.031 : sp.table ? sp.table[1] + 0.001 : sp.t + 0.041, sp });
  }
  return out;
}

export interface FigurePerson { key: string; name: string; initials: string; photo: string | null; level?: string | null; you?: boolean; tone: string }

/**
 * A person in the room (the prototype's personSVG): body, legs when standing, a head that is THEIR photo or their initials (never
 * a generated face), and a name tag ("You" in red for you). Others show their first name; a level ring color comes from the caller.
 */
export function Figure({ x, y, s, p, pose, onPick, testId }: { x: number; y: number; s: number; p: FigurePerson; pose: 'sit' | 'stand'; onPick?: () => void; testId?: string }): React.ReactElement {
  const k = s * 1.25;
  const hy = pose === 'sit' ? y - 52 * k : y - 66 * k;
  const clip = `cm-fig-${p.key}`;
  const first = p.you ? 'You' : p.name.split(/\s+/)[0];
  return (
    <g className={`cm-fig${p.you ? ' is-you' : ''}`} data-testid={testId ?? (p.you ? 'cm-inside-you' : 'cm-inside-person')}
      {...(onPick ? { role: 'button', tabIndex: 0, 'aria-label': `${p.name}, open their card`, onClick: onPick, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(); } } } : { 'aria-hidden': true })}>
      <ellipse cx={x} cy={y + 1} rx={15 * k} ry={4 * k} fill={art('in-fig-shadow')} />
      {pose === 'sit'
        ? <rect x={x - 13 * k} y={y - 42 * k} width={26 * k} height={30 * k} rx={11 * k} fill={p.tone} />
        : <><rect x={x - 8 * k} y={y - 22 * k} width={6 * k} height={22 * k} rx={3 * k} fill={art('in-legs')} /><rect x={x + 2 * k} y={y - 22 * k} width={6 * k} height={22 * k} rx={3 * k} fill={art('in-legs')} />
          <rect x={x - 13 * k} y={y - 56 * k} width={26 * k} height={38 * k} rx={11 * k} fill={p.tone} /></>}
      {p.photo
        ? <><clipPath id={clip}><circle cx={x} cy={hy} r={12 * k} /></clipPath>
            <image href={p.photo} x={x - 12 * k} y={hy - 12 * k} width={24 * k} height={24 * k} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} />
            <circle cx={x} cy={hy} r={12 * k} fill="none" stroke={art('white')} strokeWidth={2 * k} /></>
        : <><circle cx={x} cy={hy} r={12 * k} fill={p.tone} stroke={art('white')} strokeWidth={2 * k} />
            <text x={x} y={hy + 3.4 * k} textAnchor="middle" fontSize={9.5 * k} fontWeight={800} fill={art('white')} fontFamily="'DM Sans',system-ui,sans-serif">{p.initials}</text></>}
      <g className="nm">
        <rect x={x - 34 * k} y={hy - 30 * k} width={68 * k} height={15 * k} rx={7 * k} fill={art(p.you ? 'in-you' : 'in-name-bg')} />
        <text x={x} y={hy - 19.5 * k} textAnchor="middle" fontSize={8.5 * k} fontWeight={700} fill={art('white')} fontFamily="'DM Sans',system-ui,sans-serif">{first}</text>
      </g>
    </g>
  );
}
