import { centralDateKey } from '../centralDate';
import { DAILY_CAP_S, creditFor, runExpired, resetsAt, centralWeekStart } from './gameRoomTime';
import { GameId, acceptScore } from './gameRoomRules';
import { GameRoomStore, RunRow, Tx, productionStore } from './gameRoomStore';

/**
 * The Game Room (Colaberry Campus C10): starting runs, crediting play time, accepting scores, and the weekly cohort leaderboard.
 *
 * WHAT THE SERVER ENFORCES. The games draw in the browser, so a modified client can keep drawing; the server decides (1) how much
 * play is CREDITED (from its own clock only, at most 900 s per learner per Central day) and (2) which scores count. Every credit runs
 * under the per-(learner, day) lock with a conditional update (gameRoomStore), so racing beats or tabs can never credit a gap twice
 * or push a day past 900 s. A run belongs to the Central day it started: after midnight it is RunExpired and earns nothing.
 * Games never touch learning points: nothing here imports the points service (a source-scan test enforces it).
 */
export type GameRoomErrorClass = 'CapReached' | 'RunExpired' | 'RunNotFound' | 'RunClosed' | 'ScoreRejected';
export class GameRoomError extends Error {
  constructor(message: string, readonly error_class: GameRoomErrorClass) { super(message); this.name = 'GameRoomError'; }
}

export interface TimeView { used_s: number; cap_s: number; left_s: number; resets_at: string }
export interface BoardRow { rank: number; name: string; score: number; you: boolean }

let storeOverride: GameRoomStore | null = null;
/** Test seam. */
export function __setGameRoomStoreForTests(s: GameRoomStore | null): void { storeOverride = s; }
const store = (): GameRoomStore => storeOverride ?? productionStore();

const lockKey = (enrollmentId: string, date: string) => `game_room:${enrollmentId}:${date}`;
const timeView = (used: number, nowMs: number): TimeView => ({
  used_s: Math.min(used, DAILY_CAP_S), cap_s: DAILY_CAP_S, left_s: Math.max(0, DAILY_CAP_S - used), resets_at: resetsAt(nowMs).toISOString(),
});

export async function timeFor(enrollmentId: string, nowMs: number = Date.now()): Promise<TimeView> {
  const s = store();
  await s.ensureSchema();
  return timeView(await s.usedOn(enrollmentId, centralDateKey(nowMs)), nowMs);
}

export async function startRun(enrollmentId: string, cohortId: string | null, game: GameId, nowMs: number = Date.now()): Promise<{ run_id: string; left_s: number }> {
  const s = store();
  await s.ensureSchema();
  const today = centralDateKey(nowMs);
  return s.withDayLock(lockKey(enrollmentId, today), async (tx) => {
    const used = await s.usedOn(enrollmentId, today, tx);
    if (used >= DAILY_CAP_S) throw new GameRoomError('Your 15 minutes for today are used up.', 'CapReached');
    const now = new Date(nowMs);
    const row = await s.insertRun({ enrollment_id: enrollmentId, cohort_id: cohortId, game, central_date: today, started_at: now, last_beat_at: now, seconds_used: 0, score: null, submitted_at: null }, tx);
    return { run_id: row.id, left_s: DAILY_CAP_S - used };
  });
}

/** Load the caller's own open run inside the lock, refusing anything they may not credit. */
async function ownRun(s: GameRoomStore, enrollmentId: string, runId: string, tx: Tx, nowMs: number): Promise<RunRow> {
  const run = await s.findRun(runId, tx);
  if (!run || run.enrollment_id !== enrollmentId) throw new GameRoomError('No such run.', 'RunNotFound');
  if (runExpired(nowMs, run.central_date)) throw new GameRoomError('That game started yesterday; start a new one.', 'RunExpired');
  return run;
}

/** Credit the gap since the run's last beat (inside the lock). Returns the run's new seconds and today's total. */
async function credit(s: GameRoomStore, run: RunRow, tx: Tx, nowMs: number): Promise<{ seconds: number; usedToday: number; changed: boolean }> {
  const usedBefore = await s.usedOn(run.enrollment_id, run.central_date, tx);
  const add = creditFor({ nowMs, lastBeatMs: new Date(run.last_beat_at).getTime(), usedTodayS: usedBefore, runDate: run.central_date });
  const changed = (await s.updateRunIf(run.id, run.last_beat_at, { last_beat_at: new Date(nowMs), seconds_used: run.seconds_used + add }, tx)) === 1;
  return changed ? { seconds: run.seconds_used + add, usedToday: usedBefore + add, changed } : { seconds: run.seconds_used, usedToday: usedBefore, changed };
}

export async function beat(enrollmentId: string, runId: string, nowMs: number = Date.now()): Promise<{ left_s: number }> {
  const s = store();
  await s.ensureSchema();
  const probe = await s.withDayLock(lockKey(enrollmentId, centralDateKey(nowMs)), async (tx) => {
    const run = await ownRun(s, enrollmentId, runId, tx, nowMs);
    if (run.submitted_at) throw new GameRoomError('That game is over.', 'RunClosed');
    const { usedToday } = await credit(s, run, tx, nowMs);
    return usedToday;
  });
  if (probe >= DAILY_CAP_S) throw new GameRoomError('Your 15 minutes for today are used up.', 'CapReached');
  return { left_s: DAILY_CAP_S - probe };
}

/**
 * Submit a run's score: credit the last gap first, then accept it iff the run's server-measured seconds could have earned it.
 * One score per run: submitting again returns the stored score unchanged.
 */
export async function submitScore(enrollmentId: string, runId: string, score: number, nowMs: number = Date.now()): Promise<{ score: number; seconds_used: number; replayed: boolean }> {
  const s = store();
  await s.ensureSchema();
  return s.withDayLock(lockKey(enrollmentId, centralDateKey(nowMs)), async (tx) => {
    const found = await s.findRun(runId, tx);
    if (found && found.enrollment_id === enrollmentId && found.submitted_at && found.score !== null) {
      return { score: found.score, seconds_used: found.seconds_used, replayed: true };
    }
    const run = await ownRun(s, enrollmentId, runId, tx, nowMs);
    const { seconds } = await credit(s, run, tx, nowMs);
    if (!acceptScore(run.game as GameId, score, seconds)) throw new GameRoomError('That score is more than this game could have earned.', 'ScoreRejected');
    const fresh = (await s.findRun(runId, tx)) as RunRow;
    const stored = await s.updateRunIf(runId, fresh.last_beat_at, { score, submitted_at: new Date(nowMs) }, tx);
    if (stored !== 1) throw new GameRoomError('That game is over.', 'RunClosed');
    return { score, seconds_used: seconds, replayed: false };
  });
}

/** Best accepted score per person this Central week (Monday 00:00 CT), dense rank; a learner with no cohort sees only themselves. */
export async function leaderboard(enrollmentId: string, cohortId: string | null, game: GameId, nowMs: number = Date.now()): Promise<{ week_start: string; rows: BoardRow[] }> {
  const s = store();
  await s.ensureSchema();
  const since = centralWeekStart(nowMs);
  const rows = await s.scoresSince({ game, since, cohortId, enrollmentId });
  const best = new Map<string, number>();
  for (const r of rows) best.set(r.enrollment_id, Math.max(best.get(r.enrollment_id) ?? 0, r.score));
  const names = await s.namesFor([...best.keys()]);
  const list = [...best.entries()].map(([id, score]) => ({ id, score, name: names.get(id) || 'Classmate' }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  let rank = 0; let prev: number | null = null;
  return { week_start: since, rows: list.map((r) => { if (r.score !== prev) { rank += 1; prev = r.score; } return { rank, name: r.name, score: r.score, you: r.id === enrollmentId }; }) };
}
