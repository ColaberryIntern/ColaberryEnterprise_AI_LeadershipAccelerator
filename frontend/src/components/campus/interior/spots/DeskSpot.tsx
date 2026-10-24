import React from 'react';
import { sp, NameTent, Chair, Plant, Mug } from './spotParts';

/** Your desk (v6 D1, the prototype's DESK_SVG): two monitors, a desk lamp, a mug with steam, a plant, keyboard, mouse, headphones
 *  on the monitor, your name card and your chair. Project Studio and the Internship Office. */
export default function DeskSpot({ name }: { name: string }): React.ReactElement {
  return (
    <svg viewBox="0 0 340 250" aria-hidden="true">
      <ellipse cx={170} cy={236} rx={160} ry={12} fill={sp('shadow')} />
      <path d="M300 118 L300 60 L262 34" stroke={sp('lamp-arm')} strokeWidth={5} fill="none" strokeLinecap="round" />
      <path d="M246 22 h34 l-6 18 h-22z" fill={sp('lamp')} /><ellipse cx={263} cy={42} rx={14} ry={4} fill={sp('lamp-glow')} />
      <path d="M249 42 L222 118 L304 118 L277 42z" fill={sp('lamp-cone')} /><ellipse cx={300} cy={120} rx={14} ry={4} fill={sp('lamp-arm')} />
      <rect x={94} y={96} width={10} height={20} fill={sp('stand')} /><rect x={78} y={114} width={42} height={6} rx={3} fill={sp('stand')} />
      <rect x={212} y={96} width={10} height={20} fill={sp('stand')} /><rect x={196} y={114} width={42} height={6} rx={3} fill={sp('stand')} />
      <polygon points="34,24 154,30 154,100 34,104" fill={sp('monitor')} /><polygon points="40,30 148,35 148,94 40,98" fill={sp('term')} />
      <g className="scrglow">
        <rect x={46} y={40} width={40} height={4} fill={sp('code-green')} /><rect x={46} y={50} width={70} height={4} fill={sp('code-grey')} opacity={0.7} />
        <rect x={46} y={60} width={54} height={4} fill={sp('code-amber')} /><rect x={46} y={70} width={80} height={4} fill={sp('code-grey')} opacity={0.7} />
        <rect x={46} y={80} width={30} height={4} fill={sp('code-green')} />
      </g>
      <rect x={160} y={22} width={150} height={80} rx={4} fill={sp('monitor')} /><rect x={166} y={28} width={138} height={68} rx={2} fill={sp('paper')} />
      <rect x={166} y={28} width={138} height={6} fill={sp('red')} />
      <rect x={174} y={42} width={96} height={6} rx={2} fill={sp('ink')} /><rect x={174} y={52} width={70} height={6} rx={2} fill={sp('ink')} />
      <rect x={174} y={64} width={110} height={3} fill={sp('rule')} /><rect x={174} y={70} width={90} height={3} fill={sp('rule')} />
      <rect x={174} y={80} width={40} height={9} rx={4.5} fill={sp('red')} />
      <path d="M292 28 q14 -16 26 2" stroke={sp('headset')} strokeWidth={4} fill="none" />
      <rect x={286} y={26} width={9} height={14} rx={4} fill={sp('headset')} /><rect x={313} y={28} width={9} height={14} rx={4} fill={sp('headset')} />
      <polygon points="10,120 330,120 338,138 2,138" fill={sp('wood')} /><rect x={2} y={138} width={336} height={16} fill={sp('wood-edge')} />
      <rect x={14} y={154} width={12} height={76} fill={sp('wood-leg')} /><rect x={314} y={154} width={12} height={76} fill={sp('wood-leg')} />
      <Plant x={20} y={112} />
      <Mug x={52} y={108} />
      <polygon points="112,124 224,124 230,134 106,134" fill={sp('keys')} />
      <g fill={sp('key')}><rect x={116} y={126} width={104} height={2} /><rect x={114} y={129.5} width={108} height={2} /></g>
      <ellipse cx={250} cy={130} rx={7} ry={4.5} fill={sp('keys')} />
      <NameTent x={96} y={124} name={name} />
      <Chair x={170} y={150} />
    </svg>
  );
}
