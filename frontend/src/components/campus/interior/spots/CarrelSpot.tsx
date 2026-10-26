import React from 'react';
import { art } from '../../art/artColor';
import { sp, NameTent, Chair } from './spotParts';

/** A study carrel in the Library (v6 D1, the prototype's SPOT_SVG.carrel): a shelf of books, a green reading lamp and an open book. */
const SPINES = [20, 22, 24, 20, 22, 24, 20, 22, 24, 20, 22, 24];
export default function CarrelSpot({ name }: { name: string }): React.ReactElement {
  return (
    <svg viewBox="0 0 300 250" aria-hidden="true">
      <ellipse cx={150} cy={240} rx={140} ry={10} fill={sp('shadow')} />
      <rect x={20} y={10} width={260} height={110} fill={sp('carrel')} /><rect x={28} y={18} width={244} height={94} fill={sp('carrel-in')} />
      <rect x={36} y={40} width={228} height={6} fill={sp('bench-leg')} />
      {SPINES.map((top, i) => <rect key={i} x={40 + i * 14} y={top} width={11} height={40 - top} fill={art(`in-p${(i % 10) + 1}`)} />)}
      <polygon points="10,10 30,18 30,128 10,136" fill={sp('carrel-side')} /><polygon points="290,10 270,18 270,128 290,136" fill={sp('carrel-side')} />
      <polygon points="10,120 290,120 296,136 4,136" fill={sp('bench')} /><rect x={4} y={136} width={292} height={22} fill={sp('bench-front')} />
      <rect x={18} y={158} width={10} height={62} fill={sp('bench-leg')} /><rect x={272} y={158} width={10} height={62} fill={sp('bench-leg')} />
      <path d="M206 120 V82" stroke={sp('brass')} strokeWidth={4} /><path d="M186 82 q20 -22 40 0z" fill={sp('lamp-green')} />
      <ellipse cx={206} cy={83} rx={20} ry={4} fill={sp('glow-warm')} /><path d="M188 84 L170 120 L242 120 L224 84z" fill={sp('cone-warm')} />
      <path d="M86 118 q30 -16 60 0 q30 -16 60 0 v6 q-30 -12 -60 0 q-30 -12 -60 0z" fill={sp('card')} stroke={sp('card-edge')} />
      <line x1={146} y1={104} x2={146} y2={124} stroke={sp('card-edge')} />
      <g fill={sp('rule')}><rect x={96} y={110} width={40} height={2} /><rect x={156} y={110} width={40} height={2} /><rect x={96} y={114} width={34} height={2} /><rect x={156} y={114} width={36} height={2} /></g>
      <NameTent x={56} y={120} name={name} />
      <Chair x={150} y={160} />
    </svg>
  );
}
