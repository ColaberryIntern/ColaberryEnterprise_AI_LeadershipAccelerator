/**
 * C34 (v8 G1 + G2) Game Room page and cabinet; C10's server-owned clock still holds. Pilot off; the hero's break left and featured game;
 * Your week and Champions from the summary; five game cards; Play opens the cabinet and starts a run; beats every 15 s only while
 * playing; one failed beat warns and two stop (and still submit); the break running out mid-game shows BREAK'S OVER and Play again is
 * off; the leaderboard's podium, your row and the scope toggle; "Set one" with no score; a recent high's Challenge; never "free".
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

type Fn = (...a: unknown[]) => Promise<unknown>;
const mockApi: Record<string, Fn> = {};
const mockCalls: Array<[string, unknown[]]> = [];
jest.mock('../../today/PortalShell', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div> }));
jest.mock('../../../../components/campus/campusApi', () => ({ fetchCampusPresence: () => Promise.resolve({}) }));
jest.mock('../../../../components/campus/games/gameRoomApi', () => {
  const actual = jest.requireActual('../../../../components/campus/games/gameRoomApi');
  const wrap = (n: string) => (...a: unknown[]) => { mockCalls.push([n, a]); return mockApi[n](...a); };
  return { ...actual, fetchGameTime: wrap('fetchGameTime'), startGameRun: wrap('startGameRun'), beatGameRun: wrap('beatGameRun'), submitGameScore: wrap('submitGameScore'),
    fetchGameBoard: wrap('fetchGameBoard'), fetchGameSummary: wrap('fetchGameSummary'), fetchPlayingNow: wrap('fetchPlayingNow'), challengeFriend: wrap('challengeFriend') };
});

// eslint-disable-next-line import/first
import GameRoomPage from '../GameRoomPage';
// eslint-disable-next-line import/first
import { GameApiError } from '../../../../components/campus/games/gameRoomApi';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RUN = '11111111-1111-4111-8111-111111111111';
const apiErr = (status: number, cls: string) => new GameApiError(cls, status, cls);
const TIME = { used_s: 60, cap_s: 900, left_s: 840, resets_at: '2026-10-20T05:00:00.000Z' };
const ROW = (rank: number, name: string, score: number, you = false) => ({ rank, name, display_name: name, avatar_url: null, rung_name: 'AI Aware I', cohort_name: 'Cohort 7', score, you });
const SUMMARY = {
  week_start: '2026-10-19', your_week: { played: 3, best_game: 'stack-drop', best_score: 900, best_rank: 2 },
  champions: [{ game: 'stack-drop', name: 'Alex', avatar_url: null, score: 1200 }, { game: 'token-trail', name: null, avatar_url: null, score: null }],
  recent: [{ kind: 'top', name: 'Alex', enrollment_id: 'enr-alex', game: 'stack-drop', score: 1200, at: new Date().toISOString() }],
};

let container: HTMLDivElement;
let root: Root;
const flush = async () => { for (let i = 0; i < 10; i += 1) await act(async () => { await Promise.resolve(); }); };
async function mount(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { root = createRoot(container); root.render(<MemoryRouter><GameRoomPage /></MemoryRouter>); });
  await flush();
}
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const calls = (n: string) => mockCalls.filter((c) => c[0] === n);
const advance = async (ms: number) => { await act(async () => { jest.advanceTimersByTime(ms); }); await flush(); };
const click = async (id: string) => { await act(async () => { (q(id) as HTMLButtonElement).click(); }); await flush(); };

beforeEach(() => {
  jest.useFakeTimers();
  window.requestAnimationFrame = (() => 0) as typeof window.requestAnimationFrame; // the game loop does not run in jsdom
  window.cancelAnimationFrame = (() => undefined) as typeof window.cancelAnimationFrame;
  mockCalls.length = 0;
  Object.assign(mockApi, {
    fetchGameTime: async () => TIME,
    startGameRun: async () => ({ run_id: RUN, left_s: 840 }),
    beatGameRun: async () => ({ left_s: 825 }),
    submitGameScore: async (_id: unknown, score: unknown) => ({ score, seconds_used: 30, replayed: false }),
    fetchGameBoard: async () => ({ week_start: '2026-10-19', rows: [ROW(1, 'Alex', 1200), ROW(2, 'Ana Ruiz', 900, true), ROW(3, 'Bea', 400), ROW(4, 'Cy', 100)], me: { best: 900, rank: 2 } }),
    fetchGameSummary: async () => SUMMARY,
    fetchPlayingNow: async () => ({ count: 1, people: [{ name: 'Sam', game: 'token-trail' }] }),
    challengeFriend: async () => ({ sent: true, reason: 'sent' }),
  });
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.useRealTimers(); });

it('pilot off: says the Game Room opens with the campus, and offers no game', async () => {
  mockApi.fetchGameTime = async () => { throw apiErr(403, 'CampusNotEnabled'); };
  mockApi.fetchGameSummary = async () => { throw apiErr(403, 'CampusNotEnabled'); };
  await mount();
  expect(q('gr-pilot-off')?.textContent).toBe('The Game Room opens with the campus.');
  expect(q('gr-games')).toBeNull();
});

it('the hero, Your week, Champions, five game cards, playing now; the lead says what the room is; never "free"', async () => {
  await mount();
  expect(q('gr-hero-time')?.textContent).toBe('14:00');
  expect(q('gr-hero')?.textContent).toContain('Resets at midnight Central');
  expect(container.querySelectorAll('[data-testid^="gr-card-"]')).toHaveLength(5);
  expect(q('gr-your-week')?.textContent).toContain('Stack Drop');
  expect(q('gr-your-week')?.textContent).toContain('#2');
  expect(q('gr-champions')?.textContent).toContain('Alex · 1,200');
  expect(q('gr-champions')?.textContent).toContain('No champion yet');
  expect(q('gr-playing')?.textContent).toContain('Playing now · 1');
  expect(container.textContent).toContain('games never change your learning points');
  expect(container.textContent).not.toMatch(/\bfree\b/i);
});

it('at the cap the hero says so and Play is off', async () => {
  mockApi.fetchGameTime = async () => ({ ...TIME, used_s: 900, left_s: 0 });
  await mount();
  expect(q('gr-hero')?.textContent).toContain('That’s your 15 minutes · back tomorrow');
  expect((q('gr-hero-play') as HTMLButtonElement).disabled).toBe(true);
  expect((q('gr-play-stack-drop') as HTMLButtonElement).disabled).toBe(true);
});

it('Play opens the cabinet and starts a run; beats every 15 s only while playing', async () => {
  await mount();
  await advance(30_000);
  expect(calls('beatGameRun')).toHaveLength(0);
  await click('gr-play-token-trail');
  expect(q('gr-cab-title')?.textContent).toBe('TOKEN TRAIL');
  expect(calls('startGameRun')[0][1]).toEqual(['token-trail']);
  expect(q('gr-canvas')).not.toBeNull();
  await advance(15_000);
  expect(calls('beatGameRun')).toEqual([['beatGameRun', [RUN]]]);
});

it('one failed beat warns and keeps playing; a second stops the game and still submits its score', async () => {
  mockApi.beatGameRun = async () => { throw apiErr(500, 'GameRoomUnavailable'); };
  await mount();
  await click('gr-play-stack-drop');
  await advance(15_000);
  expect(q('gr-warning')?.textContent).toBe('Time is not syncing');
  expect(q('gr-canvas')).not.toBeNull();
  await advance(15_000);
  expect(q('gr-canvas')).toBeNull();
  expect(calls('submitGameScore')).toEqual([['submitGameScore', [RUN, 0]]]);
});

it('the break running out mid-game submits, shows BREAK’S OVER with your best and rank, and Play again is off', async () => {
  mockApi.beatGameRun = async () => { throw apiErr(403, 'CapReached'); };
  await mount();
  await click('gr-play-stack-drop');
  await advance(15_000);
  expect(calls('submitGameScore')).toHaveLength(1);
  expect(q('gr-cab-over')?.textContent).toContain('BREAK’S OVER');
  expect(q('gr-cab-over')?.textContent).toContain('Your best: 900 · #2 on this week’s cohort board');
  expect((q('gr-cab-again') as HTMLButtonElement).disabled).toBe(true);
});

it('the leaderboard: podium, rows from #4, your row highlighted; Everyone asks with scope=all', async () => {
  await mount();
  expect(q('gr-podium')?.textContent).toContain('Alex');
  expect(container.querySelector('.gr-podium .step.s1')?.textContent).toContain('Alex'); // #1 in the middle
  expect(container.querySelector('.gr-podium .is-you')?.textContent).toContain('Ana');
  expect(container.querySelector('.gr-lb-rows')?.textContent).toContain('#4');
  await act(async () => { (Array.from(container.querySelectorAll('.gr-lb-toggles button')).find((b) => b.textContent === 'Everyone') as HTMLButtonElement).click(); });
  await flush();
  expect(calls('fetchGameBoard').some((c) => c[1][1] === 'all')).toBe(true);
});

it('no score yet: "Set one" opens the cabinet for that game', async () => {
  mockApi.fetchGameBoard = async () => ({ week_start: '2026-10-19', rows: [], me: null });
  await mount();
  expect(q('gr-lb-none')?.textContent).toContain('You don’t have a score in Stack Drop yet');
  await act(async () => { (q('gr-lb-none')!.querySelector('button') as HTMLButtonElement).click(); });
  await flush();
  expect(q('gr-cab-title')?.textContent).toBe('STACK DROP');
});

it('a recent high offers ⚔️ Challenge, which DMs them "beat my ‹best›" through the API', async () => {
  await mount();
  expect(q('gr-recent')?.textContent).toContain('Alex took #1 in Stack Drop · 1,200');
  await act(async () => { (q('gr-recent')!.querySelector('button') as HTMLButtonElement).click(); });
  await flush();
  expect(calls('challengeFriend')[0][1]).toEqual(['enr-alex', 'stack-drop', 900]);
  expect(q('gr-note')?.textContent).toBe('Challenge sent to Alex in Stack Drop.');
});
