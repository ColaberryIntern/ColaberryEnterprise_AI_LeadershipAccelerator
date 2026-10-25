/**
 * C36 (v8 G5): the Game Room interior is an arcade aisle. Five cabinets (three right, two left), each opening its own game's cabinet
 * and showing "BEST ‹n›" or "NO SCORE YET" and NEW; the champions wall has one row per game; the back board has the time left and the
 * featured game; the card has the meter and five game rows; a finished game refreshes the BEST labels without reopening the room; the
 * room no longer has the single-cabinet spot.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

type Fn = (...a: unknown[]) => Promise<unknown>;
const mockApi: Record<string, Fn> = {};
jest.mock('../games/gameRoomApi', () => {
  const actual = jest.requireActual('../games/gameRoomApi');
  const wrap = (n: string) => (...a: unknown[]) => mockApi[n](...a);
  return { ...actual, fetchGameTime: wrap('fetchGameTime'), fetchGameBoard: wrap('fetchGameBoard'), fetchGameSummary: wrap('fetchGameSummary'), fetchPlayingNow: wrap('fetchPlayingNow') };
});

// eslint-disable-next-line import/first
import { ArcadeCabinets, ArcadeBoard, ChampionsWall, ArcadeCard, CABINET_SLOTS, cabinetScale } from '../games/ArcadeRoom';
// eslint-disable-next-line import/first
import { roomDepth } from '../interior/room3d/roomPlaces';
// eslint-disable-next-line import/first
import { useGameRoomData, type RoomData } from '../games/GameRoomSections';
// eslint-disable-next-line import/first
import { CABINET_EVENT, GAME_FINISHED_EVENT } from '../games/CabinetModal';
// eslint-disable-next-line import/first
import { spotOf } from '../interior/roomSpots';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DATA: RoomData = {
  time: { used_s: 120, cap_s: 900, left_s: 780, resets_at: '2026-10-26T05:00:00.000Z' },
  bests: { 'bug-breaker': 4200 }, ranks: { 'bug-breaker': 3 },
  summary: { week_start: '2026-10-19', your_week: { played: 1, best_game: 'bug-breaker', best_score: 4200, best_rank: 3 },
    champions: [{ game: 'stack-drop', name: 'Alex', avatar_url: null, score: 5410 }, { game: 'token-trail', name: null, avatar_url: null, score: null },
      { game: 'byte-chase', name: 'Bea', avatar_url: null, score: 900 }, { game: 'launch-lab', name: null, avatar_url: null, score: null }, { game: 'bug-breaker', name: 'Cy', avatar_url: null, score: 6000 }],
    recent: [] },
  playing: { count: 0, people: [] }, error: false,
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const q = (s: string) => container.querySelector(s);
/** The room's projection as room3d.css draws it: perspective 0.95 x width from 68% 40%, the floor depth from roomDepth. */
function centresCovered(fw: number, fh: number): number[] {
  const persp = fw * 0.95, d = roomDepth(fw), ox = fw * 0.68, oy = fh * 0.4, k = cabinetScale(fw), w = 130 * k, h = 230 * k;
  const boxes = CABINET_SLOTS.map(({ x, z }) => {
    const s = persp / (persp + d * z), px = (v: number) => ox + (v - ox) * s, py = (v: number) => oy + (v - oy) * s;
    return { z, l: px(fw * x - w / 2), r: px(fw * x + w / 2), t: py(fh - h), b: py(fh), cx: px(fw * x), cy: py(fh - h / 2) };
  });
  return boxes.flatMap((b, i) => (boxes.some((o) => o.z < b.z && b.cx > o.l && b.cx < o.r && b.cy > o.t && b.cy < o.b) ? [i] : []));
}

it('no cabinet hides the middle of another, from a phone room to a wide one (fidelity 30 clicked Bug Breaker and got Launch Lab)', () => {
  for (const [fw, fh] of [[340, 300], [390, 330], [592, 420], [720, 520], [900, 600], [1100, 640]]) expect([fw, centresCovered(fw, fh)]).toEqual([fw, []]);
  expect(cabinetScale(1000)).toBe(1);
  expect(cabinetScale(390)).toBeCloseTo(0.45, 2);
});

const flush = async () => { for (let i = 0; i < 8; i += 1) await act(async () => { await Promise.resolve(); }); };

it('five cabinets, three right and two left; each opens its own game; BEST or NO SCORE YET; NEW on the new games', () => {
  const opened: unknown[] = [];
  const on = (e: Event) => opened.push((e as CustomEvent).detail);
  window.addEventListener(CABINET_EVENT, on);
  act(() => { root.render(<ArcadeCabinets d={DATA} fw={900} fh={560} depth={600} />); });
  expect(container.querySelectorAll('[data-testid^="cm-cabinet-"][role="button"]')).toHaveLength(5);
  expect(CABINET_SLOTS.filter((s) => s.x > 0.5)).toHaveLength(3);
  expect(q('[data-testid="cm-cabinet-best-bug-breaker"]')!.textContent).toBe('BEST 4,200');
  expect(q('[data-testid="cm-cabinet-best-stack-drop"]')!.textContent).toBe('NO SCORE YET');
  expect(q('[data-testid="cm-cabinet-stack-drop"]')!.textContent).toContain('NEW');
  expect(q('[data-testid="cm-cabinet-bug-breaker"]')!.textContent).not.toContain('NEW');
  act(() => { (q('[data-testid="cm-cabinet-bug-breaker"]') as HTMLElement).click(); });
  act(() => { (q('[data-testid="cm-cabinet-token-trail"]') as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  expect(opened).toEqual(['bug-breaker', 'token-trail']);
  window.removeEventListener(CABINET_EVENT, on);
});

it('the champions wall: one row per game (no champion shows a dash) and it opens the leaderboards; the board shows the time left', () => {
  const opened: string[] = [];
  act(() => { root.render(<><ChampionsWall d={DATA} onOpen={(r) => opened.push(r)} /><ArcadeBoard d={DATA} onOpen={(r) => opened.push(r)} /></>); });
  expect(container.querySelectorAll('[data-testid="cm-champions"] .r')).toHaveLength(5);
  expect(q('[data-testid="cm-champions"]')!.textContent).toContain('5,410');
  expect(q('[data-testid="cm-arc-left"]')!.textContent).toBe('⏱ 13:00 LEFT TODAY');
  act(() => { (q('[data-testid="cm-champions"]') as HTMLButtonElement).click(); });
  expect(opened).toEqual(['/portal/game-room']);
});

it('no time left: the board\'s Play is off', () => {
  act(() => { root.render(<ArcadeBoard d={{ ...DATA, time: { ...DATA.time!, left_s: 0 } }} onOpen={() => undefined} />); });
  expect((q('[data-testid="cm-board-primary"]') as HTMLButtonElement).disabled).toBe(true);
});

it('the card: the meter, five game rows with best and rank or "No score yet"', () => {
  mockApi.fetchGameBoard = async () => ({ week_start: '2026-10-19', rows: [], me: null });
  act(() => { root.render(<ArcadeCard d={DATA} onOpen={() => undefined} />); });
  expect(q('[data-testid="cm-arc-meter"]')!.textContent).toContain('13:00');
  expect(container.querySelectorAll('[data-testid^="cm-arc-game-"]')).toHaveLength(5);
  expect(q('[data-testid="cm-arc-game-bug-breaker"]')!.textContent).toContain('Your best 4,200 · #3 this week');
  expect(q('[data-testid="cm-arc-game-stack-drop"]')!.textContent).toContain('No score yet');
});

it('a finished game refreshes the BEST labels without reopening the room', async () => {
  let best = 100;
  Object.assign(mockApi, {
    fetchGameTime: async () => DATA.time,
    fetchGameBoard: async (g: unknown) => ({ week_start: '2026-10-19', rows: [], me: g === 'stack-drop' ? { best, rank: 1 } : null }),
    fetchGameSummary: async () => DATA.summary,
    fetchPlayingNow: async () => DATA.playing,
  });
  function Room(): React.ReactElement { const d = useGameRoomData(true); return <ArcadeCabinets d={d} fw={900} fh={560} depth={600} />; }
  act(() => { root.render(<Room />); });
  await flush();
  expect(q('[data-testid="cm-cabinet-best-stack-drop"]')!.textContent).toBe('BEST 100');
  best = 750;
  await act(async () => { window.dispatchEvent(new CustomEvent(GAME_FINISHED_EVENT, { detail: 'stack-drop' })); });
  await flush();
  expect(q('[data-testid="cm-cabinet-best-stack-drop"]')!.textContent).toBe('BEST 750');
});

it('the Game Room has no single-cabinet spot any more', () => {
  expect(spotOf('arcade')).toBeNull();
});
