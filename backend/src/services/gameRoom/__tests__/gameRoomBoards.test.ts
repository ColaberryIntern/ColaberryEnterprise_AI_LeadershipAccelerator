// C35 (v8 G4): the leaderboard by scope and period with `me` (even outside the top ten), names only as the presence rule allows on
// "Everyone", the week's summary (your week, champions, recent highs) and playing now. The store is the in-memory one.
let mockVisible = new Map<string, { enrollment_id: string; display_name: string; avatar_url: string | null }>();
jest.mock('../../campus/campusPresenceService', () => ({ visibleSetFor: async () => mockVisible }));
jest.mock('../../campus/campusLookService', () => ({ looksFor: async (ids: string[]) => new Map(ids.map((i) => [i, { rung_name: 'AI Aware I' }])) }));

import { memoryGameStore, type MemoryGameStore } from '../gameRoomMemoryStore';
import { __setGameRoomStoreForTests } from '../gameRoomService';
import { board, summary, playingNow, rankBest, recentHighs, TOP_N } from '../gameRoomBoards';

const NOW = Date.parse('2026-10-21T17:00:00Z'); // Wednesday; the week started Monday 2026-10-19
const at = (iso: string) => new Date(iso);
let m: MemoryGameStore;
const person = (id: string, name: string, cohort = 'Cohort 7') => m.profiles.set(id, { display_name: name, avatar_url: null, cohort_name: cohort });
const scored = (id: string, game: string, score: number, o: Partial<Parameters<MemoryGameStore['add']>[0]> = {}) =>
  m.add({ enrollment_id: id, game, score, cohort_id: 'coh-1', central_date: '2026-10-20', submitted_at: at('2026-10-20T15:00:00Z'), ...o });

beforeEach(() => { m = memoryGameStore(); mockVisible = new Map(); __setGameRoomStoreForTests(m.store); });
afterAll(() => __setGameRoomStoreForTests(null));

it('ranks best per person, ties share a rank', () => {
  expect(rankBest([{ enrollment_id: 'a', score: 5 }, { enrollment_id: 'a', score: 9 }, { enrollment_id: 'b', score: 9 }, { enrollment_id: 'c', score: 1 }]).map((r) => [r.id, r.rank]))
    .toEqual([['a', 1], ['b', 1], ['c', 2]]);
});

it('the cohort board: at most ten rows with names, rung and cohort; `me` holds your best and rank even below the top ten', async () => {
  for (let i = 0; i < 12; i += 1) { person(`p${i}`, `Person ${i}`); scored(`p${i}`, 'stack-drop', 1000 - i); }
  person('me', 'Me'); scored('me', 'stack-drop', 10);
  const b = await board('me', 'coh-1', 'stack-drop', 'cohort', 'week', NOW);
  expect(b.rows).toHaveLength(TOP_N);
  expect(b.rows[0]).toEqual({ rank: 1, name: 'Person 0', display_name: 'Person 0', avatar_url: null, rung_name: 'AI Aware I', cohort_name: 'Cohort 7', score: 1000, you: false });
  expect(b.me).toEqual({ best: 10, rank: 13 });
  expect(b.rows.some((r) => r.you)).toBe(false);
});

it('this week vs all time; no score is me: null', async () => {
  person('a', 'Ana');
  scored('a', 'token-trail', 50, { central_date: '2026-10-10' }); // last week
  scored('a', 'token-trail', 20);
  expect((await board('a', 'coh-1', 'token-trail', 'cohort', 'week', NOW)).me).toEqual({ best: 20, rank: 1 });
  expect((await board('a', 'coh-1', 'token-trail', 'cohort', 'all', NOW)).me).toEqual({ best: 50, rank: 1 });
  expect((await board('zed', 'coh-1', 'byte-chase', 'cohort', 'week', NOW)).me).toBeNull();
});

it('"Everyone" names only people the presence rule names (or yourself); others are a Colaberry learner with no photo or cohort', async () => {
  person('me', 'Me'); person('seen', 'Seen Person'); person('stranger', 'Hidden Name', 'Cohort 9');
  scored('me', 'bug-breaker', 5); scored('seen', 'bug-breaker', 30, { cohort_id: 'coh-2' }); scored('stranger', 'bug-breaker', 40, { cohort_id: 'coh-9' });
  mockVisible = new Map([['seen', { enrollment_id: 'seen', display_name: 'Seen Person', avatar_url: null }]]);
  const b = await board('me', 'coh-1', 'bug-breaker', 'all', 'week', NOW);
  expect(b.rows.map((r) => r.name)).toEqual(['Colaberry learner', 'Seen Person', 'Me']);
  expect(b.rows[0]).toMatchObject({ avatar_url: null, rung_name: null, cohort_name: null, score: 40 });
  expect(JSON.stringify(b)).not.toContain('Hidden Name');
});

it('recent highs: a new personal best (over an earlier best) and a #1 takeover; a first score is neither', () => {
  const run = (id: string, score: number, t: string) => ({ enrollment_id: id, game: 'stack-drop', score, submitted_at: at(t) });
  const highs = recentHighs([run('a', 100, '2026-10-20T10:00:00Z'), run('b', 50, '2026-10-20T11:00:00Z'), run('b', 80, '2026-10-20T12:00:00Z'), run('b', 150, '2026-10-20T13:00:00Z')], new Map());
  expect(highs.map((h) => [h.kind, h.enrollment_id, h.score])).toEqual([['best', 'b', 80], ['top', 'b', 150]]);
  expect(recentHighs([run('c', 10, '2026-10-20T10:00:00Z')], new Map([['c|stack-drop', 5]])).map((h) => h.kind)).toEqual(['best']);
});

it('the summary: your week, the champion per game (none where nobody played), recent highs newest first', async () => {
  person('me', 'Me'); person('a', 'Ana');
  scored('me', 'stack-drop', 300, { submitted_at: at('2026-10-20T10:00:00Z') });
  scored('a', 'stack-drop', 400, { submitted_at: at('2026-10-20T11:00:00Z') });
  scored('me', 'token-trail', 90, { submitted_at: at('2026-10-20T12:00:00Z') });
  const s = await summary('me', 'coh-1', NOW);
  expect(s.your_week).toEqual({ played: 2, best_game: 'stack-drop', best_score: 300, best_rank: 1 });
  expect(s.champions.find((c) => c.game === 'stack-drop')).toEqual({ game: 'stack-drop', name: 'Ana', avatar_url: null, score: 400 });
  expect(s.champions.find((c) => c.game === 'launch-lab')).toEqual({ game: 'launch-lab', name: null, avatar_url: null, score: null });
  expect(s.recent[0]).toMatchObject({ kind: 'top', name: 'Ana', game: 'stack-drop', score: 400 });
});

it('playing now: runs that beat in the last 30 s, named only as the presence rule allows; you are not listed', async () => {
  const now = new Date(NOW);
  m.add({ enrollment_id: 'seen', game: 'token-trail', last_beat_at: new Date(NOW - 10_000) });
  m.add({ enrollment_id: 'hidden', game: 'stack-drop', last_beat_at: new Date(NOW - 5_000) });
  m.add({ enrollment_id: 'stale', game: 'stack-drop', last_beat_at: new Date(NOW - 60_000) });
  m.add({ enrollment_id: 'me', game: 'stack-drop', last_beat_at: now });
  mockVisible = new Map([['seen', { enrollment_id: 'seen', display_name: 'Seen', avatar_url: null }]]);
  expect(await playingNow('me', 'coh-1', NOW)).toEqual({ count: 2, people: [{ name: 'Seen', game: 'token-trail' }] });
});
