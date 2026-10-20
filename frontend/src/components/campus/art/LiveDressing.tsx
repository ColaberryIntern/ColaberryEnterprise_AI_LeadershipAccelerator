import React from 'react';
import { art } from './artColor';
import type { CampusBuilding } from '../campusMap';
import type { Pt } from '../walkPath';

/**
 * The campus at Colaberry Live (C11b, the prototype's setupLiveMap): over each building that is really on air (broadcast
 * discovery), two sweeping spotlights and pulsing rings, and a gold dotted path from where you stand to its door. The prototype's
 * crowd of walking dots was random, so it is not drawn (the real-data rule): the building's real head count is on its chip.
 * The map turns to evening in CSS (.is-evening). Beams and rings stop with reduce motion.
 */
export function LiveBack({ buildings, path }: { buildings: CampusBuilding[]; path: Pt[] | null }): React.ReactElement {
  return (
    <g aria-hidden="true" data-testid="cm-beams">
      <defs>
        <linearGradient id="cm-beam" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={art('beam')} stopOpacity={0.9} /><stop offset="1" stopColor={art('beam')} stopOpacity={0} />
        </linearGradient>
      </defs>
      {path && path.length > 1 && <path className="cm-live-path" d={`M${path.map((p) => `${p.x} ${p.y}`).join('L')}`} data-testid="cm-live-path" />}
      {buildings.map((b) => (
        <g key={b.id} transform={`translate(${b.pos.x} ${b.pos.y - b.pos.h - 24})`}>
          <polygon className="cm-beam b1" points="-5,0 5,0 70,-320 -70,-320" fill="url(#cm-beam)" />
          <polygon className="cm-beam b2" points="-5,0 5,0 70,-320 -70,-320" fill="url(#cm-beam)" />
        </g>
      ))}
    </g>
  );
}

export function LiveFront({ buildings }: { buildings: CampusBuilding[] }): React.ReactElement {
  return (
    <g aria-hidden="true">
      {buildings.flatMap((b) => [0, 1, 2].map((i) => (
        <circle key={`${b.id}-${i}`} className="cm-wave" cx={b.pos.x} cy={b.pos.y - b.pos.h / 2} r={22} style={{ animationDelay: `${i * 0.8}s` }} />
      )))}
    </g>
  );
}
