import React, { useEffect, useState } from 'react';
import { BOARD_AT } from './boardModel';
import { BOARD_EVENT, openBoard } from './boardApi';
import { badgeLabel, useBoardBadge } from './useBoardBadge';
import { useTvPeek } from '../now/useTvPeek';
import { thumbOf } from '../now/tvPlaylist';
import './communityBoard.css';
import './boardPhone.css';

/**
 * Colaberry Now on the map (Campus v20 N1, Basecamp C131; the prototype's drawBoard in docs/design/campus/colaberry-campus-v20.html):
 * not a corkboard any more but a giant phone, the thing people are glued to, standing on a small base at the board's spot on the Quad.
 *
 *  - its screen shows the current Colaberry TV short's thumbnail with a red "● TV" badge, changing every 6 s (static with reduced
 *    motion); NEVER a video or sound on the map;
 *  - three notification cards slide in on a loop (a win, a question and an intro: colour dots only, no invented text);
 *  - a red badge with what's new: new posts since your last look plus new replies on yours (the server's counts), capped at "9+";
 *  - a soft pulsing ring at the base and the label "Colaberry Now".
 * Focusable; Enter or a click walks you there and opens Colaberry Now (the board's walk-and-open, unchanged). Not a building.
 */
export const PHONE_ROTATE_MS = 6000;

function useBadge(): number {
  const count = useBoardBadge();
  const [cleared, setCleared] = useState(false);
  useEffect(() => {
    const clear = () => setCleared(true); // opening Colaberry Now marks the board seen; the next poll brings the real number back
    window.addEventListener(BOARD_EVENT, clear);
    return () => window.removeEventListener(BOARD_EVENT, clear);
  }, []);
  useEffect(() => { setCleared(false); }, [count]);
  return cleared ? 0 : count;
}

const centralClock = (): string =>
  new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }).replace(/\s?[AP]M$/, '');

export default function BoardSign({ reduceMotion = false }: { reduceMotion?: boolean }): React.ReactElement {
  const badge = useBadge();
  const shorts = useTvPeek();
  const [i, setI] = useState(0);
  const [clock, setClock] = useState(centralClock);
  useEffect(() => {
    if (reduceMotion || shorts.length < 2) return undefined;
    const id = window.setInterval(() => { setI((x) => (x + 1) % shorts.length); setClock(centralClock()); }, PHONE_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [reduceMotion, shorts.length]);
  const cur = shorts.length ? shorts[i % shorts.length] : null;
  const go = () => openBoard({ walk: true });
  return (
    <g className={`cm-cboard-sign cm-cnow-phone${reduceMotion ? ' is-still' : ''}`} transform={`translate(${BOARD_AT.x} ${BOARD_AT.y})`} role="button" tabIndex={0}
      data-testid="cm-cboard-sign" aria-label={`Colaberry Now: what is going on at Colaberry, with Colaberry TV${badge ? `, ${badge} new` : ''}`}
      onClick={(e) => { e.stopPropagation(); go(); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }}>
      {/* one target for the whole phone: the gap between the phone and its label is still the phone, not the lawn */}
      <rect className="hit" x={-60} y={-122} width={120} height={152} />
      <ellipse className="ph-shadow" cx={0} cy={4} rx={38} ry={6} />
      <ellipse className="ph-ring" cx={0} cy={2} rx={30} ry={6} data-testid="cm-cnow-ring" />
      <rect className="ph-base" x={-9} y={-8} width={18} height={10} rx={3} />
      <rect className="ph-body" x={-26} y={-112} width={52} height={106} rx={11} />
      <clipPath id="cm-ph-clip"><rect x={-22} y={-107} width={44} height={96} rx={8} /></clipPath>
      <g clipPath="url(#cm-ph-clip)">
        <rect className="ph-screen" x={-22} y={-107} width={44} height={96} />
        <rect className="ph-thumb-ph" x={-22} y={-96} width={44} height={46} />
        {cur && <image href={thumbOf(cur.youtube_id)} x={-22} y={-96} width={44} height={46} preserveAspectRatio="xMidYMid slice" data-testid="cm-cnow-thumb" data-yt={cur.youtube_id} />}
        <circle className="ph-play" cx={0} cy={-73} r={8} />
        <path className="ph-play-t" d="M-2.5 -77 l7 4 -7 4z" />
        <rect className="ph-bar" x={-22} y={-107} width={44} height={11} />
        <text className="ph-clock" x={-18} y={-99}>{clock}</text>
        <rect className="ph-notch" x={-6} y={-105} width={12} height={4} rx={2} />
        <rect className="ph-tv" x={-19} y={-93} width={20} height={7} rx={2} />
        <text className="ph-tv-t" x={-9} y={-88} textAnchor="middle">● TV</text>
        {(['win', 'q', 'intro'] as const).map((k, n) => (
          <g key={k} className={`phn phn-${k}`} style={{ animationDelay: `${n * 1.2}s` }}>
            <rect className="phn-card" x={-20} y={-46 + n * 12} width={40} height={10} rx={3} />
            <circle className="phn-dot" cx={-15} cy={-41 + n * 12} r={3} />
            <rect className="phn-l1" x={-10} y={-44 + n * 12} width={22} height={2} rx={1} />
            <rect className="phn-l2" x={-10} y={-40 + n * 12} width={15} height={2} rx={1} />
          </g>
        ))}
      </g>
      <g transform="translate(0 18)">
        <rect className="pill" x={-59} y={-10} width={118} height={20} rx={10} />
        <text className="pill-t" textAnchor="middle" y={4}>Colaberry Now</text>
      </g>
      {badge > 0 && (
        <g transform="translate(24 -110)" data-testid="cm-cboard-badge">
          <circle className="badge" r={8} />
          <text className="badge-t" textAnchor="middle" y={3}>{badgeLabel(badge)}</text>
        </g>
      )}
    </g>
  );
}
