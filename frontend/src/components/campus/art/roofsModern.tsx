import React from 'react';
import { art, ArtProps } from './artColor';

/**
 * The business district's buildings (drawBuilding's office and pavilion branches): a glass office tower with window bands,
 * mullions, a cornice in the building color, a rooftop box and antenna, and a lobby with a double door; and the glass pavilion
 * with three lit demo screens. Prototype geometry, y = 0 is the ground line.
 */
export function OfficeTower({ id, w, h }: ArtProps): React.ReactElement {
  const hw = w / 2;
  const bands: React.ReactElement[] = [];
  for (let yy = -h + 10; yy < -20; yy += 13) bands.push(<rect key={`b${yy}`} className="win" x={-hw + 5} y={yy} width={w - 10} height={8} fill={art('office-glass')} />);
  const mullions: React.ReactElement[] = [];
  const step = (w - 10) / 6;
  for (let xx = -hw + 5 + step; xx < hw - 6; xx += step) mullions.push(<rect key={`m${xx}`} x={xx - 1} y={-h + 8} width={2} height={h - 28} fill={art('office-wall')} />);
  return (
    <>
      <rect x={-hw} y={-h} width={w} height={h} rx={2} fill={art('office-wall')} stroke={art('office-edge')} />
      {bands}
      {mullions}
      <rect x={-hw - 3} y={-h - 7} width={w + 6} height={8} rx={1} fill={art(id)} />
      <rect x={-hw * 0.45} y={-h - 15} width={w * 0.32} height={9} fill={art('office-edge')} />
      <line x1={hw * 0.4} y1={-h - 7} x2={hw * 0.4} y2={-h - 26} stroke={art('antenna')} strokeWidth={1.5} />
      <rect x={-hw} y={-20} width={w} height={20} fill={art('office-lobby')} />
      <rect x={-14} y={-18} width={28} height={18} fill={art('office-door')} stroke={art('white')} strokeWidth={1} />
      <line x1={0} y1={-18} x2={0} y2={0} stroke={art('white')} strokeWidth={1} />
    </>
  );
}

const SCREENS: [number, number, string][] = [[8, 12, 'screen-1'], [44, 12, 'screen-2'], [80, 12, 'screen-3']];

export function Pavilion({ id, w, h }: ArtProps): React.ReactElement {
  const hw = w / 2;
  const mullions: React.ReactElement[] = [];
  for (let xx = -hw + 16; xx < hw; xx += 16) mullions.push(<line key={`m${xx}`} x1={xx} y1={-h} x2={xx} y2={0} stroke={art('white')} strokeWidth={1.5} />);
  return (
    <>
      <rect x={-hw} y={-h} width={w} height={h} rx={2} fill={art('pavilion-wall')} stroke={art('office-glass')} />
      {mullions}
      {SCREENS.map(([dx, dy, c]) => (
        <g key={c}>
          <rect x={-hw + dx} y={-h + dy} width={30} height={22} rx={2} fill={art('screen-frame')} />
          <rect className="win" x={-hw + dx + 3} y={-h + dy + 3} width={24} height={16} fill={art(c)} />
        </g>
      ))}
      <rect x={-hw - 6} y={-h - 6} width={w + 12} height={7} rx={1} fill={art(id)} />
      <rect x={-14} y={-20} width={28} height={20} fill={art('office-door')} stroke={art('white')} strokeWidth={1} />
    </>
  );
}
