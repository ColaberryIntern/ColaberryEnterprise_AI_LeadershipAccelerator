import React, { useEffect, useState } from 'react';
import { BOARD_AT } from './boardModel';
import { BOARD_EVENT, openBoard } from './boardApi';
import { useBoardBadge } from './useBoardBadge';
import './communityBoard.css';

/**
 * The Community Board on the map (C30, v7 R3): a cork noticeboard on two posts with a little roof and pinned notes, just south-east of
 * the fountain, a "Community Board" pill, and (v14 B5, C70) a red badge with the notes new since your last look plus new replies on
 * your posts, capped at "9+", from the server's counts. Focusable; Enter or a click walks you there and opens the board. Not a building.
 */
function useBadge(): number {
  const count = useBoardBadge();
  const [cleared, setCleared] = useState(false);
  useEffect(() => {
    const clear = () => setCleared(true); // opening the board marks it seen; the next poll brings the real number back
    window.addEventListener(BOARD_EVENT, clear);
    return () => window.removeEventListener(BOARD_EVENT, clear);
  }, []);
  useEffect(() => { setCleared(false); }, [count]);
  return cleared ? 0 : count;
}

export default function BoardSign(): React.ReactElement {
  const badge = useBadge();
  const go = () => openBoard({ walk: true });
  return (
    <g className="cm-cboard-sign" transform={`translate(${BOARD_AT.x} ${BOARD_AT.y})`} role="button" tabIndex={0} data-testid="cm-cboard-sign"
      aria-label={`Community Board${badge ? `, ${badge} new` : ''}`}
      onClick={(e) => { e.stopPropagation(); go(); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }}>
      {/* one target for the whole sign: the gap between the board and its pill is still the sign, not the lawn */}
      <rect className="hit" x={-52} y={-46} width={104} height={84} />
      <rect className="post" x={-20} y={-6} width={4} height={22} />
      <rect className="post" x={16} y={-6} width={4} height={22} />
      <path className="roof" d="M-26 -30 L0 -40 L26 -30 Z" />
      <rect className="face" x={-24} y={-30} width={48} height={26} rx={2} />
      <rect className="n1" x={-19} y={-26} width={11} height={9} transform="rotate(-6 -13 -21)" />
      <rect className="n2" x={-5} y={-27} width={11} height={10} transform="rotate(4 0 -22)" />
      <rect className="n3" x={9} y={-25} width={10} height={9} transform="rotate(-3 14 -20)" />
      <rect className="n2" x={-12} y={-15} width={12} height={8} transform="rotate(3 -6 -11)" />
      <g transform="translate(0 26)">
        <rect className="pill" x={-50} y={-9} width={100} height={18} rx={9} />
        <text className="pill-t" textAnchor="middle" y={4}>Community Board</text>
      </g>
      {badge > 0 && (
        <g transform="translate(24 -38)" data-testid="cm-cboard-badge">
          <circle className="badge" r={9} />
          <text className="badge-t" textAnchor="middle" y={3.5}>{badge > 9 ? '9+' : badge}</text>
        </g>
      )}
    </g>
  );
}
