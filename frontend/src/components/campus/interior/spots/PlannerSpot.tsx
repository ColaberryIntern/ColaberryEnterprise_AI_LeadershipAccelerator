import React from 'react';
import { sp, NameTent, Chair, Mug } from './spotParts';

const F = "'DM Sans',system-ui,sans-serif";

/**
 * C76 (Ali 2026-10-27: "Schedule room needs furniture ... make it easy to access their Today content sitting directly in the chair"):
 * the Schedule's planning desk. A week planner open on the desk with today ringed in red, a desk clock, a pencil cup, the mug,
 * your name card, your chair and a hanging "Start here" sign. Decorative: no dates or items are drawn (the real ones are on
 * the walls); sitting down opens your next Today item.
 */
export default function PlannerSpot({ name }: { name: string }): React.ReactElement {
  const days = [0, 1, 2, 3, 4, 5, 6];
  return (
    <svg viewBox="0 0 340 250" aria-hidden="true">
      <ellipse cx={170} cy={236} rx={160} ry={12} fill={sp('shadow')} />
      <line x1={120} y1={0} x2={120} y2={16} stroke={sp('lamp-arm')} strokeWidth={2} /><line x1={220} y1={0} x2={220} y2={16} stroke={sp('lamp-arm')} strokeWidth={2} />
      <rect x={96} y={16} width={148} height={30} rx={8} fill={sp('red')} />
      <text x={170} y={37} textAnchor="middle" fontSize={15} fontWeight={800} fill={sp('card')} fontFamily={F}>Start here &#8594;</text>
      {/* the week planner, open, today ringed */}
      <polygon points="60,64 280,64 292,116 48,116" fill={sp('paper')} stroke={sp('rule')} />
      <line x1={170} y1={64} x2={170} y2={116} stroke={sp('rule')} strokeWidth={2} />
      <rect x={60} y={64} width={220} height={8} fill={sp('red')} />
      {days.map((i) => {
        const x = 66 + i * 31;
        return (
          <g key={i}>
            <rect x={x} y={78} width={24} height={30} rx={3} fill={sp('card')} stroke={sp('rule')} />
            <rect x={x + 4} y={84} width={16} height={3} fill={sp('rule')} /><rect x={x + 4} y={91} width={11} height={3} fill={sp('rule')} />
          </g>
        );
      })}
      <rect x={95} y={75} width={30} height={36} rx={5} fill="none" stroke={sp('red')} strokeWidth={3} />
      {/* the desk clock */}
      <circle cx={306} cy={98} r={18} fill={sp('card')} stroke={sp('ink')} strokeWidth={3} />
      <line x1={306} y1={98} x2={306} y2={86} stroke={sp('ink')} strokeWidth={3} strokeLinecap="round" />
      <line x1={306} y1={98} x2={315} y2={102} stroke={sp('red')} strokeWidth={2.5} strokeLinecap="round" />
      <rect x={296} y={114} width={20} height={6} rx={2} fill={sp('ink')} />
      {/* the pencil cup */}
      <rect x={16} y={98} width={18} height={22} rx={3} fill={sp('ink')} />
      <line x1={20} y1={98} x2={17} y2={80} stroke={sp('code-amber')} strokeWidth={3} /><line x1={26} y1={98} x2={28} y2={78} stroke={sp('red')} strokeWidth={3} />
      <line x1={31} y1={98} x2={36} y2={83} stroke={sp('code-green')} strokeWidth={3} />
      {/* the desk */}
      <polygon points="10,120 330,120 338,138 2,138" fill={sp('wood')} /><rect x={2} y={138} width={336} height={16} fill={sp('wood-edge')} />
      <rect x={14} y={154} width={12} height={76} fill={sp('wood-leg')} /><rect x={314} y={154} width={12} height={76} fill={sp('wood-leg')} />
      <Mug x={262} y={104} />
      <NameTent x={226} y={124} name={name} />
      <Chair x={170} y={150} />
    </svg>
  );
}
