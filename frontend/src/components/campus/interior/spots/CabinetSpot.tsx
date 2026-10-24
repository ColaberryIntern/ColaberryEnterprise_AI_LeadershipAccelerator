import React from 'react';
import { sp } from './spotParts';

/** The Game Room's arcade cabinet (v6 D1, the prototype's SPOT_SVG.cabinet): Bug Breaker, with a stool. It opens the Game Room. */
const BRICKS = ['neon-pink', 'neon-cyan', 'neon-yellow', 'neon-green'];
export default function CabinetSpot(): React.ReactElement {
  return (
    <svg viewBox="0 0 170 300" aria-hidden="true">
      <ellipse cx={85} cy={292} rx={80} ry={8} fill={sp('shadow')} />
      <polygon points="20,6 150,6 160,290 10,290" fill={sp('cab')} />
      <rect x={22} y={12} width={126} height={34} rx={4} fill={sp('cab-top')} stroke={sp('neon-pink')} strokeWidth={3} className="neon" />
      <text x={85} y={35} textAnchor="middle" fontSize={13} fontWeight={900} fill={sp('cab-title')} fontFamily="'DM Sans',system-ui,sans-serif" letterSpacing={2}>BUG BREAKER</text>
      <rect x={28} y={56} width={114} height={92} rx={6} fill={sp('cab-screen')} />
      <g className="scrglow">
        {BRICKS.map((c, r) => [0, 1, 2, 3, 4].map((k) => <rect key={`${r}-${k}`} x={38 + k * 18} y={66 + r * 10} width={15} height={7} rx={1} fill={sp(c)} />))}
        <circle cx={96} cy={124} r={4} fill={sp('card')} /><rect x={74} y={136} width={30} height={5} rx={2} fill={sp('red')} />
      </g>
      <polygon points="16,160 154,160 162,196 8,196" fill={sp('cab-panel')} />
      <circle cx={54} cy={176} r={5} fill={sp('cab-stick')} /><rect x={51} y={160} width={6} height={16} fill={sp('cab-stick')} /><circle cx={54} cy={160} r={8} fill={sp('red')} />
      <circle cx={104} cy={178} r={7} fill={sp('neon-yellow')} /><circle cx={124} cy={174} r={7} fill={sp('neon-cyan')} />
      <rect x={62} y={230} width={46} height={10} rx={3} fill={sp('cab-top')} />
      <text x={85} y={238} textAnchor="middle" fontSize={7} fontWeight={800} fill={sp('neon-yellow')} fontFamily="'DM Sans',system-ui,sans-serif">▶ PLAY</text>
      <ellipse cx={85} cy={276} rx={26} ry={6} fill={sp('chair')} /><rect x={81} y={256} width={8} height={20} fill={sp('chair')} />
      <ellipse cx={85} cy={254} rx={24} ry={7} fill={sp('red')} />
    </svg>
  );
}
