import React from 'react';
import { art } from './artColor';

/**
 * The Main Gate, ported from the prototype's drawGate: two dark pillars, a curved arch and the MAIN GATE lettering, drawn in
 * the gate building's local frame (origin = the gate's ground point, 500,640 in the world). The keyboard wrapper is the
 * gate "building" in CampusWorldMap (Explorers and staff); this is the picture, aria-hidden. The transparent rect is the
 * footprint so a click anywhere under the arch opens the gate (found in C5: clicks fell through the outline).
 */
export function MainGateArt(): React.ReactElement {
  return (
    <g aria-hidden="true" className="dimmable" data-testid="cm-gate-pillars">
      {[-34, 34].map((dx) => (
        <g key={dx}>
          <rect x={dx - 6} y={14 - 34} width={12} height={34} rx={2} fill={art('gate-post')} />
          <rect x={dx - 8} y={14 - 38} width={16} height={6} rx={2} fill={art('gate-cap')} />
        </g>
      ))}
      <path d="M-34 -22Q0 -48 34 -22" stroke={art('gate-cap')} strokeWidth={4} fill="none" />
      <text x={0} y={-30} textAnchor="middle" fontSize={6} fontWeight={700} letterSpacing={1.5} fill={art('gate-cap')}>MAIN GATE</text>
      <rect className="cm-hit" x={-40} y={-48} width={80} height={64} />
    </g>
  );
}

/**
 * Maya's welcome desk beside the gate (prototype #mayaTok): a desk, her gold-ringed initials token and a WELCOME DESK pill.
 * Shown only when the server listed her desk for this viewer (Explorers and staff); clicking opens her desk card.
 */
export function MayaDeskToken({ onOpen }: { onOpen: () => void }): React.ReactElement {
  return (
    <g transform="translate(588,638)" role="button" tabIndex={0} aria-label="Maya, AI admissions, welcome desk" className="cm-staff-tok" data-testid="cm-maya-desk"
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}>
      <rect x={-16} y={2} width={32} height={9} rx={2} fill={art('desk')} />
      <ellipse cx={0} cy={13} rx={16} ry={3} fill={art('token-shadow')} />
      <circle className="ring" cx={0} cy={-6} r={10} fill={art('maya')} stroke={art('gold-ring')} strokeWidth={2.5} />
      <text x={0} y={-3} textAnchor="middle" fontSize={7.5} fontWeight={800} fill={art('white')}>MA</text>
      <rect x={-26} y={-29} width={52} height={11} rx={5.5} fill={art('maya')} />
      <text x={0} y={-21} textAnchor="middle" fontSize={6} fontWeight={800} fill={art('white')} letterSpacing={0.4}>WELCOME DESK</text>
    </g>
  );
}
