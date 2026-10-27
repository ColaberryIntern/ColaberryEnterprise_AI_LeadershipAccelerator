import React from 'react';
import type { BuildingId, CampusBuilding } from '../campusMap';
import { GATE } from './grounds';

/**
 * The two Explorer signposts on the map (v13), drawn as the prototype draws them (docs/design/campus/colaberry-campus-v13.html, the
 * tower-flag IIFE and drawGate). The click stops before the map's ground handler; neither is a building.
 *  - C51 (T3) the flag: a red speech-bubble pill above the Schedule tower's spire, pointing down at it.
 *  - C52 (T4) the gate sign: a red pill under the Main Gate's arch.
 * C77 (Ali 2026-10-27: "before you can start learning you have to get a schedule ... everyone needs to start with the schedule", then
 * Today): both say START HERE and walk you into the Schedule, exactly as a click on the tower does (the map's own pick), where the
 * big board shows what is coming up and the left board and planning desk are Today. They used to open the Today page and skip it.
 * Art tokens only (campusMapArt.css). Rendered by CampusWorldMap for Explorers.
 */
type Walk = (id: BuildingId) => void;

function walkHandlers(onWalk: Walk): { onClick: (e: React.MouseEvent) => void; onKeyDown: (e: React.KeyboardEvent) => void } {
  const go = () => onWalk('tower');
  return {
    onClick: (e) => { e.stopPropagation(); go(); },
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); go(); } },
  };
}

export default function TodayFlag({ tower, onWalk }: { tower: Pick<CampusBuilding, 'pos'>; onWalk: Walk }): React.ReactElement {
  const h = tower.pos.h;
  return (
    <g className="cm-today-flag" transform={`translate(${tower.pos.x} ${tower.pos.y})`} role="button" tabIndex={0}
      aria-label="Start here: walk into the Schedule" data-testid="cm-today-flag" {...walkHandlers(onWalk)}>
      <rect className="pill" x={-46} y={-h - 82} width={92} height={22} rx={11} />
      <path className="pointer" d={`M-5 ${-h - 61}L0 ${-h - 54}L5 ${-h - 61}Z`} />
      <text className="t" textAnchor="middle" y={-h - 67}>START HERE</text>
    </g>
  );
}

export function GateTodaySign({ onWalk }: { onWalk: Walk }): React.ReactElement {
  return (
    <g className="cm-gate-today" transform={`translate(${GATE.x} ${GATE.y})`} role="button" tabIndex={0}
      aria-label="Start here: walk to the Schedule" data-testid="cm-gate-today" {...walkHandlers(onWalk)}>
      <rect className="pill" x={-80} y={22} width={160} height={20} rx={10} />
      <text className="t" textAnchor="middle" y={36}>START HERE &rarr; SCHEDULE</text>
    </g>
  );
}
