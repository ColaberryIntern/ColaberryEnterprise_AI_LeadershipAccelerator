import React from 'react';
import type { BuildingId, CampusBuilding, ExplorerAccess } from './campusMap';
import { BUILDING_ICON, buildingName } from './campusMap';
import { art } from './art/artColor';
import { AVE } from './art/grounds';
import './campusMiniMap.css';

/**
 * The campus as a schematic (WP-3; the prototype's miniMapSVG D:2499 and campusMapSVG D:3493), for the page bar's tile and the
 * page's side map, in place of a shrunken copy of the illustrated map:
 *  - tile: grass, the hub and paths, every building a grey block except the one you are in (its colour), and a pulsing red pin;
 *  - side: each building a light tint of its colour with its icon (locked ones grey), the one you are in solid with a dark outline
 *    and the pin. A press walks there (pointer only: the side column lists every building as a link right below).
 * A picture for assistive technology (aria-hidden); the pulse stops with reduce motion.
 */
export interface MiniMapProps {
  buildings: CampusBuilding[];
  here: BuildingId | null;
  variant: 'tile' | 'side';
  accessOf?: (b: CampusBuilding) => ExplorerAccess;
  workplaceNames?: boolean;
  reduceMotion?: boolean;
  onPick?: (id: BuildingId) => void;
}

const HUB = { x: 500, y: 400 };

export default function CampusMiniMap({ buildings, here, variant, accessOf, workplaceNames = false, reduceMotion = false, onPick }: MiniMapProps): React.ReactElement {
  const side = variant === 'side';
  const blocks = buildings.filter((b) => b.kind !== 'gate');
  const cur = here ? blocks.find((b) => b.id === here) : undefined;
  const fillOf = (b: CampusBuilding) => {
    if (b.id === here) return art(b.id);
    if (!side) return art('mini-block');
    return accessOf?.(b) === 'locked' ? art('dot') : `color-mix(in srgb, ${art(b.id)} 40%, ${art('white')})`;
  };
  return (
    <svg className={`cm-mini is-${variant}${reduceMotion ? ' is-reduced' : ''}`} viewBox={side ? '70 120 880 560' : '60 110 880 560'} preserveAspectRatio="xMidYMid slice"
      aria-hidden="true" focusable="false" data-testid={`cm-mini-${variant}`}>
      <rect x={0} y={0} width={1000} height={700} fill={art(workplaceNames ? 'paving' : 'ground')} />
      {side ? <ellipse cx={HUB.x} cy={395} rx={175} ry={95} fill={art(workplaceNames ? 'paving-line' : 'lawn')} /> : <circle cx={HUB.x} cy={HUB.y} r={40} fill={art('mini-hub')} />}
      {blocks.filter((b) => b.zone === 'up').map((b) => <line key={'l' + b.id} x1={HUB.x} y1={HUB.y} x2={b.pos.x} y2={b.pos.y} stroke={art('path')} strokeWidth={side ? 12 : 14} />)}
      <line x1={100} y1={AVE} x2={900} y2={AVE} stroke={art('path')} strokeWidth={side ? 14 : 16} />
      {side && <line x1={HUB.x} y1={HUB.y} x2={HUB.x} y2={660} stroke={art('path')} strokeWidth={14} />}
      {blocks.map((b) => (
        <g key={b.id} className="cm-mini-b" data-building={b.id} onClick={onPick ? () => onPick(b.id) : undefined}>
          <title>{buildingName(b, workplaceNames)}</title>
          <rect x={b.pos.x - b.pos.w / 2} y={b.pos.y - b.pos.h} width={b.pos.w} height={b.pos.h} rx={side ? 8 : 6} fill={fillOf(b)}
            stroke={side ? (b.id === here ? art('level-ink') : art('white')) : 'none'} strokeWidth={side ? (b.id === here ? 5 : 3) : 0} />
          {side && <text x={b.pos.x} y={b.pos.y + 26} textAnchor="middle" fontSize={22}>{BUILDING_ICON[b.id] ?? ''}</text>}
        </g>
      ))}
      {cur && (side
        ? <>
            <circle className="cm-mini-pin" cx={cur.pos.x} cy={cur.pos.y - cur.pos.h / 2} r={20} fill="none" stroke={art('red')} strokeWidth={8} />
            <path d={`M${cur.pos.x} ${cur.pos.y - cur.pos.h / 2 + 16} l-12 -22 a14 14 0 1 1 24 0z`} fill={art('red')} stroke={art('white')} strokeWidth={4} />
          </>
        : <>
            <circle className="cm-mini-pin" cx={cur.pos.x} cy={cur.pos.y - cur.pos.h / 2} r={22} fill="none" stroke={art('red')} strokeWidth={10} />
            <circle cx={cur.pos.x} cy={cur.pos.y - cur.pos.h / 2} r={20} fill={art('red')} stroke={art('white')} strokeWidth={8} />
          </>)}
    </svg>
  );
}
