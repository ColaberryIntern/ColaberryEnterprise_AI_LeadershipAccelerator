import React, { useCallback, useEffect, useState } from 'react';
import { challengeFriend, fetchGameBoard, fetchGameSummary, fetchGameTime, fetchPlayingNow, type GameSummary, type GameTime, type PlayingNow } from './gameRoomApi';
import { GAME_CATALOG, featuredGame, gameInfo, mmss } from './gameCatalog';
import { openCabinet, GAME_FINISHED_EVENT } from './CabinetModal';
import GameArt from './GameArt';
import { fetchCampusPresence, type CampusPerson } from '../campusApi';
import type { GameId } from './engine/gameRules';

/**
 * The Game Room page's sections (Campus v8 G1, C34): the hero (break left today + the featured game), Your week and Champions this week,
 * the game grid, recent highs (with ⚔️ Challenge), playing now (👀 spectate is a stretch goal: it says so) and Challenge a friend. One
 * data hook reads the time, your best and rank per game, the summary and playing now, and re-reads when a game finishes.
 */
export interface RoomData {
  time: GameTime | null; bests: Partial<Record<GameId, number>>; ranks: Partial<Record<GameId, number>>;
  summary: GameSummary | null; playing: PlayingNow | null; error: boolean;
}

export function useGameRoomData(enabled: boolean): RoomData {
  const [d, setD] = useState<RoomData>({ time: null, bests: {}, ranks: {}, summary: null, playing: null, error: false });
  const load = useCallback(() => {
    if (!enabled) return;
    Promise.all([
      fetchGameTime().catch(() => null),
      Promise.all(GAME_CATALOG.map((g) => fetchGameBoard(g.id).then((b) => [g.id, b.me] as const).catch(() => [g.id, null] as const))),
      fetchGameSummary().catch(() => null),
      fetchPlayingNow().catch(() => null),
    ]).then(([time, mes, summary, playing]) => {
      const bests: RoomData['bests'] = {}; const ranks: RoomData['ranks'] = {};
      for (const [id, me] of mes) if (me) { bests[id] = me.best; ranks[id] = me.rank; }
      setD({ time, bests, ranks, summary, playing, error: !time && !summary });
    });
  }, [enabled]);
  useEffect(() => { load(); window.addEventListener(GAME_FINISHED_EVENT, load); return () => window.removeEventListener(GAME_FINISHED_EVENT, load); }, [load]);
  return d;
}

export function GameRoomHero({ d }: { d: RoomData }): React.ReactElement {
  const left = d.time?.left_s ?? null;
  const pct = d.time ? Math.round((d.time.left_s / d.time.cap_s) * 100) : 0;
  const f = featuredGame(d.bests, d.ranks);
  return (
    <section className="te-card gr-hero" data-testid="gr-hero">
      <div className="gr-hero-left">
        <small>Break left today</small>
        <b className="gr-hero-time" data-testid="gr-hero-time">{left === null ? '…' : mmss(left)}</b>
        <div className="gr-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
        <span>{left === 0 ? 'That’s your 15 minutes · back tomorrow' : 'Resets at midnight Central'}</span>
      </div>
      <div className="gr-hero-right">
        <small>Try something new · {f.name}{f.isNew && <em className="gr-new">NEW</em>}</small>
        <h2>{f.name}</h2>
        <p>{f.blurb}</p>
        <div className="row">
          <button type="button" className="cm-btn" disabled={left === 0} onClick={() => openCabinet(f.id)} data-testid="gr-hero-play">▶ Play {f.name}</button>
          <a className="cm-btn-line" href="#gr-leaderboards">See the leaderboard</a>
        </div>
      </div>
      <GameArt game={f.id} className="gr-hero-art" />
    </section>
  );
}

export function SideCards({ d }: { d: RoomData }): React.ReactElement {
  const w = d.summary?.your_week;
  return (
    <div className="gr-sides">
      <section className="te-card gr-side is-week" data-testid="gr-your-week">
        <h3><span aria-hidden="true">🏆 </span>Your week</h3>
        {w ? (<ul>
          <li><span>Games played</span><b>{w.played}</b></li>
          <li><span>Best game</span><b>{w.best_game ? gameInfo(w.best_game).name : '—'}</b></li>
          <li><span>Best score</span><b>{w.best_score?.toLocaleString('en-US') ?? '—'}</b></li>
          <li><span>Best rank (cohort)</span><b>{w.best_rank ? `#${w.best_rank}` : '—'}</b></li>
        </ul>) : <p className="gr-muted">Play a game to start your week.</p>}
      </section>
      <section className="te-card gr-side is-champs" data-testid="gr-champions">
        <h3><span aria-hidden="true">👑 </span>Champions this week</h3>
        <ul>{(d.summary?.champions ?? GAME_CATALOG.map((g) => ({ game: g.id, name: null, avatar_url: null, score: null }))).map((c) => (
          <li key={c.game}><span>{gameInfo(c.game).name}</span><b>{c.name ? `${c.name} · ${c.score?.toLocaleString('en-US')}` : 'No champion yet'}</b></li>
        ))}</ul>
      </section>
    </div>
  );
}

export function GameGrid({ d }: { d: RoomData }): React.ReactElement {
  return (
    <section id="gr-games" data-testid="gr-games">
      <div className="gr-sec-h"><h2>Pick a game</h2><small>Arrow keys or WASD · swipe on a phone · Esc to leave</small></div>
      <div className="gr-grid">
        {GAME_CATALOG.map((g) => (
          <article key={g.id} className="te-card gr-card" data-testid={`gr-card-${g.id}`}>
            <div className="gr-card-art"><GameArt game={g.id} />{g.isNew && <em className="gr-new">NEW</em>}</div>
            <h3>{g.name}</h3>
            <p>{g.blurb}</p>
            <small>{d.bests[g.id] !== undefined ? `Your best ${d.bests[g.id]!.toLocaleString('en-US')} · #${d.ranks[g.id]} this week` : 'Not ranked yet'}</small>
            <button type="button" className="cm-btn" disabled={d.time?.left_s === 0} onClick={() => openCabinet(g.id)} data-testid={`gr-play-${g.id}`}>▶ Play</button>
          </article>
        ))}
      </div>
    </section>
  );
}

const ago = (iso: string, now: number) => { const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000)); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

export function RecentHighs({ d, onChallenge }: { d: RoomData; onChallenge: (enrollmentId: string, name: string, game: GameId, score: number) => void }): React.ReactElement {
  const list = d.summary?.recent ?? [];
  const now = Date.now();
  return (
    <section className="te-card gr-recent" id="gr-recent" data-testid="gr-recent">
      <div className="gr-sec-h"><h2>Recent highs</h2></div>
      {!list.length && <p className="gr-muted">No new personal bests this week yet.</p>}
      <ul>{list.map((h) => (
        <li key={`${h.enrollment_id}-${h.at}`}>
          <span>{h.kind === 'top' ? '👑' : '⭐'} <b>{h.name}</b> {h.kind === 'top' ? 'took #1 in' : 'set a new best in'} {gameInfo(h.game).name} · {h.score.toLocaleString('en-US')} · {ago(h.at, now)}</span>
          <button type="button" className="cm-btn-line" onClick={() => onChallenge(h.enrollment_id, h.name, h.game, h.score)}>⚔️ Challenge</button>
        </li>
      ))}</ul>
    </section>
  );
}

export function RoomRail({ d }: { d: RoomData }): React.ReactElement {
  const [people, setPeople] = useState<CampusPerson[]>([]);
  const [to, setTo] = useState('');
  const [game, setGame] = useState<GameId>('stack-drop');
  const [note, setNote] = useState('');
  useEffect(() => {
    fetchCampusPresence().then((p) => {
      const seen = new Map<string, CampusPerson>();
      for (const a of Object.values(p)) for (const x of a.people) if (!('anonymous' in x)) seen.set(x.enrollment_id, x);
      setPeople(Array.from(seen.values()));
    }).catch(() => undefined);
  }, []);
  const send = async () => {
    if (!to) return;
    const score = d.bests[game] ?? 0;
    try { const r = await challengeFriend(to, game, score); setNote(r.sent ? 'Challenge sent.' : 'You already challenged them in this game today.'); }
    catch { setNote('That challenge could not be sent.'); }
  };
  return (
    <aside className="gr-rail">
      <section className="te-card" data-testid="gr-playing">
        <h3>Playing now · {d.playing?.count ?? 0}</h3>
        {(d.playing?.people ?? []).map((p) => (
          <div key={p.name + p.game} className="gr-play-row"><span>{p.name} · {gameInfo(p.game).name}</span>
            <button type="button" className="cm-btn-line" onClick={() => setNote('Watching a game is coming soon.')} aria-label={`Spectate ${p.name}`}>👀</button></div>
        ))}
        {!d.playing?.count && <p className="gr-muted">Nobody is in a game right now.</p>}
      </section>
      <section className="te-card" data-testid="gr-challenge">
        <h3>Challenge a friend</h3>
        <div className="gr-field"><label htmlFor="gr-ch-to">Friend</label>
          <select id="gr-ch-to" value={to} onChange={(e) => setTo(e.target.value)}><option value="">Pick someone on campus</option>{people.map((p) => <option key={p.enrollment_id} value={p.enrollment_id}>{p.display_name}</option>)}</select></div>
        <div className="gr-field"><label htmlFor="gr-ch-game">Game</label>
          <select id="gr-ch-game" value={game} onChange={(e) => setGame(e.target.value as GameId)}>{GAME_CATALOG.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
        <button type="button" className="cm-btn" disabled={!to} onClick={send}>Send &ldquo;beat my {(d.bests[game] ?? 0).toLocaleString('en-US')}&rdquo;</button>
        {note && <p className="gr-muted" role="status">{note}</p>}
      </section>
    </aside>
  );
}
