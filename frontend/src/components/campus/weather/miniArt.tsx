import React from 'react';
import { art } from '../art/artColor';

/**
 * The neighbours you see through a room's window (Basecamp C45, room fix F5; the v12 design's miniBldg / miniLandmark), as small
 * SVGs so each building reads as itself: its height from the map's real w/h, its roof by kind in its own map colour, a grid of
 * window panes (lit at dusk and night), and its wall colour (glass blue for office / pavilion, dark purple for the arcade, else
 * warm white with a thin outline). The four landmarks (pond, Quad fountain, Community Board, Main Gate) have their own drawings.
 * Colours are art tokens only.
 */
const W = 100;

export function MiniBuilding({ id, kind, ratio, lit }: { id: string; kind: string; ratio: number; lit: boolean }): React.ReactElement {
  const c = art(id);
  if (kind === 'amphi') {
    return (
      <svg viewBox="-60 -50 220 70" data-mini={id}>
        <path d="M-50 15A100 60 0 0 1 150 15" stroke={c} strokeWidth={16} fill="none" />
        <path d="M-25 15A75 44 0 0 1 125 15" stroke={art(`${id}-d20`)} strokeWidth={14} fill="none" />
        <rect x={25} y={-2} width={50} height={17} fill={art('mini-wall')} />
      </svg>
    );
  }
  const H = Math.round(W * ratio);
  const wall = kind === 'office' || kind === 'pavilion' ? art('mini-glass') : kind === 'arcade' ? art('mini-arcade') : art('mini-wall');
  const cols = Math.max(2, Math.round(W / 22)), rows = Math.max(1, Math.round((H - 20) / 22));
  const panes: React.ReactElement[] = [];
  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      panes.push(<rect key={`${i}-${j}`} x={8 + (j * (W - 16)) / cols} y={8 + i * ((H - 14) / rows)} width={(W - 16) / cols - 5} height={(H - 14) / rows - 6} rx={1}
        fill={lit ? art('lit') : art('mini-win')} opacity={lit && (i + j) % 3 === 0 ? 0.35 : 1} />);
    }
  }
  let roof: React.ReactElement;
  if (kind === 'pediment' || kind === 'gable' || kind === 'tower') roof = <polygon points={`-6,0 ${W + 6},0 ${W / 2},${-Math.min(40, W * 0.3)}`} fill={c} />;
  else if (kind === 'dome') roof = <path d={`M${W * 0.15} 0A${W * 0.35} ${W * 0.35} 0 0 1 ${W * 0.85} 0Z`} fill={c} />;
  else if (kind === 'arcade') roof = <rect x={-4} y={-16} width={W + 8} height={16} rx={4} fill={art('mini-arcade-roof')} stroke={art('mini-neon')} strokeWidth={3} />;
  else roof = <rect x={-3} y={-8} width={W + 6} height={9} fill={c} />;
  return (
    <svg viewBox={`-8 -44 116 ${H + 48}`} data-mini={id} data-kind={kind}>
      <rect width={W} height={H} fill={wall} stroke={art('mini-edge')} />
      {panes}
      {roof}
    </svg>
  );
}

export function MiniLandmark({ kind }: { kind: string }): React.ReactElement {
  if (kind === 'pond') {
    return <svg viewBox="0 0 120 30" data-mini="pond"><ellipse cx={60} cy={18} rx={58} ry={12} fill={art('mini-pond')} /><ellipse cx={60} cy={16} rx={50} ry={8} fill={art('mini-pond-hi')} /></svg>;
  }
  if (kind === 'fountain') {
    return (
      <svg viewBox="0 0 80 50" data-mini="fountain">
        <ellipse cx={40} cy={42} rx={38} ry={8} fill={art('mini-stone')} /><ellipse cx={40} cy={40} rx={30} ry={5} fill={art('mini-water')} />
        <path d="M40 38V10M40 12q-12 6-16 22M40 12q12 6 16 22" stroke={art('mini-spray')} strokeWidth={3} fill="none" />
      </svg>
    );
  }
  if (kind === 'board') {
    return (
      <svg viewBox="0 0 70 60" data-mini="board">
        <rect x={10} y={20} width={4} height={40} fill={art('mini-post')} /><rect x={56} y={20} width={4} height={40} fill={art('mini-post')} />
        <rect x={4} y={8} width={62} height={30} fill={art('mini-cork')} stroke={art('mini-cork-edge')} strokeWidth={3} />
        <rect x={12} y={14} width={12} height={10} fill={art('in-note-1')} /><rect x={30} y={16} width={12} height={10} fill={art('in-note-2')} /><rect x={48} y={13} width={12} height={10} fill={art('in-note-3')} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 80 60" data-mini="gate">
      <rect x={12} y={16} width={8} height={44} fill={art('mini-gate')} /><rect x={60} y={16} width={8} height={44} fill={art('mini-gate')} />
      <path d="M12 18Q40 0 68 18" stroke={art('mini-gate-arch')} strokeWidth={4} fill="none" />
    </svg>
  );
}
