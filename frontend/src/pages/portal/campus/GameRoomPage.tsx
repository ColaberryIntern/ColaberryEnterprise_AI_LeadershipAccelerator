import React, { useCallback, useEffect, useRef, useState } from 'react';
import PortalShell from '../today/PortalShell';
import GameCanvas from '../../../components/campus/games/GameCanvas';
import GameRoomBoard from '../../../components/campus/games/GameRoomBoard';
import { useGameTimeCap } from '../../../components/campus/games/useGameTimeCap';
import { fetchGameBoard, Board } from '../../../components/campus/games/gameRoomApi';
import { byteChase } from '../../../components/campus/games/engine/byteChaseEngine';
import { launchLab } from '../../../components/campus/games/engine/launchLabEngine';
import { bugBreaker } from '../../../components/campus/games/engine/bugBreakerEngine';
import type { Engine } from '../../../components/campus/games/engine/engineTypes';
import type { GameId } from '../../../components/campus/games/engine/gameRules';
import '../../../components/campus/games/gameRoom.css';
import { useCampus } from '../../../components/campus/CampusContext';
import { CAMPUS_BUILDINGS, buildingName } from '../../../components/campus/campusMap';

// C11: the page's name follows Workplace names, like every other campus surface (Game Room / Break Room).
const ARCADE = CAMPUS_BUILDINGS.find((b) => b.id === 'arcade')!;

/**
 * The Game Room (Colaberry Campus C10) at /portal/game-room: three short original games, 15 minutes of credited play a day (the server
 * keeps the time; this page shows it and obeys it), and this week's cohort leaderboard. Not behind PageGate (the arcade has no gate);
 * the Game Room API answers only for campus pilot learners, and the page says so for everyone else.
 */
const GAMES: Array<{ id: GameId; name: string; blurb: string; engine: Engine<unknown> }> = [
  { id: 'byte-chase', name: 'Byte Chase', blurb: 'Guide a data packet through the circuit, collect bits, and freeze the glitches with keys.', engine: byteChase as Engine<unknown> },
  { id: 'launch-lab', name: 'Launch Lab', blurb: 'Aim the launch pad and clear the glitch nodes off the server racks.', engine: launchLab as Engine<unknown> },
  { id: 'bug-breaker', name: 'Bug Breaker', blurb: 'Keep the ball up and break the wall of bugs.', engine: bugBreaker as Engine<unknown> },
];

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const centralTime = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(iso));

export default function GameRoomPage(): React.ReactElement {
  const cap = useGameTimeCap();
  const roomName = buildingName(ARCADE, useCampus().settings.workplaceNames);
  const [game, setGame] = useState<GameId>('byte-chase');
  const [result, setResult] = useState<string | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [boardError, setBoardError] = useState(false);
  const lastScore = useRef(0);
  const wasPlaying = useRef(false);
  const active = GAMES.find((g) => g.id === game)!;

  const loadBoard = useCallback((g: GameId) => {
    setBoardError(false);
    fetchGameBoard(g).then(setBoard).catch(() => { setBoard(null); setBoardError(true); });
  }, []);
  useEffect(() => { if (cap.status !== 'pilot-off' && cap.status !== 'loading') loadBoard(game); }, [game, cap.status, loadBoard]);

  const onOver = useCallback(async (score: number) => { const msg = await cap.finish(score); if (msg) setResult(msg); loadBoard(game); }, [cap, game, loadBoard]);
  const onScore = useCallback((s: number) => { lastScore.current = s; }, []);

  // A game the server stopped (cap reached, or lost touch) still submits what it had scored. Refs carry the latest finish/board/game
  // so this effect runs only on a status change.
  const latest = useRef({ finish: cap.finish, loadBoard, game });
  latest.current = { finish: cap.finish, loadBoard, game };
  useEffect(() => {
    if (wasPlaying.current && (cap.status === 'capped' || cap.status === 'stopped')) {
      const { finish, loadBoard: reload, game: g } = latest.current;
      finish(lastScore.current).then((msg) => { if (msg) setResult(msg); reload(g); });
    }
    wasPlaying.current = cap.status === 'playing';
  }, [cap.status]);

  const play = async () => { setResult(null); lastScore.current = 0; await cap.start(game); };

  return (
    <PortalShell>
      <div className="te-page-h">
        <div className="crumb">Campus</div>
        <h1>{roomName}</h1>
        <div className="sub">15 minutes a day, resets at midnight Central. Games never change your learning points.</div>
      </div>
      {cap.status === 'pilot-off' ? (
        <section className="te-card gr-note" data-testid="gr-pilot-off"><p>The {roomName} opens with the campus.</p></section>
      ) : (
        <div className="gr-layout">
          <section className="te-card gr-main">
            <div className="gr-top">
              <div className="gr-pick" role="group" aria-label="Choose a game">
                {GAMES.map((g) => (
                  <button key={g.id} type="button" aria-pressed={g.id === game} className={`gr-tab${g.id === game ? ' is-on' : ''}`}
                    disabled={cap.status === 'playing'} data-testid={`gr-pick-${g.id}`} onClick={() => setGame(g.id)}>{g.name}</button>
                ))}
              </div>
              <span className="gr-time" data-testid="gr-time">{cap.status === 'loading' ? '...' : `${mmss(cap.leftS)} left today`}</span>
            </div>
            <p className="gr-blurb">{active.blurb}</p>
            {cap.warning && <p className="gr-warn" role="status" data-testid="gr-warning">{cap.warning}</p>}
            {cap.status === 'capped' ? (
              <div className="gr-done" data-testid="gr-capped">
                <strong>Back tomorrow</strong>
                <span>Your 15 minutes for today are used up. They come back at {cap.time ? centralTime(cap.time.resets_at) : 'midnight Central'}.</span>
              </div>
            ) : cap.status === 'playing' ? (
              <GameCanvas engine={active.engine} running onOver={onOver} onScore={onScore} label={active.name} />
            ) : (
              <div className="gr-start">
                <button type="button" className="cm-btn" onClick={play} disabled={cap.status === 'loading' || cap.status === 'unavailable'} data-testid="gr-play">Play {active.name}</button>
              </div>
            )}
            {(result || cap.message) && <p className="gr-result" role="status" data-testid="gr-result">{result ?? cap.message}</p>}
            {cap.status === 'unavailable' && <p className="gr-warn" data-testid="gr-unavailable">The {roomName} is not answering right now.</p>}
          </section>
          <GameRoomBoard title={active.name} board={board} error={boardError} />
        </div>
      )}
    </PortalShell>
  );
}
