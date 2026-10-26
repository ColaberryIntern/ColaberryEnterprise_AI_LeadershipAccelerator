import React from 'react';
import { art } from '../../art/artColor';
import { sp } from './spotParts';

const FOOD = ['🍕', '🍔', '🌮', '🍩', '🥗', '☕'];

/** Chow Hall's service counter (v11 C2, SPOTS.chow): a glass case of food emoji on a red base under a hanging "🛎 Order food ↗" sign.
 *  It opens the order sheet (outbound links to delivery apps; Colaberry takes no orders or payments). */
export default function CounterSpot(): React.ReactElement {
  return (
    <svg viewBox="0 0 330 230" aria-hidden="true">
      <ellipse cx={165} cy={222} rx={150} ry={9} fill={sp('shadow')} />
      <line x1={110} y1={0} x2={110} y2={22} stroke={sp('lamp-arm')} strokeWidth={2} /><line x1={220} y1={0} x2={220} y2={22} stroke={sp('lamp-arm')} strokeWidth={2} />
      <rect x={84} y={22} width={162} height={34} rx={8} fill={art('chow')} />
      <text x={165} y={45} textAnchor="middle" fontSize={16} fontWeight={800} fill={sp('card')} fontFamily="'DM Sans',system-ui,sans-serif">🛎 Order food ↗</text>
      <rect x={30} y={140} width={270} height={72} rx={6} fill={art('chow-base')} />
      <rect x={30} y={136} width={270} height={10} rx={3} fill={art('chow-d30')} />
      <rect x={44} y={80} width={242} height={58} rx={6} fill={art('chow-case')} stroke={sp('card')} strokeWidth={2} />
      {FOOD.map((f, i) => <text key={f} x={66 + i * 40} y={118} textAnchor="middle" fontSize={24}>{f}</text>)}
    </svg>
  );
}
