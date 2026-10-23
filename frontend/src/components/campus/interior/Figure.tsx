import React from 'react';
import { art } from '../art/artColor';
import type { PublicGear } from '../campusGear';

/**
 * A person in the room (the prototype's personSVG + accSVG, D:2236-2258): body, legs when standing, a head that is THEIR photo or
 * their initials (never a generated face), and, WP-5:
 *  - the gear they earned and wear (cap, shades, hoodie, chain; a ride is only ever drawn on the map, under your own pin);
 *  - their level as a numbered coin by the head (the rung's place on the ladder, decision Q5);
 *  - the ring round the head: gold for AI staff, teal (thicker) for a partner's own teammates, white otherwise;
 *  - a red lanyard and badge in the business rooms (Project Studio, Career Center, Showcase Gallery, and every room in Workplace
 *    names), as the prototype's roomBiz;
 *  - the name tag shows on hover or focus, always for you and for a partner's teammates (the prototype's .pp .nm).
 */
export interface FigurePerson {
  key: string;
  name: string;
  initials: string;
  photo: string | null;
  level?: string | null;
  /** The number on the level coin (null: no coin). */
  levelN?: number | null;
  gear?: PublicGear;
  you?: boolean;
  /** A partner's teammate (teal ring, tag always shown). */
  team?: boolean;
  /** AI staff (gold ring). */
  staff?: boolean;
  tone: string;
}

const FONT = "'DM Sans',system-ui,sans-serif";

/** Where a press landed (a pointer), or under the element (a key): the card it opens appears there, as the prototype's openCard. */
export const pointOf = (e: React.MouseEvent | React.KeyboardEvent): { x: number; y: number } => {
  if ('clientX' in e && (e.clientX || e.clientY)) return { x: e.clientX, y: e.clientY };
  const r = (e.currentTarget as Element).getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.bottom };
};

/** The gear drawn on the body and head (the prototype's accSVG, its shapes and colors). */
function Dress({ x, top, hy, k, gear }: { x: number; top: number; hy: number; k: number; gear: PublicGear }): React.ReactElement {
  return (
    <g className="cm-fig-gear" aria-hidden="true">
      {gear.body === 'hoodie' && <text data-gear="hoodie" x={x} y={top + 16 * k} textAnchor="middle" fontSize={9 * k} fontWeight={900} fill={art('white')} fontFamily={FONT}>C</text>}
      {gear.neck === 'chain' && <g data-gear="chain">
        <path d={`M${x - 8 * k} ${top + 2 * k} Q${x} ${top + 10 * k} ${x + 8 * k} ${top + 2 * k}`} fill="none" stroke={art('chain')} strokeWidth={1.6 * k} />
        <circle cx={x} cy={top + 9 * k} r={2 * k} fill={art('chain')} /></g>}
      {gear.face === 'shades' && <g data-gear="shades" fill={art('shades')}>
        <rect x={x - 9 * k} y={hy - 3 * k} width={7.5 * k} height={4.5 * k} rx={1.2 * k} />
        <rect x={x + 1.5 * k} y={hy - 3 * k} width={7.5 * k} height={4.5 * k} rx={1.2 * k} />
        <rect x={x - 1.5 * k} y={hy - 1.6 * k} width={3 * k} height={1 * k} /></g>}
      {gear.head === 'cap' && <g data-gear="cap">
        <path d={`M${x - 12 * k} ${hy - 3 * k} A ${12 * k} ${11 * k} 0 0 1 ${x + 12 * k} ${hy - 3 * k} Z`} fill={art('red')} />
        <rect x={x - 2 * k} y={hy - 4.5 * k} width={19 * k} height={3 * k} rx={1.5 * k} fill={art('hoodie')} />
        <circle cx={x} cy={hy - 13 * k} r={1.5 * k} fill={art('white')} /></g>}
    </g>
  );
}

export function Figure({ x, y, s, p, pose, onPick, testId, lanyard = false }: {
  x: number; y: number; s: number; p: FigurePerson; pose: 'sit' | 'stand'; onPick?: (at: { x: number; y: number }) => void; testId?: string; lanyard?: boolean;
}): React.ReactElement {
  const k = s * 1.25;
  const hy = pose === 'sit' ? y - 52 * k : y - 66 * k;
  const top = pose === 'sit' ? y - 42 * k : y - 56 * k;
  const clip = `cm-fig-${p.key}`;
  const first = p.you ? 'You' : p.name.split(/\s+/)[0];
  const gear = p.staff ? {} : p.gear ?? {};
  const body = gear.body === 'hoodie' ? art('hoodie') : p.tone;
  const ring = p.staff ? { c: art('gold-ring'), w: 2 * k } : p.team ? { c: art('team'), w: 3 * k } : { c: art('white'), w: 2 * k };
  const pinned = p.you || p.team;
  return (
    <g className={`cm-fig${p.you ? ' is-you' : ''}${p.team ? ' is-team' : ''}${p.staff ? ' is-staff' : ''}`} data-testid={testId ?? (p.you ? 'cm-inside-you' : 'cm-inside-person')}
      {...(onPick ? { role: 'button', tabIndex: 0, 'aria-label': `${p.name}, open their card`, onClick: (e: React.MouseEvent) => onPick(pointOf(e)), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(pointOf(e)); } } } : { 'aria-hidden': true })}>
      <title>{p.name}</title>
      <ellipse cx={x} cy={y + 1} rx={15 * k} ry={4 * k} fill={art('in-fig-shadow')} />
      {pose === 'sit'
        ? <rect x={x - 13 * k} y={top} width={26 * k} height={30 * k} rx={11 * k} fill={body} />
        : <><rect x={x - 8 * k} y={y - 22 * k} width={6 * k} height={22 * k} rx={3 * k} fill={art('in-legs')} /><rect x={x + 2 * k} y={y - 22 * k} width={6 * k} height={22 * k} rx={3 * k} fill={art('in-legs')} />
          <rect x={x - 13 * k} y={top} width={26 * k} height={38 * k} rx={11 * k} fill={body} /></>}
      {lanyard && !p.staff && <g className="cm-fig-lanyard" data-testid="cm-fig-lanyard">
        <path d={`M${x - 7 * k} ${top + 1 * k} L${x} ${top + 12 * k} L${x + 7 * k} ${top + 1 * k}`} fill="none" stroke={art('red')} strokeWidth={1.8 * k} />
        <rect x={x - 4.5 * k} y={top + 11 * k} width={9 * k} height={11 * k} rx={1.5 * k} fill={art('white')} stroke={art('badge-edge')} strokeWidth={0.8 * k} /></g>}
      {p.photo
        ? <><clipPath id={clip}><circle cx={x} cy={hy} r={12 * k} /></clipPath>
            <image href={p.photo} x={x - 12 * k} y={hy - 12 * k} width={24 * k} height={24 * k} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} />
            <circle className="cm-fig-ring" cx={x} cy={hy} r={12 * k} fill="none" stroke={ring.c} strokeWidth={ring.w} /></>
        : <><circle className="cm-fig-ring" cx={x} cy={hy} r={12 * k} fill={p.tone} stroke={ring.c} strokeWidth={ring.w} />
            <text x={x} y={hy + 3.4 * k} textAnchor="middle" fontSize={9.5 * k} fontWeight={800} fill={art('white')} fontFamily={FONT}>{p.initials}</text></>}
      <Dress x={x} top={top} hy={hy} k={k} gear={gear} />
      {p.levelN ? <g className="cm-fig-coin" data-testid="cm-fig-coin">
        <circle cx={x + 11 * k} cy={hy + 8 * k} r={5.6 * k} fill={art('level')} stroke={art('level-ink')} strokeWidth={1 * k} />
        <text x={x + 11 * k} y={hy + 10.2 * k} textAnchor="middle" fontSize={6.4 * k} fontWeight={900} fill={art('level-ink')} fontFamily={FONT}>{p.levelN}</text></g> : null}
      <g className={`nm${pinned ? ' is-pinned' : ''}`}>
        <rect x={x - 34 * k} y={hy - 30 * k} width={68 * k} height={15 * k} rx={7 * k} fill={art(p.you ? 'in-you' : p.team ? 'team-tag' : 'in-name-bg')} />
        <text x={x} y={hy - 19.5 * k} textAnchor="middle" fontSize={8.5 * k} fontWeight={700} fill={art('white')} fontFamily={FONT}>{first}</text>
      </g>
    </g>
  );
}
