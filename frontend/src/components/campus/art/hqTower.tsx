import React from 'react';
import { art } from './artColor';
import { TOWER_BAND } from '../hq/HqOutside';

/**
 * C83: the career building on the map is the Colaberry Tower, the same building the HQ scene draws when you open it (Ali,
 * 2026-10-28: "It should not be two different buildings"). HqOutside's tower at map size: brass spire, the red C crown, the
 * PH band, banded floors with gold windows, the navy COLABERRY base and its brass door. C89 (Ali, 2026-10-29: "bring the
 * blue back"): the bands are navy at every hour, as in the tower scene, so the building never turns cream by day. Same footprint as the office sprite it replaces, y = 0 is
 * the ground line, so the label, badges and pins do not move.
 */
const BANDS = 10;
const WINDOWS = 7;
const BASE_H = 26;
const CROWN_H = 16;
const PH_H = 8;

export function HqTowerArt({ w, h }: { w: number; h: number }): React.ReactElement {
  const hw = w / 2;
  const band = art(TOWER_BAND);
  const crownY = -h + 4;
  const phY = crownY + CROWN_H;
  const floorsY = phY + PH_H;
  const bandH = (-BASE_H - floorsY) / BANDS;
  const row = (y: number, x: number, bw: number, bh: number, i: number) => {
    const ww = (bw - 8) / WINDOWS;
    return Array.from({ length: WINDOWS }, (_v, j) => (
      <rect key={j} x={x + 4 + j * ww + 0.8} y={y + 1.6} width={ww - 1.6} height={bh - 3.2} fill={art('hq-win')} opacity={(i + j) % 4 === 0 ? 0.75 : 1} />
    ));
  };
  return (
    <g data-testid="cm-hq-map-tower">
      <polygon points={`0,${-h - 22} 6,${crownY} -6,${crownY}`} fill={art('hq-brass')} />
      <rect x={-17} y={crownY} width={34} height={CROWN_H} fill={band} stroke={art('hq-brass')} strokeWidth={0.8} />
      <circle cx={0} cy={crownY + CROWN_H / 2} r={5.5} fill={art('red')} />
      <text x={0} y={crownY + CROWN_H / 2 + 3} textAnchor="middle" fontSize={8} fontWeight={800} fill={art('cloud')}>C</text>
      <g>
        <rect x={-hw + 8} y={phY} width={w - 16} height={PH_H} fill={band} stroke={art('hq-brass')} strokeWidth={0.6} />
        {row(phY, -hw + 8, w - 16, PH_H, 0)}
      </g>
      {Array.from({ length: BANDS }, (_v, i) => {
        const y = floorsY + i * bandH;
        return (
          <g key={i} className="win">
            <rect x={-hw} y={y} width={w} height={bandH} fill={band} stroke={art('hq-brass')} strokeWidth={0.6} />
            {row(y, -hw, w, bandH, i + 1)}
          </g>
        );
      })}
      <rect x={-hw - 4} y={-BASE_H} width={w + 8} height={BASE_H} fill={art('hq-navy')} />
      <rect x={-hw - 4} y={-BASE_H} width={w + 8} height={2.5} fill={art('hq-brass')} />
      <text x={0} y={-BASE_H + 10} textAnchor="middle" fontSize={6.5} fontWeight={800} letterSpacing={1.6} fill={art('hq-brass2')}>COLABERRY</text>
      <rect x={-9} y={-13} width={18} height={13} fill={art('hq-brass2')} />
      <rect x={-7.5} y={-11.5} width={15} height={11.5} fill={art('hq-sky')} opacity={0.85} />
      <line x1={0} y1={-11.5} x2={0} y2={0} stroke={art('hq-brass3')} strokeWidth={1} />
    </g>
  );
}
