/**
 * C10 Game Room page: the server owns the clock. Pilot off, time from the server, "Back tomorrow" at the cap with the Central reset,
 * beats every 15 s only while playing, one failed beat warns and two stop (and still submit the score), a cap reached mid-game stops
 * and submits, a refused start shows the cap, the leaderboard, and copy that never says "free".
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

type Fn = (...a: unknown[]) => Promise<unknown>;
const mockApi: Record<string, Fn> = {};
const mockCalls: Array<[string, unknown[]]> = [];
jest.mock('../../today/PortalShell', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div> }));
jest.mock('../../../../components/campus/games/gameRoomApi', () => {
  const actual = jest.requireActual('../../../../components/campus/games/gameRoomApi');
  const wrap = (n: string) => (...a: unknown[]) => { mockCalls.push([n, a]); return mockApi[n](...a); };
  return { ...actual, fetchGameTime: wrap('fetchGameTime'), startGameRun: wrap('startGameRun'), beatGameRun: wrap('beatGameRun'), submitGameScore: wrap('submitGameScore'), fetchGameBoard: wrap('fetchGameBoard') };
});

// eslint-disable-next-line import/first
import GameRoomPage from '../GameRoomPage';
// eslint-disable-next-line import/first
import { GameApiError } from '../../../../components/campus/games/gameRoomApi';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RUN = '11111111-1111-4111-8111-111111111111';
const apiErr = (status: number, cls: string) => new GameApiError(cls, status, cls);
const TIME = { used_s: 60, cap_s: 900, left_s: 840, resets_at: '2026-10-20T05:00:00.000Z' };

let container: HTMLDivElement;
let root: Root;
const flush = async () => { for (let i = 0; i < 8; i += 1) await act(async () => { await Promise.resolve(); }); };
async function mount(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { root = createRoot(container); root.render(<GameRoomPage />); });
  await flush();
}
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const calls = (n: string) => mockCalls.filter((c) => c[0] === n);
const advance = async (ms: number) => { await act(async () => { jest.advanceTimersByTime(ms); }); await flush(); };

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
    fetchGameBoard: async () => ({ week_start: '2026-10-19', rows: [{ rank: 1, name: 'Alex', score: 900, you: true }, { rank: 2, name: 'Bea', score: 400, you: false }] }),
  });
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.useRealTimers(); });

const play = async () => { await act(async () => { (q('gr-play') as HTMLButtonElement).click(); }); await flush(); };

it('pilot off: says the Game Room opens with the campus, and offers no game', async () => {
  mockApi.fetchGameTime = async () => { throw apiErr(403, 'CampusNotEnabled'); };
  await mount();
  expect(q('gr-pilot-off')?.textContent).toBe('The Game Room opens with the campus.');
  expect(q('gr-play')).toBeNull();
});

it('shows the time left from the server and the weekly leaderboard', async () => {
  await mount();
  expect(q('gr-time')?.textContent).toBe('14:00 left today');
  expect(q('gr-board')?.textContent).toContain('Alex (you)');
  expect(container.textContent).toContain('Games never change your learning points.');
  expect(container.textContent).not.toMatch(/\bfree\b/i);
});

it('at the cap: Back tomorrow, with the reset in Central time, and no Play button', async () => {
  mockApi.fetchGameTime = async () => ({ ...TIME, used_s: 900, left_s: 0 });
  await mount();
  expect(q('gr-capped')?.textContent).toContain('Back tomorrow');
  expect(q('gr-capped')?.textContent).toContain('12:00 AM CDT');
  expect(q('gr-play')).toBeNull();
});

it('beats every 15 s only while playing', async () => {
  await mount();
  await advance(30_000);
  expect(calls('beatGameRun')).toHaveLength(0);
  await play();
  expect(calls('startGameRun')[0][1]).toEqual(['byte-chase']);
  expect(q('gr-canvas')).not.toBeNull();
  await advance(15_000);
  expect(calls('beatGameRun')).toEqual([['beatGameRun', [RUN]]]);
  await advance(15_000);
  expect(calls('beatGameRun')).toHaveLength(2);
});

it('one failed beat warns and keeps playing; a second stops the game and still submits its score', async () => {
  mockApi.beatGameRun = async () => { throw apiErr(500, 'GameRoomUnavailable'); };
  await mount();
  await play();
  await advance(15_000);
  expect(q('gr-warning')?.textContent).toBe('Time is not syncing');
  expect(q('gr-canvas')).not.toBeNull();
  await advance(15_000);
  expect(q('gr-canvas')).toBeNull();
  expect(calls('submitGameScore')).toEqual([['submitGameScore', [RUN, 0]]]);
  expect(q('gr-result')?.textContent).toBe('Score saved: 0.');
});

it('a cap reached mid-game stops the game, shows Back tomorrow, and submits the score', async () => {
  mockApi.beatGameRun = async () => { throw apiErr(403, 'CapReached'); };
  await mount();
  await play();
  await advance(15_000);
  expect(q('gr-capped')).not.toBeNull();
  expect(calls('submitGameScore')).toHaveLength(1);
});

it('a run that crossed midnight stops without a score', async () => {
  mockApi.beatGameRun = async () => { throw apiErr(403, 'RunExpired'); };
  await mount();
  await play();
  await advance(15_000);
  expect(q('gr-canvas')).toBeNull();
  expect(q('gr-result')?.textContent).toBe('That game ran past midnight Central, so its score was not counted. Start a new game.');
  expect(calls('submitGameScore')).toHaveLength(0);
});

it('a refused start (cap reached on the server) shows Back tomorrow and never draws a game', async () => {
  mockApi.startGameRun = async () => { throw apiErr(403, 'CapReached'); };
  await mount();
  await play();
  expect(q('gr-capped')).not.toBeNull();
  expect(q('gr-canvas')).toBeNull();
});

it('picking another game changes the leaderboard and the Play button', async () => {
  await mount();
  await act(async () => { (q('gr-pick-bug-breaker') as HTMLButtonElement).click(); });
  await flush();
  expect(calls('fetchGameBoard').map((c) => c[1][0])).toContain('bug-breaker');
  expect(q('gr-play')?.textContent).toBe('Play Bug Breaker');
});
