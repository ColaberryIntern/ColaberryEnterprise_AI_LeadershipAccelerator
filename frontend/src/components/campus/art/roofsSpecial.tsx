import React from 'react';
import { art, ArtProps } from './artColor';

/**
 * The two one-off buildings (drawBuilding's amphi and arcade branches): the Events Hall amphitheater (four tiered arcs, a stage,
 * two flags) and the Game Room arcade (dark box, four neon windows, a neon sign, a red joystick). Prototype geometry; y = 0 is
 * the ground line. The neon sign's text is part of the drawing, so it is aria-hidden with the rest of the art.
 */
export function Amphitheater({ id }: ArtProps): React.ReactElement {
  const arcs = [3, 2, 1, 0].map((i) => {
    const r = 34 + i * 11;
    return <path key={i} d={`M${-r} -4A${r} ${r * 0.7} 0 0 1 ${r} -4`} stroke={art(i % 2 ? `${id}-d20` : id)} strokeWidth={8} fill="none" />;
  });
  return (
    <>
      {arcs}
      <rect x={-26} y={-16} width={52} height={16} rx={3} fill={art('wall')} stroke={art('wall-edge')} />
      <rect x={-20} y={-12} width={40} height={3} fill={art(id)} />
      {[-40, 40].map((x) => (
        <g key={x}>
          <line x1={x} y1={-4} x2={x} y2={-50} stroke={art('flagpole')} strokeWidth={1.5} />
          <path d={`M${x} -50l12 4-12 4z`} fill={art('flag')} />
        </g>
      ))}
    </>
  );
}

const NEON: [string, (hw: number) => number][] = [['neon-1', (hw) => -hw + 10], ['neon-2', (hw) => -hw + 30], ['neon-3', (hw) => hw - 48], ['neon-4', (hw) => hw - 28]];

export function Arcade({ w, h }: ArtProps): React.ReactElement {
  const hw = w / 2;
  return (
    <>
      <rect x={-hw} y={-h} width={w} height={h} rx={4} fill={art('arcade-body')} stroke={art('arcade-edge')} />
      {NEON.map(([c, x]) => <rect key={c} className="win" x={x(hw)} y={-h + 12} width={14} height={14} rx={2} fill={art(c)} opacity={0.9} />)}
      <rect className="neon" x={-hw - 6} y={-h - 20} width={w + 12} height={22} rx={6} fill={art('neon-sign')} stroke={art('neon-1')} strokeWidth={2} />
      <text className="neon-t" x={0} y={-h - 5} textAnchor="middle" fontSize={11} fontWeight={900} fill={art('neon-text')} letterSpacing={2}>GAME ROOM</text>
      <path d="M-9 0V-14a9 9 0 0 1 18 0V0Z" fill={art('arcade')} />
      <circle cx={hw - 18} cy={-12} r={5} fill={art('flag')} />
      <rect x={hw - 19.5} y={-24} width={3} height={12} fill={art('joystick')} />
      <circle cx={hw - 18} cy={-25} r={3.5} fill={art('flag')} />
    </>
  );
}
