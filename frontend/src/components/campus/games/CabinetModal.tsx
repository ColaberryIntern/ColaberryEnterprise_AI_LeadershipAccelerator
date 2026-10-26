import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GameCanvas from './GameCanvas';
import { useGameTimeCap } from './useGameTimeCap';
import { fetchGameBoard } from './gameRoomApi';
import { gameInfo, mmss } from './gameCatalog';
import type { GameId } from './engine/gameRules';
import type { Hud } from './engine/engineTypes';
import { useCampus } from '../CampusContext';
import './cabinet.css';

/**
 * The cabinet (Campus v8 G2, Basecamp C34): play in a dark modal over the page or the room. Header pills (the game in a pixel font,
 * score, Lv with ♥ lives where the game has them, ⏱ time left: red and pulsing under a minute), ✕, the canvas, the controls and "Esc to
 * pause and leave"; on a phone an on-screen pad. The game-over sheet: NEW PERSONAL BEST! / GAME OVER / BREAK'S OVER 🌙, the score, your
 * best and rank on this week's cohort board and the break left, then Play again (not with no time left), Back to work (walks to your next
 * plan step's building) and Game Room. The time stays server-timed (useGameTimeCap's start / beat / finish). Finishing a game tells the
 * page and the room to refresh (GAME_FINISHED_EVENT).
 */
export const CABINET_EVENT = 'cm-open-cabinet';
export const GAME_FINISHED_EVENT = 'cm-game-finished';
export function openCabinet(game: GameId): void { try { window.dispatchEvent(new CustomEvent<GameId>(CABINET_EVENT, { detail: game })); } catch { /* non-DOM */ } }

type Over = { score: number; reason: 'over' | 'time'; best: number | null; rank: number | null; prevBest: number | null } | null;
const PAD: [string, string, string][] = [['◀', 'ArrowLeft', 'Left'], ['⟳', 'ArrowUp', 'Rotate or up'], ['▼', 'ArrowDown', 'Down'], ['▶', 'ArrowRight', 'Right'], ['⤓', ' ', 'Drop or act']];

function press(key: string): void {
  const c = document.querySelector<HTMLCanvasElement>('.gr-cab canvas');
  if (!c) return;
  c.focus();
  c.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  window.setTimeout(() => c.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true })), 120);
}

export function CabinetModal({ game, onClose }: { game: GameId; onClose: () => void }): React.ReactElement {
  const info = gameInfo(game);
  const cap = useGameTimeCap();
  const navigate = useNavigate();
  const { planStops, openMap } = useCampus();
  const [hud, setHud] = useState<Hud>({ score: 0, lives: 0, level: 1, over: false, hint: '' });
  const [over, setOver] = useState<Over>(null);
  const [round, setRound] = useState(0);
  const started = useRef(-1);
  const last = useRef(0);
  const prevBest = useRef<number | null>(null);

  // the best before this game (to tell a new personal best), and a start once the clock has loaded
  useEffect(() => { fetchGameBoard(game).then((b) => { prevBest.current = b.me?.best ?? null; }).catch(() => undefined); }, [game]);
  useEffect(() => { if (cap.status === 'idle' && started.current !== round && !over) { started.current = round; void cap.start(game); } }, [cap, cap.status, game, round, over]);

  const end = useCallback(async (score: number, reason: 'over' | 'time') => {
    await cap.finish(score);
    let best: number | null = null; let rank: number | null = null;
    try { const b = await fetchGameBoard(game); best = b.me?.best ?? null; rank = b.me?.rank ?? null; } catch { /* the sheet still shows the score */ }
    setOver({ score, reason, best, rank, prevBest: prevBest.current });
    prevBest.current = best;
    try { window.dispatchEvent(new CustomEvent(GAME_FINISHED_EVENT, { detail: game })); } catch { /* non-DOM */ }
  }, [cap, game]);
  const onOver = useCallback((score: number) => { void end(score, 'over'); }, [end]);
  const onScore = useCallback((s: number) => { last.current = s; }, []);
  // the break ran out mid-game: submit what was scored, then BREAK'S OVER
  const wasPlaying = useRef(false);
  useEffect(() => {
    if (wasPlaying.current && cap.status === 'capped' && !over) void end(last.current, 'time');
    // lost touch with the server (two failed beats) or past midnight: submit what was scored (nothing to submit after midnight)
    if (wasPlaying.current && cap.status === 'stopped' && !over) void end(last.current, 'over');
    wasPlaying.current = cap.status === 'playing';
  }, [cap.status, over, end]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); if (cap.status === 'playing') void end(last.current, 'over'); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cap.status, end, onClose]);

  const next = planStops?.find((s) => !s.done && s.buildingId) ?? null;
  const again = () => { setOver(null); last.current = 0; setRound((r) => r + 1); };
  // out of time: the server said so, or the clock (once loaded) reads zero; while loading leftS is 0 and means nothing yet
  const capped = cap.status === 'capped' || (cap.status !== 'loading' && cap.leftS <= 0);
  const headline = over?.reason === 'time' ? 'BREAK’S OVER 🌙' : over && over.prevBest !== null && over.score > over.prevBest ? 'NEW PERSONAL BEST!' : 'GAME OVER';
  return (
    <div className="gr-cab-scrim" role="dialog" aria-modal="true" aria-label={`${info.name} cabinet`} data-testid="gr-cabinet">
      <div className="gr-cab">
        <header className="gr-cab-top">
          <span className="pill title" data-testid="gr-cab-title">{info.name.toUpperCase()}</span>
          <span className="pill">{hud.score.toLocaleString('en-US')}</span>
          <span className="pill">Lv {hud.level}{hud.lives > 0 ? ` · ${'♥'.repeat(Math.min(hud.lives, 5))}` : ''}</span>
          <span className={`pill time${cap.leftS < 60 ? ' is-low' : ''}`} data-testid="gr-cab-time">⏱ {mmss(cap.leftS)}</span>
          <button type="button" className="gr-cab-x" onClick={() => { if (cap.status === 'playing') void end(last.current, 'over'); onClose(); }} aria-label="Close the cabinet">✕</button>
        </header>
        <div className="gr-cab-screen">
          {cap.status === 'playing' && !over && <GameCanvas key={round} engine={info.engine} running onOver={onOver} onScore={onScore} onHud={setHud} hideHud label={info.name} />}
          {cap.status === 'loading' && <p className="gr-cab-note">Warming up the cabinet…</p>}
          {cap.status === 'pilot-off' && <p className="gr-cab-note">The Game Room opens with the campus.</p>}
          {cap.status === 'unavailable' && <p className="gr-cab-note">The Game Room is not answering right now.</p>}
          {capped && !over && cap.status !== 'playing' && <p className="gr-cab-note">That&rsquo;s your 15 minutes · back tomorrow.</p>}
          {over && (
            <div className="gr-cab-over" data-testid="gr-cab-over">
              <h3>{headline}</h3>
              <b className="big">{over.score.toLocaleString('en-US')}</b>
              <p>{over.best !== null ? `Your best: ${over.best.toLocaleString('en-US')}` : 'Your best is saving'}{over.rank ? ` · #${over.rank} on this week’s cohort board` : ''} · {mmss(cap.leftS)} of break left today</p>
              <div className="row">
                <button type="button" className="gr-cab-btn pri" onClick={again} disabled={capped} data-testid="gr-cab-again">Play again</button>
                {next?.buildingId && <button type="button" className="gr-cab-btn" onClick={() => { onClose(); openMap(next.buildingId!); }}>Back to work: {next.title} →</button>}
                <button type="button" className="gr-cab-btn" onClick={() => { onClose(); navigate('/portal/game-room'); }}>Game Room</button>
              </div>
            </div>
          )}
        </div>
        {cap.warning && <p className="gr-cab-warn" role="status" data-testid="gr-warning">{cap.warning}</p>}
        {cap.message && <p className="gr-cab-warn" role="status" data-testid="gr-result">{cap.message}</p>}
        <footer className="gr-cab-foot"><span>{info.controls}</span><span>Esc to pause and leave</span></footer>
        <div className="gr-cab-pad" role="group" aria-label="On-screen controls">
          {PAD.map(([glyph, key, label]) => <button key={key} type="button" aria-label={label} onPointerDown={(e) => { e.preventDefault(); press(key); }}>{glyph}</button>)}
        </div>
      </div>
    </div>
  );
}

/**
 * The one host: mounted on the Game Room page (which works with the campus off) and with the campus layers (the room's cabinets).
 * Only the first mounted host listens, so a page that has both never opens two cabinets.
 */
let owner: symbol | null = null;
export default function CabinetHost(): React.ReactElement | null {
  const [game, setGame] = useState<GameId | null>(null);
  useEffect(() => {
    if (owner) return undefined;
    const me = Symbol('cabinet-host');
    owner = me;
    const h = (e: Event) => setGame((e as CustomEvent<GameId>).detail);
    window.addEventListener(CABINET_EVENT, h);
    return () => { window.removeEventListener(CABINET_EVENT, h); if (owner === me) owner = null; };
  }, []);
  return game ? <CabinetModal key={game} game={game} onClose={() => setGame(null)} /> : null;
}
