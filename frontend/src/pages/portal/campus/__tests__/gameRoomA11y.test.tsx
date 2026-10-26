/**
 * C11 + C34 Game Room accessibility: game keys are read from the canvas only (WCAG 2.1.4), so typing anywhere else while a game runs is
 * never swallowed; the canvas takes focus when the cabinet starts a game; the announcer says level, lives and the end, never every score
 * tick; the cabinet is a labelled dialog; the leaderboard's game picker is a group of pressed buttons (not a half-built tablist); and an
 * axe-core sweep finds no wcag2a/wcag2aa violation in either theme, on the page and with the cabinet open.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import axe from 'axe-core';

type Fn = (...a: unknown[]) => Promise<unknown>;
const mockApi: Record<string, Fn> = {};
jest.mock('../../today/PortalShell', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <main data-testid="shell">{children}</main> }));
jest.mock('../../../../components/campus/campusApi', () => ({ fetchCampusPresence: () => Promise.resolve({}) }));
jest.mock('../../../../components/campus/games/gameRoomApi', () => {
  const actual = jest.requireActual('../../../../components/campus/games/gameRoomApi');
  const wrap = (n: string) => (...a: unknown[]) => mockApi[n](...a);
  return { ...actual, fetchGameTime: wrap('fetchGameTime'), startGameRun: wrap('startGameRun'), beatGameRun: wrap('beatGameRun'), submitGameScore: wrap('submitGameScore'),
    fetchGameBoard: wrap('fetchGameBoard'), fetchGameSummary: wrap('fetchGameSummary'), fetchPlayingNow: wrap('fetchPlayingNow'), challengeFriend: wrap('challengeFriend') };
});

// eslint-disable-next-line import/first
import GameRoomPage from '../GameRoomPage';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const flush = async () => { for (let i = 0; i < 10; i += 1) await act(async () => { await Promise.resolve(); }); };
const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
async function mount(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { root = createRoot(container); root.render(<MemoryRouter><GameRoomPage /></MemoryRouter>); });
  await flush();
}
const play = async () => { await act(async () => { (q('gr-play-stack-drop') as HTMLButtonElement).click(); }); await flush(); };
const key = (target: EventTarget, k: string) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
};

beforeEach(() => {
  window.requestAnimationFrame = (() => 0) as typeof window.requestAnimationFrame; // no game loop in jsdom
  window.cancelAnimationFrame = (() => undefined) as typeof window.cancelAnimationFrame;
  Object.assign(mockApi, {
    fetchGameTime: async () => ({ used_s: 60, cap_s: 900, left_s: 840, resets_at: '2026-10-20T05:00:00.000Z' }),
    startGameRun: async () => ({ run_id: '11111111-1111-4111-8111-111111111111', left_s: 840 }),
    beatGameRun: async () => ({ left_s: 825 }),
    submitGameScore: async (_id: unknown, score: unknown) => ({ score, seconds_used: 30, replayed: false }),
    fetchGameBoard: async () => ({ week_start: '2026-10-19', rows: [{ rank: 1, name: 'Alex', display_name: 'Alex', avatar_url: null, rung_name: null, cohort_name: null, score: 900, you: true }], me: { best: 900, rank: 1 } }),
    fetchGameSummary: async () => ({ week_start: '2026-10-19', your_week: { played: 0, best_game: null, best_score: null, best_rank: null }, champions: [], recent: [] }),
    fetchPlayingNow: async () => ({ count: 0, people: [] }),
    challengeFriend: async () => ({ sent: true, reason: 'sent' }),
  });
});
afterEach(() => { act(() => root.unmount()); container.remove(); document.documentElement.removeAttribute('data-theme'); });

describe('game keys stay in the game', () => {
  it('the cabinet is a labelled dialog; its canvas is focusable and takes focus when the game starts', async () => {
    await mount();
    await play();
    expect(q('gr-cabinet')!.getAttribute('role')).toBe('dialog');
    expect(q('gr-cabinet')!.getAttribute('aria-label')).toBe('Stack Drop cabinet');
    const canvas = q('gr-canvas')!;
    expect(canvas.getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(canvas);
  });

  it('an arrow or Space typed in a field elsewhere is NOT swallowed while a game runs', async () => {
    await mount();
    await play();
    const field = document.createElement('input');
    document.body.appendChild(field);
    field.focus();
    expect(key(field, 'ArrowLeft').defaultPrevented).toBe(false);
    expect(key(field, ' ').defaultPrevented).toBe(false);
    expect(key(field, 'a').defaultPrevented).toBe(false);
    field.remove();
  });

  it('the same keys on the canvas ARE taken by the game (no page scroll)', async () => {
    await mount();
    await play();
    const canvas = q('gr-canvas')!;
    expect(key(canvas, 'ArrowLeft').defaultPrevented).toBe(true);
    expect(key(canvas, ' ').defaultPrevented).toBe(true);
  });
});

describe('quiet, meaningful announcements', () => {
  it('the announcer says level and lives only, never the score', async () => {
    await mount();
    await play();
    const said = q('gr-announce')!;
    expect(said.getAttribute('aria-live')).toBe('polite');
    expect(said.textContent).toMatch(/^Level \d+\. (Lives|Orbs) \d+\.$/);
    expect(said.textContent).not.toMatch(/Score/);
  });

  it('the leaderboard game picker is a labelled group of pressed buttons, not a half-built tablist', async () => {
    await mount();
    const group = document.querySelector('.gr-lb-tabs')!;
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBeTruthy();
    expect(Array.from(group.querySelectorAll('button')).filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
    expect(document.querySelector('[role="tab"], [role="tablist"]')).toBeNull();
  });
});

describe.each([['light', null], ['dark', 'dark']])('axe: zero wcag2a/wcag2aa violations (%s)', (_l, theme) => {
  beforeEach(() => { if (theme) document.documentElement.setAttribute('data-theme', theme); });
  it.each([['the page', false], ['with the cabinet open', true]])('%s', async (_s, playing) => {
    await mount();
    if (playing) await play();
    const r = await axe.run(q('shell')!, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
    const violations = r.violations.map((v) => `${v.id} ${v.nodes.map((n) => n.html.slice(0, 100)).join(' | ')}`);
    const unchecked = r.incomplete.map((x) => x.id).filter((id) => id !== 'color-contrast');
    expect({ violations, unchecked }).toEqual({ violations: [], unchecked: [] });
  }, 30_000);
});
