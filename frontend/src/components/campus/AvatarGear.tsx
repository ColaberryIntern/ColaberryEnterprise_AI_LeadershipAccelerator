import React from 'react';
import type { PublicGear } from './campusGear';
import { art } from './art/artColor';

/**
 * Earned gear drawn on a round head (Colaberry Campus C9): the learner's own pin head and the people tokens. Simple shapes in
 * shell tokens, scaled to the head's radius, so the same drawing works on a 12 px pin head and an 11 px token.
 * C46: no rides; the body slot is the Campus jacket, the hoodie or the Gold Architect jacket, a collar arc in its own colour.
 */
export function GearOnHead({ gear, cx, cy, r }: { gear: PublicGear; cx: number; cy: number; r: number }): React.ReactElement | null {
  if (!gear.head && !gear.face && !gear.body && !gear.neck) return null;
  return (
    <g className="cm-gear" aria-hidden="true">
      {(gear.body === 'hoodie' || gear.body === 'jacket' || gear.body === 'architect') && <path className={`cm-gear-${gear.body}`} data-gear={gear.body} stroke={gear.body === 'hoodie' ? undefined : art(gear.body)} d={`M${cx - r} ${cy + r * 0.6} Q${cx} ${cy + r * 1.7} ${cx + r} ${cy + r * 0.6}`} />}
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
