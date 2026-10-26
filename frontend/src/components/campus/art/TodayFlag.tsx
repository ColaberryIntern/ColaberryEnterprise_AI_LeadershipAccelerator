import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { CampusBuilding } from '../campusMap';
import { GATE } from './grounds';

/**
 * The two Explorer signposts to Today on the map (v13), drawn as the prototype draws them (docs/design/campus/colaberry-campus-v13.html,
 * the tower-flag IIFE and drawGate). Today is an Explorer's home base, so both open it straight away: a click or Enter navigates and
 * never starts a walk (the click stops before the map's ground handler, and neither is a building, so the walker never sees them).
 *  - C51 (T3) the TODAY flag: a red speech-bubble pill above the Schedule tower's spire, pointing down at it.
 *  - C52 (T4) the START HERE -> TODAY sign: a red pill under the Main Gate's arch.
 * Art tokens only (campusMapArt.css). Rendered by CampusWorldMap for Explorers.
 */
export const TODAY_FLAG_HREF = '/portal/today?stay=1';

function useOpenToday(): { onClick: (e: React.MouseEvent) => void; onKeyDown: (e: React.KeyboardEvent) => void } {
  const navigate = useNavigate();
  const go = () => navigate(TODAY_FLAG_HREF);
  return {
    onClick: (e) => { e.stopPropagation(); go(); },
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); go(); } },
  };
}

export default function TodayFlag({ tower }: { tower: Pick<CampusBuilding, 'pos'> }): React.ReactElement {
  const h = tower.pos.h;
  return (
    <g className="cm-today-flag" transform={`translate(${tower.pos.x} ${tower.pos.y})`} role="button" tabIndex={0}
      aria-label="Today lives in the Schedule tower: open Today" data-testid="cm-today-flag" {...useOpenToday()}>
      <rect className="pill" x={-34} y={-h - 82} width={68} height={22} rx={11} />
      <path className="pointer" d={`M-5 ${-h - 61}L0 ${-h - 54}L5 ${-h - 61}Z`} />
      <text className="t" textAnchor="middle" y={-h - 67}>TODAY</text>
    </g>
  );
}

export function GateTodaySign(): React.ReactElement {
  return (
    <g className="cm-gate-today" transform={`translate(${GATE.x} ${GATE.y})`} role="button" tabIndex={0}
      aria-label="Start here: open Today" data-testid="cm-gate-today" {...useOpenToday()}>
      <rect className="pill" x={-64} y={22} width={128} height={20} rx={10} />
      <text className="t" textAnchor="middle" y={36}>START HERE &rarr; TODAY</text>
    </g>
  );
}
