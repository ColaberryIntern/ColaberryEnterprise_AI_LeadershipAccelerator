import React from 'react';
import { art, ArtProps } from './artColor';

/**
 * The prototype's "classic" buildings (drawBuilding's default branch): a cream wall with a grid of windows (skipping the door
 * column on the bottom row), one of five roofs, and an arched door in the building's darkest shade. Geometry is the prototype's,
 * unchanged; y = 0 is the ground line and the body spans -h..0.
 */
export function WallWithWindows({ w, h }: ArtProps): React.ReactElement {
  const hw = w / 2;
  const cols = Math.max(2, Math.floor(w / 22));
  const rows = Math.max(1, Math.floor((h - 26) / 20));
  const wins: React.ReactElement[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = -hw + 10 + c * ((w - 20) / cols) + ((w - 20) / cols - 9) / 2;
      const y = -h + 10 + r * 20;
      if (Math.abs(x + 4.5) < 12 && r === rows - 1) continue; // the door column
      wins.push(<rect key={`${r}-${c}`} className="win" x={x} y={y} width={9} height={12} rx={1.5} fill={art('window')} />);
    }
  }
  return (
    <>
      <rect x={-hw} y={-h} width={w} height={h} rx={3} fill={art('wall')} stroke={art('wall-edge')} />
      {wins}
    </>
  );
}

export function Door({ id }: { id: string }): React.ReactElement {
  return <path d="M-8 0V-13a8 8 0 0 1 16 0V0Z" fill={art(`${id}-d35`)} />;
}

export function PedimentRoof({ id, w, h }: ArtProps): React.ReactElement {
  const hw = w / 2;
  return (
    <>
      <polygon className="roof" points={`${-hw - 8},${-h} ${hw + 8},${-h} 0,${-h - 28}`} fill={art(id)} />
      <rect x={-hw - 8} y={-h - 2} width={w + 16} height={6} fill={art(`${id}-d25`)} />
      <rect x={-hw - 4} y={-3} width={w + 8} height={5} fill={art('step')} />
    </>
  );
}

export function GableRoof({ id, w, h }: ArtProps): React.ReactElement {
  const hw = w / 2;
  return (
    <>
      <polygon className="roof" points={`${-hw - 6},${-h} 0,${-h - 32} ${hw + 6},${-h}`} fill={art(id)} />
      <rect x={hw - 28} y={-h - 24} width={10} height={16} fill={art(`${id}-d30`)} />
    </>
  );
}

export function TowerRoof({ id, w, h }: ArtProps): React.ReactElement {
  const hw = w / 2;
  return (
    <>
      <polygon className="roof" points={`${-hw - 5},${-h} 0,${-h - 34} ${hw + 5},${-h}`} fill={art(id)} />
      <circle cx={0} cy={-h + 20} r={13} fill={art('clock-face')} stroke={art(id)} strokeWidth={3} />
      <line x1={0} y1={-h + 20} x2={0} y2={-h + 12} stroke={art('clock-hand')} strokeWidth={2} strokeLinecap="round" />
      <line x1={0} y1={-h + 20} x2={6} y2={-h + 22} stroke={art('clock-hand')} strokeWidth={2} strokeLinecap="round" />
    </>
  );
}

export function FlatRoof({ id, w, h }: ArtProps): React.ReactElement {
  const hw = w / 2;
  return <rect className="roof" x={-hw - 4} y={-h - 8} width={w + 8} height={10} rx={2} fill={art(id)} />;
}

export function DomeRoof({ id, w, h }: ArtProps): React.ReactElement {
  const hw = w / 2;
  const r = w * 0.36;
  return (
    <>
      <path className="roof" d={`M${-r} ${-h}A${r} ${r} 0 0 1 ${r} ${-h}Z`} fill={art(id)} />
      <rect x={-3} y={-h - r + 2} width={6} height={r - 4} fill={art('dome-slit')} />
      <rect x={-hw - 3} y={-h - 3} width={w + 6} height={5} fill={art(`${id}-d25`)} />
    </>
  );
}
