import React from 'react';
import { art } from './artColor';
import type { BuildingId, CampusBuilding } from '../campusMap';

/**
 * The AI staff on the map (C11b, the prototype's .staff-tok): each desk the server lists as on duty for this viewer stands at its
 * building, a gold-ringed initials token with a STAFF tag. C21 (v6 D3): Maya stands on the Admissions building like the others (the
 * welcome bench at the gate is gone); a desk an older server still places at the gate is drawn on Admissions. A press walks you to
 * that building, whose card has the desk. Real data only: no desk listed, no token.
 */
export interface MapDesk { id: string; name: string; building: string }
const TONE: Record<string, string> = { reese: 'staff-reese', dara: 'staff-dara', maya: 'maya' };
const initials = (name: string) => name.slice(0, 2).toUpperCase();
export const deskBuilding = (d: MapDesk): string => (d.id === 'maya' && d.building === 'gate' ? 'admissions' : d.building);

export default function StaffTokens({ desks, buildings, onPick }: { desks: MapDesk[]; buildings: CampusBuilding[]; onPick: (id: BuildingId) => void }): React.ReactElement {
  const byBuilding = new Map<string, MapDesk[]>();
  for (const d of desks) byBuilding.set(deskBuilding(d), [...(byBuilding.get(deskBuilding(d)) ?? []), d]);
  return (
    <g data-testid="cm-staff-tokens">
      {[...byBuilding.entries()].map(([bid, list]) => {
        const b = buildings.find((x) => x.id === bid);
        if (!b || b.kind === 'gate') return null;
        const hw = b.pos.w / 2;
        return list.map((d, i) => (
          <g key={d.id} className="cm-staff-tok" role="button" tabIndex={0} aria-label={`${d.name}, AI staff, walk to their desk`} data-testid={`cm-staff-${d.id}`}
            transform={`translate(${b.pos.x + hw - 16 - i * 22} ${b.pos.y - 4})`}
            onClick={(e) => { e.stopPropagation(); onPick(b.id); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(b.id); } }}>
            <ellipse cx={0} cy={9} rx={9} ry={3} fill={art('token-shadow')} />
            <circle className="ring" cx={0} cy={-4} r={10} fill={art(TONE[d.id] ?? 'gold')} stroke={art('gold-ring')} strokeWidth={2.5} />
            <text x={0} y={-1} textAnchor="middle" fontSize={7.5} fontWeight={800} fill={art('white')}>{initials(d.name)}</text>
            <rect x={-15} y={-26} width={30} height={11} rx={5.5} fill={art('gold')} />
            <text x={0} y={-18} textAnchor="middle" fontSize={6.5} fontWeight={800} fill={art('white')} letterSpacing={0.5}>STAFF</text>
          </g>
        ));
      })}
    </g>
  );
}
