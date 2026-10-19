/**
 * C10 Game Room service against an in-memory store whose withDayLock is a REAL mutex and whose updateRunIf is conditional, so the
 * races the server must survive are exercised: two beats at once, two tabs with 20 s left, a run across midnight Central.
 */
import { randomUUID } from 'crypto';
import { startRun, beat, submitScore, timeFor, leaderboard, GameRoomError, __setGameRoomStoreForTests } from '../gameRoomService';
import type { GameRoomStore, RunRow } from '../gameRoomStore';
import { DAILY_CAP_S } from '../gameRoomTime';
import { maxScoreFor } from '../gameRoomRules';

const runs: RunRow[] = [];
const names = new Map<string, string>();
const locks = new Map<string, Promise<unknown>>();
let lockCalls: string[] = [];

const memStore: GameRoomStore = {
  ensureSchema: async () => undefined,
  withDayLock: async (key, fn) => {
    lockCalls.push(key);
    const prev = locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((r) => { release = r; });
    locks.set(key, prev.then(() => mine));
    await prev;
    try { return await fn(undefined); } finally { release(); }
  },
  findRun: async (id) => { const r = runs.find((x) => x.id === id); return r ? { ...r } : null; },
  usedOn: async (e, d) => runs.filter((r) => r.enrollment_id === e && r.central_date === d).reduce((a, r) => a + r.seconds_used, 0),
  insertRun: async (row) => { const r = { id: randomUUID(), ...row }; runs.push(r); return { ...r }; },
  updateRunIf: async (id, seen, patch) => {
    // yield first, so a racing caller without the lock would interleave here
    await new Promise((r) => setImmediate(r));
    const r = runs.find((x) => x.id === id);
    if (!r || r.submitted_at || new Date(r.last_beat_at).getTime() !== new Date(seen).getTime()) return 0;
    Object.assign(r, patch);
    return 1;
  },
  scoresSince: async ({ game, since, cohortId, enrollmentId }) => runs
    .filter((r) => r.game === game && r.central_date >= since && r.score !== null && (cohortId ? r.cohort_id === cohortId : r.enrollment_id === enrollmentId))
    .map((r) => ({ enrollment_id: r.enrollment_id, score: r.score as number })),
  namesFor: async (ids) => new Map(ids.filter((i) => names.has(i)).map((i) => [i, names.get(i) as string])),
};

const T = (iso: string) => Date.parse(iso);
const NOON = T('2026-10-19T17:00:00Z'); // Monday 12:00 CDT
const s = (n: number) => NOON + n * 1000;
const E = 'enr-a';

beforeEach(() => { runs.length = 0; names.clear(); locks.clear(); lockCalls = []; __setGameRoomStoreForTests(memStore); });
afterAll(() => __setGameRoomStoreForTests(null));

const err = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return (e as GameRoomError).error_class; } };

describe('crediting time', () => {
  it('beats credit the measured gap (at most 30 s) under the learner-day lock', async () => {
    const { run_id } = await startRun(E, 'coh', 'byte-chase', NOON);
    expect((await beat(E, run_id, s(15))).left_s).toBe(DAILY_CAP_S - 15);
    expect((await beat(E, run_id, s(200))).left_s).toBe(DAILY_CAP_S - 45); // a 185 s silence earns 30 s
    expect(lockCalls.every((k) => k === `game_room:${E}:2026-10-19`)).toBe(true);
  });

  it('two beats on the same run fired together credit the gap ONCE', async () => {
    const { run_id } = await startRun(E, 'coh', 'byte-chase', NOON);
    await Promise.all([beat(E, run_id, s(15)), beat(E, run_id, s(15))]);
    expect((await timeFor(E, s(15))).used_s).toBe(15);
  });

  it('two tabs with 20 s left credit 20 s in total, never past 900', async () => {
    runs.push({ id: 'old', enrollment_id: E, cohort_id: 'coh', game: 'bug-breaker', central_date: '2026-10-19', started_at: new Date(NOON - 3600e3), last_beat_at: new Date(NOON - 3600e3), seconds_used: DAILY_CAP_S - 20, score: 10, submitted_at: new Date(NOON - 3000e3) });
    const a = await startRun(E, 'coh', 'byte-chase', NOON);
    const b = await startRun(E, 'coh', 'launch-lab', NOON);
    await Promise.allSettled([beat(E, a.run_id, s(25)), beat(E, b.run_id, s(25))]);
    expect((await timeFor(E, s(25))).used_s).toBe(DAILY_CAP_S);
    expect(runs.reduce((acc, r) => acc + r.seconds_used, 0)).toBe(DAILY_CAP_S);
  });

  it('a client that never beats gets nothing extra; there is no way to send a duration', async () => {
    const { run_id } = await startRun(E, 'coh', 'bug-breaker', NOON);
    const r = await submitScore(E, run_id, 100, s(600)); // ten minutes of silence, then a submit
    expect(r.seconds_used).toBe(30);
  });

  it('at the cap: start and beat refuse with CapReached', async () => {
    runs.push({ id: 'full', enrollment_id: E, cohort_id: 'coh', game: 'bug-breaker', central_date: '2026-10-19', started_at: new Date(NOON), last_beat_at: new Date(NOON), seconds_used: DAILY_CAP_S - 10, score: null, submitted_at: null });
    expect(await err(beat(E, 'full', s(30)))).toBe('CapReached');
    expect(await err(startRun(E, 'coh', 'byte-chase', s(31)))).toBe('CapReached');
    expect((await timeFor(E, s(31))).left_s).toBe(0);
  });

  it('a run started at 23:59:50 CT earns at most 10 s, then is RunExpired after midnight', async () => {
    const start = T('2026-10-20T04:59:50Z');
    const { run_id } = await startRun(E, 'coh', 'byte-chase', start);
    await beat(E, run_id, T('2026-10-20T04:59:59Z'));
    expect(await err(beat(E, run_id, T('2026-10-20T05:00:10Z')))).toBe('RunExpired');
    expect(await err(submitScore(E, run_id, 10, T('2026-10-20T05:00:10Z')))).toBe('RunExpired');
    expect((await timeFor(E, T('2026-10-20T05:00:10Z'))).used_s).toBe(0); // the new day starts clean
    expect(runs[0].seconds_used).toBe(9);
  });

  it('someone else\'s run is RunNotFound; a finished run cannot be beaten', async () => {
    const { run_id } = await startRun(E, 'coh', 'byte-chase', NOON);
    expect(await err(beat('enr-b', run_id, s(10)))).toBe('RunNotFound');
    await submitScore(E, run_id, 10, s(10));
    expect(await err(beat(E, run_id, s(20)))).toBe('RunClosed');
  });
});

describe('scores', () => {
  it('submit credits the last gap, then accepts up to the ceiling for the run\'s server seconds', async () => {
    const { run_id } = await startRun(E, 'coh', 'bug-breaker', NOON);
    await beat(E, run_id, s(15));
    const max = maxScoreFor('bug-breaker', 30); // 15 + the submit's own 15 s gap
    expect(await err(submitScore(E, run_id, max + 1, s(30)))).toBe('ScoreRejected');
    const ok = await submitScore(E, run_id, max, s(30));
    expect(ok).toEqual({ score: max, seconds_used: 30, replayed: false });
  });

  it('submitting the same run twice keeps one score (the first)', async () => {
    const { run_id } = await startRun(E, 'coh', 'bug-breaker', NOON);
    await submitScore(E, run_id, 500, s(20));
    const again = await submitScore(E, run_id, 900, s(25));
    expect(again).toMatchObject({ score: 500, replayed: true });
    expect(runs.filter((r) => r.score !== null)).toHaveLength(1);
  });

  it('a non-integer or negative score is refused', async () => {
    const { run_id } = await startRun(E, 'coh', 'bug-breaker', NOON);
    expect(await err(submitScore(E, run_id, 1.5, s(20)))).toBe('ScoreRejected');
    expect(await err(submitScore(E, run_id, -1, s(20)))).toBe('ScoreRejected');
  });
});

describe('leaderboard', () => {
  const run = (e: string, cohort: string | null, game: string, date: string, score: number | null): RunRow => ({ id: randomUUID(), enrollment_id: e, cohort_id: cohort, game, central_date: date, started_at: new Date(NOON), last_beat_at: new Date(NOON), seconds_used: 60, score, submitted_at: score === null ? null : new Date(NOON) });

  it('best score per person this Central week, dense rank, cohort only, names with a Classmate fallback', async () => {
    names.set(E, 'Alex'); names.set('b', 'Bea');
    runs.push(run(E, 'coh', 'byte-chase', '2026-10-19', 300), run(E, 'coh', 'byte-chase', '2026-10-20', 500),
      run('b', 'coh', 'byte-chase', '2026-10-21', 500), run('c', 'coh', 'byte-chase', '2026-10-21', 200),
      run('d', 'other', 'byte-chase', '2026-10-21', 9000), run('b', 'coh', 'byte-chase', '2026-10-18', 9999),
      run('b', 'coh', 'launch-lab', '2026-10-21', 7000), run('e', 'coh', 'byte-chase', '2026-10-21', null));
    const board = await leaderboard(E, 'coh', 'byte-chase', T('2026-10-22T17:00:00Z'));
    expect(board.week_start).toBe('2026-10-19');
    expect(board.rows).toEqual([
      { rank: 1, name: 'Alex', score: 500, you: true },
      { rank: 1, name: 'Bea', score: 500, you: false },
      { rank: 2, name: 'Classmate', score: 200, you: false },
    ]);
  });

  it('no cohort: only your own best', async () => {
    runs.push(run(E, null, 'bug-breaker', '2026-10-19', 40), run('x', null, 'bug-breaker', '2026-10-19', 900));
    const board = await leaderboard(E, null, 'bug-breaker', NOON);
    expect(board.rows).toEqual([{ rank: 1, name: 'Classmate', score: 40, you: true }]);
  });
});
