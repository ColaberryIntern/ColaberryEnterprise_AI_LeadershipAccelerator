import React from 'react';
import { art } from '../../art/artColor';

/** A spot color (campusArtTokens.css --cm-art-sp-*; 'red' is the brand red). The spots never name a hex. */
export const sp = (k: string): string => (k === 'red' ? art('red') : art(`sp-${k}`));
const F = "'DM Sans',system-ui,sans-serif";

/** Your name card on the furniture: the first name in caps (v6 D1: displayFirstName). The tent's top edge sits at y. */
export function NameTent({ x, y, name }: { x: number; y: number; name: string }): React.ReactElement {
  return (
    <g data-testid="cm-spot-name">
      <polygon points={`${x - 12},${y + 12} ${x + 12},${y + 12} ${x + 8},${y} ${x - 8},${y}`} fill={sp('card')} stroke={sp('card-edge')} />
      <text x={x} y={y + 9} textAnchor="middle" fontSize={7} fontWeight={800} fill={sp('red')} fontFamily={F}>{name.slice(0, 8)}</text>
    </g>
  );
}

/** Your chair, its back to you; x is its center, y its top. */
export function Chair({ x, y }: { x: number; y: number }): React.ReactElement {
  return (
    <g>
      <rect x={x - 42} y={y} width={84} height={64} rx={18} fill={sp('chair')} /><rect x={x - 34} y={y + 8} width={68} height={44} rx={14} fill={sp('chair-seat')} />
      <rect x={x - 4} y={y + 64} width={8} height={16} fill={sp('chair')} /><ellipse cx={x} cy={y + 84} rx={34} ry={5} fill={sp('chair')} />
    </g>
  );
}

/** A potted plant; (x, y) is the pot's top-left. */
export function Plant({ x, y }: { x: number; y: number }): React.ReactElement {
  return (
    <g>
      <path d={`M${x} ${y} h22 l-3 14 h-16z`} fill={sp('pot')} />
      <ellipse cx={x + 5} cy={y - 8} rx={8} ry={11} fill={sp('leaf-1')} /><ellipse cx={x + 17} cy={y - 10} rx={7} ry={12} fill={sp('leaf-2')} />
      <ellipse cx={x + 11} cy={y - 16} rx={6} ry={10} fill={sp('leaf-3')} />
    </g>
  );
}

/** The red Colaberry mug with steam; (x, y) is the cup's top-left. */
export function Mug({ x, y }: { x: number; y: number }): React.ReactElement {
  return (
    <g>
      <g className="steam">
        <path d={`M${x + 6} ${y - 4} q-4 -6 0 -12 q4 -6 0 -12`} stroke={sp('steam')} strokeWidth={2} fill="none" opacity={0.7} />
        <path d={`M${x + 14} ${y - 4} q-4 -6 0 -12 q4 -6 0 -12`} stroke={sp('steam')} strokeWidth={2} fill="none" opacity={0.7} />
      </g>
      <path d={`M${x} ${y} h20 v16 a4 4 0 0 1 -4 4 h-12 a4 4 0 0 1 -4 -4z`} fill={sp('red')} />
      <path d={`M${x + 20} ${y + 4} q8 0 8 6 q0 6 -8 6`} stroke={sp('red')} strokeWidth={3} fill="none" />
    </g>
  );
}
