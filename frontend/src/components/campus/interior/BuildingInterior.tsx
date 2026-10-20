import React from 'react';
import { art } from '../art/artColor';
import type { BuildingId } from '../campusMap';
import { P, ROOMS, spotsFor, youSpotFor } from './roomModel';
import type { Spot } from './roomModel';
import RoomFeature from './RoomFeature';
import { Figure, Furniture, furniturePieces } from './RoomFurniture';
import type { FigurePerson } from './RoomFurniture';

/**
 * A building's inside, drawn as the prototype draws it (renderRoom): the back wall with its feature, the side walls and ceiling in
 * the wall's shades, the floor with its boards, three ceiling lights, the glowing back door with its sign ("YOUR PAGE ->"), and the
 * people really here placed back to front among the furniture, with you at the front. A picture: aria-hidden except the people,
 * who open their cards.
 */
export interface InteriorProps {
  id: BuildingId;
  people: FigurePerson[];
  you: FigurePerson;
  doorSign: string;
  /** The building's name as this viewer sees it (the screen and stage signs). */
  name: string;
  onAir: boolean;
  onPick?: (key: string) => void;
  /** The AI staff desk in this building (the prototype's gold desk with "Ask <name> anything"), when the server listed one on duty. */
  desk?: { name: string; initials: string; title: string } | null;
}

export default function BuildingInterior({ id, people, you, doorSign, name, onAir, onPick, desk }: InteriorProps): React.ReactElement | null {
  const room = ROOMS[id];
  if (!room) return null;
  const { all, order } = spotsFor(room.layout);
  const taken = Math.min(people.length, order.length - 1);
  const seats = order.slice(0, taken);
  const yourSpot: Spot = youSpotFor(room.layout, taken);
  const c = (k: string) => art(`in-${id}-${k}`);
  type Item = { t: number; key: string; node: React.ReactNode };
  const items: Item[] = [];
  seats.forEach((sp, i) => { const q = P(sp.u, sp.t); const p = people[i];
    items.push({ t: sp.t, key: `p-${p.key}`, node: <Figure x={q.x} y={q.y} s={q.s} p={p} pose={sp.pose} onPick={onPick ? () => onPick(p.key) : undefined} /> }); });
  if (desk) { const q = P(0.17, 0.74); items.push({ t: 0.74, key: 'desk', node: (
    <g data-testid="cm-inside-desk" aria-hidden="true">
      <polygon points={`${q.x - 40 * q.s},${q.y - 18 * q.s} ${q.x + 40 * q.s},${q.y - 18 * q.s} ${q.x + 46 * q.s},${q.y + 6 * q.s} ${q.x - 46 * q.s},${q.y + 6 * q.s}`} fill={art('gold')} />
      <text x={q.x} y={q.y - 2 * q.s} textAnchor="middle" fontSize={10 * q.s} fontWeight={800} fill={art('white')} fontFamily="'DM Sans',system-ui,sans-serif">{desk.title.toUpperCase()}</text>
      <Figure x={q.x} y={q.y - 20 * q.s} s={q.s} p={{ key: 'desk', name: desk.name, initials: desk.initials, photo: null, tone: art('gold') }} pose="stand" testId="cm-inside-staff" />
      <rect x={q.x + 16 * q.s} y={q.y - 118 * q.s} width={118 * q.s} height={26 * q.s} rx={13 * q.s} fill={art('white')} stroke={art('gold')} strokeWidth={2} />
      <text x={q.x + 75 * q.s} y={q.y - 100 * q.s} textAnchor="middle" fontSize={11 * q.s} fontWeight={700} fill={art('pic-ink')} fontFamily="'DM Sans',system-ui,sans-serif">Ask {desk.name} anything</text>
    </g>
  ) }); }
  for (const f of furniturePieces(all)) items.push({ t: f.t, key: `f-${f.key}`, node: <Furniture sp={f.sp} layout={room.layout} /> });
  items.sort((a, b) => a.t - b.t);
  const yq = P(yourSpot.u, yourSpot.t);
  return (
    <svg className="cm-room" viewBox="0 0 1000 620" preserveAspectRatio="xMidYMid slice" data-testid="cm-inside-room" data-room={id} role="group" aria-label="Inside the building">
      <defs><linearGradient id="cm-room-light" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={art('white')} stopOpacity={0.35} /><stop offset="1" stopColor={art('white')} stopOpacity={0} /></linearGradient></defs>
      <g aria-hidden="true">
        <polygon points="0,0 1000,0 830,70 170,70" fill={c('wall-d28')} />
        <polygon points="0,0 170,70 170,330 0,620" fill={c('wall-d16')} />
        <polygon points="1000,0 830,70 830,330 1000,620" fill={c('wall-d16')} />
        <rect x={170} y={70} width={660} height={260} fill={c('wall')} />
        <polygon points="170,330 830,330 1000,620 0,620" fill={c('floor')} />
        {Array.from({ length: 11 }, (_, i) => { const a = P(i / 10, 0), z = P(i / 10, 1); return <line key={i} x1={a.x} y1={a.y} x2={z.x} y2={z.y} stroke={art('in-grain')} strokeWidth={2} />; })}
        {[0, 1, 2].map((i) => (
          <g key={i}><ellipse cx={330 + i * 170} cy={72} rx={46} ry={7} fill={art(room.dark ? 'in-light-dark' : 'in-light')} opacity={0.9} />
            <polygon points={`${294 + i * 170},74 ${366 + i * 170},74 ${420 + i * 170},330 ${240 + i * 170},330`} fill="url(#cm-room-light)" opacity={0.5} /></g>
        ))}
        <RoomFeature feature={room.feature} onAir={onAir} name={name} />
        <g className="cm-door-g" data-testid="cm-inside-door">
          <rect x={772} y={206} width={46} height={124} rx={4} fill={c('door')} />
          <rect className="glow" x={776} y={210} width={38} height={120} fill={art('in-door-glow')} />
          <circle cx={810} cy={272} r={3} fill={art('in-door-knob')} />
          <text x={795} y={198} textAnchor="middle" fontSize={10} fontWeight={800} fill={room.dark ? art('white') : c('sign')} fontFamily="'DM Sans',system-ui,sans-serif" letterSpacing={1}>{doorSign}</text>
        </g>
      </g>
      {items.map((it) => <React.Fragment key={it.key}>{it.node}</React.Fragment>)}
      <Figure x={yq.x} y={yq.y} s={yq.s} p={you} pose={yourSpot.pose} />
    </svg>
  );
}
