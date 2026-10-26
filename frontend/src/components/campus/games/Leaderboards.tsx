import React, { useEffect, useState } from 'react';
import { fetchGameBoard, type Board, type BoardPeriod, type BoardRow, type BoardScope } from './gameRoomApi';
import { GAME_CATALOG } from './gameCatalog';
import { openCabinet, GAME_FINISHED_EVENT } from './CabinetModal';
import type { GameId } from './engine/gameRules';

/**
 * Leaderboards (Campus v8 G1.5, C34): game tabs, My cohort / Everyone, This week / All time; the podium (🥇 centre and raised, 🥈 left, 🥉
 * right), rows #4-#10 (rank, avatar, name + cohort, level chip, score), and YOUR row always (highlighted; below #10 after "⋯"), or "You
 * don't have a score in ‹game› yet · Set one". Real rows only: "Everyone" names only whom the server names (others "Colaberry learner").
 */
const initials = (n: string) => n.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
const first = (n: string) => n.trim().split(/\s+/)[0] || n;

function Avatar({ r }: { r: Pick<BoardRow, 'avatar_url' | 'name'> }): React.ReactElement {
  return r.avatar_url ? <img className="gr-av" src={r.avatar_url} alt="" /> : <span className="gr-av" aria-hidden="true">{initials(r.name)}</span>;
}

function Row({ r }: { r: BoardRow }): React.ReactElement {
  return (
    <li className={r.you ? 'is-you' : undefined} data-testid={r.you ? 'gr-lb-you' : undefined}>
      <span className="rk">#{r.rank}</span><Avatar r={r} />
      <span className="who"><b>{r.name}</b>{r.cohort_name && <small>{r.cohort_name}</small>}</span>
      {r.rung_name && <span className="lv">{r.rung_name}</span>}
      <span className="sc">{r.score.toLocaleString('en-US')}</span>
    </li>
  );
}

export default function Leaderboards({ initial = 'stack-drop' }: { initial?: GameId }): React.ReactElement {
  const [game, setGame] = useState<GameId>(initial);
  const [scope, setScope] = useState<BoardScope>('cohort');
  const [period, setPeriod] = useState<BoardPeriod>('week');
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setError(false);
    fetchGameBoard(game, scope, period).then((b) => { if (alive) setBoard(b); }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [game, scope, period, tick]);
  useEffect(() => { const h = () => setTick((t) => t + 1); window.addEventListener(GAME_FINISHED_EVENT, h); return () => window.removeEventListener(GAME_FINISHED_EVENT, h); }, []);
  const rows = board?.rows ?? [];
  const podium = [rows[1], rows[0], rows[2]];
  const rest = rows.slice(3);
  const youShown = rows.some((r) => r.you);
  const name = GAME_CATALOG.find((g) => g.id === game)?.name ?? game;
  return (
    <section className="te-card gr-lb" id="gr-leaderboards" data-testid="gr-leaderboards">
      <div className="gr-sec-h"><h2>Leaderboards</h2><small>Top scores reset every Monday</small></div>
      <div className="gr-lb-tabs" role="group" aria-label="Game">
        {GAME_CATALOG.map((g) => <button key={g.id} type="button" aria-pressed={g.id === game} className={g.id === game ? 'on' : undefined} onClick={() => setGame(g.id)} data-testid={`gr-lb-game-${g.id}`}>{g.name}</button>)}
      </div>
      <div className="gr-lb-toggles">
        <div className="seg" role="group" aria-label="Who">
          {(['cohort', 'all'] as BoardScope[]).map((s) => <button key={s} type="button" aria-pressed={scope === s} className={scope === s ? 'on' : undefined} onClick={() => setScope(s)}>{s === 'cohort' ? 'My cohort' : 'Everyone'}</button>)}
        </div>
        <div className="seg" role="group" aria-label="When">
          {(['week', 'all'] as BoardPeriod[]).map((p) => <button key={p} type="button" aria-pressed={period === p} className={period === p ? 'on' : undefined} onClick={() => setPeriod(p)}>{p === 'week' ? 'This week' : 'All time'}</button>)}
        </div>
      </div>
      {error && <p className="gr-muted" role="status">The leaderboard is not answering right now.</p>}
      {!error && board && !rows.length && <p className="gr-muted">Nobody has a score in {name} yet. Be the first.</p>}
      {rows.length > 0 && (
        <div className="gr-podium" data-testid="gr-podium">
          {podium.map((r, i) => r ? (
            <div key={r.rank + r.name} className={`step s${i}${r.you ? ' is-you' : ''}`}>
              <span className="medal" aria-hidden="true">{['🥈', '🥇', '🥉'][i]}</span><Avatar r={r} />
              <b>{first(r.name)}</b><span className="sc">{r.score.toLocaleString('en-US')}</span>
            </div>
          ) : <div key={`empty-${i}`} className={`step s${i} is-empty`} aria-hidden="true" />)}
        </div>
      )}
      {rest.length > 0 && <ol className="gr-lb-rows">{rest.map((r) => <Row key={r.rank + r.name} r={r} />)}</ol>}
      {board && !youShown && board.me && (
        <ol className="gr-lb-rows"><li className="gap" aria-hidden="true">⋯</li>
          <Row r={{ rank: board.me.rank, name: 'You', display_name: 'You', avatar_url: null, rung_name: null, cohort_name: null, score: board.me.best, you: true }} /></ol>
      )}
      {board && !board.me && (
        <p className="gr-lb-none" data-testid="gr-lb-none">You don&rsquo;t have a score in {name} yet · <button type="button" className="gr-link" onClick={() => openCabinet(game)}>Set one</button></p>
      )}
    </section>
  );
}
