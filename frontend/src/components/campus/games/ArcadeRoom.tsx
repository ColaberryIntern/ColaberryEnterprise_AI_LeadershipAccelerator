import React from 'react';
import { Billboard } from '../interior/room3d/billboard';
import GameArt from './GameArt';
import { GAME_CATALOG, featuredGame, gameInfo, mmss } from './gameCatalog';
import { openCabinet } from './CabinetModal';
import type { RoomData } from './GameRoomSections';
import Leaderboards from './Leaderboards';
import './arcadeRoom.css';

/**
 * The Game Room interior as an arcade aisle (Campus v8 G5, Basecamp C36), all from the real Game Room data (useGameRoomData) and the
 * cabinet modal (C34):
 *  - five cabinets on the floor, three down the right and two down the left, each with a neon marquee, the game's own art on its
 *    screen, "BEST ‹your best›" or "NO SCORE YET", "▶ PLAY" and NEW where it applies; clicking one opens that game's cabinet;
 *  - the back wall: TAKE A REAL BREAK with "⏱ m:ss LEFT TODAY", the featured game, ▶ Play (off with no time left) and Leaderboards;
 *  - the left wall: a neon 👑 CHAMPIONS board, one row per game; it opens the page at the leaderboards;
 *  - the arrival card: Look up, or step up; Break time; Games; Leaderboard · this week · my cohort; Full leaderboards.
 * Finishing a game refreshes all of it without reopening the room (the data hook listens for the cabinet's GAME_FINISHED_EVENT).
 */
/** Staggered toward the room's vanishing point (perspective origin 68%), so no nearer cabinet covers the middle of one behind it
 *  at any room width from a phone to a wide desktop (a single column at one x stacked them on the vanishing line: fidelity 30). */
export const CABINET_SLOTS: { x: number; z: number }[] = [
  { x: 0.93, z: 0.12 }, { x: 0.77, z: 0.34 }, { x: 0.62, z: 0.56 }, // the right side, front to back
  { x: 0.08, z: 0.2 }, { x: 0.3, z: 0.56 },                            // the left side
];
/** A cabinet is 130 x 230 at full size; in a narrow room it shrinks to 15% of the room's width (box and art together). */
export const cabinetScale = (fw: number): number => Math.min(1, (fw * 0.15) / 130);
const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

export function ArcadeCabinets({ d, fw, fh, depth }: { d: RoomData; fw: number; fh: number; depth: number }): React.ReactElement {
  const k = cabinetScale(fw);
  return (
    <>
      {GAME_CATALOG.map((g, i) => {
        const at = CABINET_SLOTS[i];
        const best = d.bests[g.id];
        return (
          <Billboard key={g.id} x={at.x} z={at.z} w={Math.round(130 * k)} h={Math.round(230 * k)} fw={fw} fh={fh} d={depth} className="cm-cab-bb" role="button" tabIndex={0}
            aria-label={`Play ${g.name}${best !== undefined ? `, your best ${best}` : ''}`} data-testid={`cm-cabinet-${g.id}`}
            onClick={stop(() => openCabinet(g.id))} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCabinet(g.id); } }}>
            <div className="cm-cab-body" style={k < 1 ? { width: 130, height: 230, transform: `scale(${k})`, transformOrigin: '0 0' } : undefined}>
              <div className="cm-cab-marquee">{g.name.toUpperCase()}{g.isNew && <em>NEW</em>}</div>
              <div className="cm-cab-screen"><GameArt game={g.id} /></div>
              <div className="cm-cab-panel" aria-hidden="true"><i /><i /><i /></div>
              <div className="cm-cab-best" data-testid={`cm-cabinet-best-${g.id}`}>{best !== undefined ? `BEST ${best.toLocaleString('en-US')}` : 'NO SCORE YET'}</div>
              <div className="cm-cab-play">▶ PLAY</div>
            </div>
          </Billboard>
        );
      })}
    </>
  );
}

export function ArcadeBoard({ d, onOpen }: { d: RoomData; onOpen: (route: string) => void }): React.ReactElement {
  const f = featuredGame(d.bests, d.ranks);
  const left = d.time?.left_s ?? null;
  return (
    <>
      <div className="k">Take a real break <span className="cm-arc-chip" data-testid="cm-arc-left">⏱ {left === null ? '…' : mmss(left)} LEFT TODAY</span></div>
      <h3 data-testid="cm-board-title">{f.name}{f.isNew && <em className="gr-new">NEW</em>}</h3>
      <p className="cm-arc-line">{f.blurb}</p>
      <div className="row">
        <button type="button" className="b red" disabled={left === 0} onClick={stop(() => openCabinet(f.id))} data-testid="cm-board-primary">▶ Play {f.name}</button>
        <button type="button" className="b" onClick={stop(() => onOpen('/portal/game-room'))} data-testid="cm-board-section">Leaderboards</button>
      </div>
    </>
  );
}

export function ChampionsWall({ d, onOpen }: { d: RoomData; onOpen: (route: string) => void }): React.ReactElement {
  const champs = d.summary?.champions ?? GAME_CATALOG.map((g) => ({ game: g.id, name: null, avatar_url: null, score: null }));
  return (
    <button type="button" className="cm-champs" onClick={stop(() => onOpen('/portal/game-room'))} data-testid="cm-champions" aria-label="Champions this week: open the leaderboards">
      <b className="t">👑 CHAMPIONS</b>
      {champs.map((c) => (
        <span key={c.game} className="r"><i aria-hidden="true">{c.name ? c.name.slice(0, 1).toUpperCase() : '·'}</i><span>{gameInfo(c.game).name}</span><em>{c.score?.toLocaleString('en-US') ?? '—'}</em></span>
      ))}
    </button>
  );
}

/** `place`: the building's name as this viewer reads it (Break Room with Workplace names on). */
export function ArcadeCard({ d, onOpen, place = 'Game Room' }: { d: RoomData; onOpen: (route: string) => void; place?: string }): React.ReactElement {
  const f = featuredGame(d.bests, d.ranks);
  const left = d.time?.left_s ?? null;
  const pct = d.time ? Math.round((d.time.left_s / d.time.cap_s) * 100) : 0;
  return (
    <div className="cm-arc-card" data-testid="cm-arc-card">
      <div className="cm-sec">Look up, or step up</div>
      <div className="cm-arc-tiles">
        <button type="button" onClick={() => onOpen('/portal/game-room')}><b>{place}</b><small>Every game, leaderboards and recent highs</small><span>Open the {place} →</span></button>
        <button type="button" onClick={() => openCabinet(f.id)}><b>{f.name}</b><small>Or walk up to any cabinet in the aisle</small><span>Play →</span></button>
      </div>
      <div className="cm-arc-meter" data-testid="cm-arc-meter">
        <small>Break time</small><b>{left === null ? '…' : mmss(left)}</b>
        <div className="gr-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
        <span>Resets at midnight Central · games never change your points</span>
      </div>
      <div className="cm-sec">Games</div>
      <ul className="cm-arc-games">
        {GAME_CATALOG.map((g) => (
          <li key={g.id} data-testid={`cm-arc-game-${g.id}`}>
            <GameArt game={g.id} className="thumb" />
            <span className="tx"><b>{g.name}{g.isNew && <em className="gr-new">NEW</em>}</b>
              <small>{d.bests[g.id] !== undefined ? `Your best ${d.bests[g.id]!.toLocaleString('en-US')} · #${d.ranks[g.id]} this week` : 'No score yet'}</small></span>
            <button type="button" className="cm-btn-line" disabled={left === 0} onClick={() => openCabinet(g.id)}>Play</button>
          </li>
        ))}
      </ul>
      <div className="cm-arc-lb"><Leaderboards /></div>
      <button type="button" className="cm-hall-link" onClick={() => onOpen('/portal/game-room')}>Full leaderboards →</button>
    </div>
  );
}
