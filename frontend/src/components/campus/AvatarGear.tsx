import React from 'react';
import type { PublicGear } from './campusGear';

/**
 * Earned gear drawn on a round head (Colaberry Campus C9): the learner's own pin head and the people tokens. Simple shapes in
 * shell tokens, scaled to the head's radius, so the same drawing works on a 12 px pin head and an 11 px token.
 * The RIDE is separate (RideUnder) and only the map's own avatar draws it, only while moving.
 */
export function GearOnHead({ gear, cx, cy, r }: { gear: PublicGear; cx: number; cy: number; r: number }): React.ReactElement | null {
  if (!gear.head && !gear.face && !gear.body && !gear.neck) return null;
  return (
    <g className="cm-gear" aria-hidden="true">
      {gear.body === 'hoodie' && <path className="cm-gear-hoodie" data-gear="hoodie" d={`M${cx - r} ${cy + r * 0.6} Q${cx} ${cy + r * 1.7} ${cx + r} ${cy + r * 0.6}`} />}
      {gear.neck === 'chain' && <path className="cm-gear-chain" data-gear="chain" d={`M${cx - r * 0.6} ${cy + r * 0.75} Q${cx} ${cy + r * 1.25} ${cx + r * 0.6} ${cy + r * 0.75}`} />}
      {gear.face === 'shades' && (
        <g className="cm-gear-shades" data-gear="shades">
          <rect x={cx - r * 0.8} y={cy - r * 0.25} width={r * 0.7} height={r * 0.4} rx={r * 0.12} />
          <rect x={cx + r * 0.1} y={cy - r * 0.25} width={r * 0.7} height={r * 0.4} rx={r * 0.12} />
        </g>
      )}
      {gear.head === 'cap' && <path className="cm-gear-cap" data-gear="cap" d={`M${cx - r} ${cy - r * 0.35} A ${r} ${r * 0.85} 0 0 1 ${cx + r} ${cy - r * 0.35} L${cx + r * 1.45} ${cy - r * 0.3} Z`} />}
    </g>
  );
}

/** The learner's own ride under their pin. The caller draws it only while the avatar is moving. */
export function RideUnder({ ride }: { ride: string }): React.ReactElement | null {
  if (ride === 'board') {
    return (
      <g className="cm-ride" data-ride="board" data-testid="cm-ride" aria-hidden="true">
        <rect className="cm-ride-deck" x={-15} y={2} width={30} height={5} rx={2.5} />
        <circle className="cm-ride-wheel" cx={-9} cy={9} r={2.5} /><circle className="cm-ride-wheel" cx={9} cy={9} r={2.5} />
      </g>
    );
  }
  if (ride === 'cruiser') {
    return (
      <g className="cm-ride" data-ride="cruiser" data-testid="cm-ride" aria-hidden="true">
        <path className="cm-ride-body" d="M-20 6 L-14 -2 L12 -2 L20 6 Z" />
        <circle className="cm-ride-wheel" cx={-11} cy={8} r={3.5} /><circle className="cm-ride-wheel" cx={11} cy={8} r={3.5} />
      </g>
    );
  }
  return null;
}
