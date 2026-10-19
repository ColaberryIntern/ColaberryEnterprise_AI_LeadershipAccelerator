import { useCallback, useEffect, useRef, useState } from 'react';
import { beatGameRun, fetchGameTime, startGameRun, submitGameScore, GameApiError, GameTime } from './gameRoomApi';
import type { GameId } from './engine/gameRules';

/**
 * The Game Room's clock on the client (Colaberry Campus C10). DISPLAY AND OBEY ONLY: the server measures play time between this hook's
 * beats; the hook never reports a duration.
 *  - start(game): asks the server for a run; CapReached -> 'capped'; CampusNotEnabled -> 'pilot-off'.
 *  - while playing, a beat every 15 s; the server's left_s is shown, counting down locally between beats for display only.
 *  - one failed beat (500, 429, timeout, network) keeps playing and warns "Time is not syncing"; two in a row stop the game;
 *    CapReached or RunExpired stop it at once. No unbounded retries.
 *  - finish(score): submits the run's score (the server checks it against the run's real time).
 */
export const BEAT_MS = 15_000;
export type CapStatus = 'loading' | 'idle' | 'playing' | 'capped' | 'stopped' | 'pilot-off' | 'unavailable';

export interface GameTimeCap {
  status: CapStatus; time: GameTime | null; leftS: number; warning: string | null; message: string | null;
  start: (game: GameId) => Promise<boolean>;
  /** Submit the run's score; null when there is no run left to submit (e.g. it expired), so the page keeps the hook's own message. */
  finish: (score: number) => Promise<string | null>;
  stop: () => void;
}

const isPilotOff = (e: unknown) => e instanceof GameApiError && e.error_class === 'CampusNotEnabled';

export function useGameTimeCap(): GameTimeCap {
  const [status, setStatus] = useState<CapStatus>('loading');
  const [time, setTime] = useState<GameTime | null>(null);
  const [leftS, setLeftS] = useState(0);
  const [warning, setWarning] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const run = useRef<string | null>(null);
  const fails = useRef(0);

  useEffect(() => {
    let alive = true;
    fetchGameTime()
      .then((t) => { if (!alive) return; setTime(t); setLeftS(t.left_s); setStatus(t.left_s > 0 ? 'idle' : 'capped'); })
      .catch((e) => { if (alive) setStatus(isPilotOff(e) ? 'pilot-off' : 'unavailable'); });
    return () => { alive = false; };
  }, []);

  const stop = useCallback(() => { run.current = null; setStatus((s) => (s === 'playing' ? 'idle' : s)); }, []);

  const start = useCallback(async (game: GameId) => {
    setWarning(null); setMessage(null); fails.current = 0;
    try {
      const r = await startGameRun(game);
      run.current = r.run_id; setLeftS(r.left_s); setStatus('playing');
      return true;
    } catch (e) {
      if (isPilotOff(e)) setStatus('pilot-off');
      else if (e instanceof GameApiError && e.error_class === 'CapReached') { setLeftS(0); setStatus('capped'); }
      else setMessage('The Game Room did not answer. Try again in a moment.');
      return false;
    }
  }, []);

  // Beats while playing. The interval exists only in the 'playing' state; it is cleared on any other state.
  useEffect(() => {
    if (status !== 'playing') return undefined;
    const beatTimer = window.setInterval(async () => {
      const id = run.current;
      if (!id) return;
      try {
        const r = await beatGameRun(id);
        fails.current = 0; setWarning(null); setLeftS(r.left_s);
      } catch (e) {
        const cls = e instanceof GameApiError ? e.error_class : 'NetworkError';
        if (cls === 'CapReached') { setLeftS(0); setStatus('capped'); return; } // the run stays, so the page can still submit this game's score
        if (cls === 'RunExpired') { run.current = null; setStatus('stopped'); setMessage('That game ran past midnight Central, so its score was not counted. Start a new game.'); return; }
        fails.current += 1;
        if (fails.current >= 2) { setStatus('stopped'); setMessage('We lost touch with the Game Room, so the game stopped. Start again when you are ready.'); }
        else setWarning('Time is not syncing');
      }
    }, BEAT_MS);
    const tick = window.setInterval(() => setLeftS((l) => Math.max(0, l - 1)), 1000); // display only
    return () => { window.clearInterval(beatTimer); window.clearInterval(tick); };
  }, [status]);

  const finish = useCallback(async (score: number) => {
    const id = run.current;
    run.current = null;
    setStatus((s) => (s === 'playing' ? 'idle' : s));
    if (!id) return null;
    try {
      const r = await submitGameScore(id, score);
      return r.replayed ? `Score already saved: ${r.score}.` : `Score saved: ${r.score}.`;
    } catch (e) {
      const cls = e instanceof GameApiError ? e.error_class : 'NetworkError';
      if (cls === 'RunExpired') return 'That game ran past midnight Central, so its score was not counted.';
      if (cls === 'ScoreRejected') return 'That score could not be counted.';
      return 'We could not save that score.';
    }
  }, []);

  return { status, time, leftS, warning, message, start, finish, stop };
}
