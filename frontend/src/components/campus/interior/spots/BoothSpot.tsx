import React from 'react';
import { sp, NameTent, Chair } from './spotParts';

/** A quiet booth in Cert Prep (v6 D1, the prototype's SPOT_SVG.booth): partitions, a wall clock, a monitor showing a practice
 *  question and headphones. (Cert Prep is the diagnostic and practice, never a knowledge check: Ali, 2026-10-24.) */
export default function BoothSpot({ name }: { name: string }): React.ReactElement {
  return (
    <svg viewBox="0 0 300 260" aria-hidden="true">
      <ellipse cx={150} cy={250} rx={140} ry={10} fill={sp('shadow')} />
      <rect x={22} y={6} width={256} height={128} rx={4} fill={sp('booth')} /><rect x={30} y={14} width={240} height={112} fill={sp('booth-in')} />
      <polygon points="6,2 26,10 26,140 6,150" fill={sp('booth-side')} /><polygon points="294,2 274,10 274,140 294,150" fill={sp('booth-side')} />
      <circle cx={240} cy={40} r={13} fill={sp('card')} stroke={sp('blue')} strokeWidth={3} />
      <line x1={240} y1={40} x2={240} y2={31} stroke={sp('ink')} strokeWidth={2} /><line x1={240} y1={40} x2={247} y2={43} stroke={sp('ink')} strokeWidth={2} />
      <rect x={138} y={96} width={24} height={24} fill={sp('stand')} />
      <rect x={86} y={30} width={128} height={72} rx={4} fill={sp('monitor')} /><rect x={92} y={36} width={116} height={60} fill={sp('paper')} className="scrglow" />
      <rect x={92} y={36} width={116} height={5} fill={sp('blue')} /><rect x={100} y={48} width={70} height={5} rx={2} fill={sp('ink')} />
      {[62, 72, 82].map((y, i) => (
        <g key={y}><circle cx={104} cy={y} r={3} fill="none" stroke={sp('blue')} strokeWidth={1.5} /><rect x={112} y={y - 2} width={60 - i * 8} height={4} fill={sp('rule')} /></g>
      ))}
      <polygon points="10,120 290,120 296,136 4,136" fill={sp('booth-desk')} /><rect x={4} y={136} width={292} height={20} fill={sp('booth-front')} />
      <rect x={18} y={156} width={10} height={70} fill={sp('booth-leg')} /><rect x={272} y={156} width={10} height={70} fill={sp('booth-leg')} />
      <polygon points="112,124 188,124 194,132 106,132" fill={sp('keys')} />
      <path d="M220 124 q0 -18 18 -18 q18 0 18 18" stroke={sp('headset')} strokeWidth={4} fill="none" />
      <rect x={214} y={118} width={10} height={12} rx={4} fill={sp('headset')} /><rect x={252} y={118} width={10} height={12} rx={4} fill={sp('headset')} />
      <NameTent x={56} y={120} name={name} />
      <Chair x={150} y={160} />
    </svg>
  );
}
