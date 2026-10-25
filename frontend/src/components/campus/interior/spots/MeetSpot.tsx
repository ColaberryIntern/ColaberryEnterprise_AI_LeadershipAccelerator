import React from 'react';
import { sp } from './spotParts';

/** The Admissions meeting table (v6 D1 / D3, the prototype's SPOT_SVG.meet): two chairs, a laptop showing a video call and a desk
 *  calendar. It opens "Book a call with admissions". */
export default function MeetSpot(): React.ReactElement {
  return (
    <svg viewBox="0 0 330 220" aria-hidden="true">
      <ellipse cx={165} cy={210} rx={150} ry={10} fill={sp('shadow')} />
      {[18, 252].map((x) => (
        <g key={x}><rect x={x} y={70} width={60} height={70} rx={14} fill={sp('meet-chair')} /><rect x={x + 6} y={76} width={48} height={44} rx={10} fill={sp('meet-chair-in')} />
          <rect x={x + 26} y={140} width={8} height={40} fill={sp('lamp-arm')} /></g>
      ))}
      <ellipse cx={165} cy={120} rx={120} ry={26} fill={sp('meet-table')} stroke={sp('meet-table-edge')} strokeWidth={3} />
      <rect x={158} y={124} width={14} height={70} fill={sp('meet-table-edge')} /><ellipse cx={165} cy={198} rx={40} ry={6} fill={sp('meet-foot')} />
      <polygon points="120,72 196,72 192,112 124,112" fill={sp('keys')} /><polygon points="124,76 192,76 189,108 127,108" fill={sp('call')} className="scrglow" />
      <circle cx={158} cy={90} r={9} fill={sp('maya')} /><rect x={146} y={99} width={24} height={9} rx={4} fill={sp('maya')} />
      <rect x={176} y={80} width={10} height={7} rx={2} fill={sp('live')} />
      <polygon points="116,112 200,112 208,122 108,122" fill={sp('key')} />
      <rect x={84} y={96} width={26} height={22} rx={3} fill={sp('card')} stroke={sp('maya')} strokeWidth={2} /><rect x={84} y={96} width={26} height={6} fill={sp('maya')} />
      <text x={97} y={115} textAnchor="middle" fontSize={10} fontWeight={900} fill={sp('ink')} fontFamily="'DM Sans',system-ui,sans-serif">30</text>
      <rect x={128} y={150} width={74} height={56} rx={16} fill={sp('chair')} /><rect x={135} y={157} width={60} height={36} rx={12} fill={sp('chair-seat')} />
    </svg>
  );
}
