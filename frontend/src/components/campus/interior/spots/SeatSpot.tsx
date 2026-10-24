import React from 'react';
import { sp, NameTent, Chair } from './spotParts';

/** Your seat in the Classroom's front row (v6 D1, the prototype's SPOT_SVG.seat): the bench with your laptop open, a water bottle, a
 *  notebook and your name card; the class rows shift left to make room. */
export default function SeatSpot({ name }: { name: string }): React.ReactElement {
  return (
    <svg viewBox="0 0 300 215" aria-hidden="true">
      <ellipse cx={150} cy={204} rx={140} ry={10} fill={sp('shadow')} />
      <polygon points="14,96 286,96 294,112 6,112" fill={sp('bench')} /><rect x={6} y={112} width={288} height={30} fill={sp('bench-front')} />
      <rect x={20} y={142} width={10} height={56} fill={sp('bench-leg')} /><rect x={270} y={142} width={10} height={56} fill={sp('bench-leg')} />
      <polygon points="104,34 196,34 192,92 108,92" fill={sp('keys')} /><polygon points="109,39 191,39 188,88 112,88" fill={sp('paper')} className="scrglow" />
      <rect x={112} y={39} width={76} height={5} fill={sp('red')} /><rect x={118} y={52} width={52} height={5} rx={2} fill={sp('ink')} />
      <rect x={118} y={61} width={38} height={5} rx={2} fill={sp('ink')} /><rect x={118} y={74} width={24} height={7} rx={3.5} fill={sp('red')} />
      <polygon points="98,92 202,92 212,104 88,104" fill={sp('key')} />
      <rect x={226} y={80} width={40} height={18} rx={2} fill={sp('notebook')} transform="rotate(-6 246 89)" />
      <line x1={232} y1={92} x2={262} y2={86} stroke={sp('card')} strokeWidth={1.5} />
      <rect x={40} y={64} width={14} height={34} rx={5} fill={sp('bottle')} opacity={0.85} /><rect x={42} y={58} width={10} height={7} rx={2} fill={sp('bottle-cap')} />
      <NameTent x={76} y={92} name={name} />
      <Chair x={150} y={128} />
    </svg>
  );
}
