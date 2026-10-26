/**
 * C30 (v7 R3), carried into v14: the Community Board on the Quad from the outside. Where to? finds it; the sign on the map is focusable
 * and Enter opens the board (walking you there); and (v14 B5, C70) the sign and the side panel's chip show the same badge, from the
 * server's counts (notes new since your last look plus new replies on your posts), capped at 9+. The board itself: communityBoardV14.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const mockGetBoard = jest.fn();
jest.mock('../board/boardData', () => ({ ...jest.requireActual('../board/boardData'), getBoard: (...a: unknown[]) => mockGetBoard(...a) }));

// eslint-disable-next-line import/first
import BoardSign from '../board/BoardSign';
// eslint-disable-next-line import/first
import { BoardChipBadge } from '../board/BoardChipBadge';
// eslint-disable-next-line import/first
import { BOARD_EVENT } from '../board/boardApi';
// eslint-disable-next-line import/first
import { __resetBoardBadgeForTests } from '../board/useBoardBadge';
// eslint-disable-next-line import/first
import { means } from '../board/boardModel';
// eslint-disable-next-line import/first
import { searchCampus } from '../campusSearch';
// eslint-disable-next-line import/first
import { wayfinderSearch } from '../wayfinderIndex';
// eslint-disable-next-line import/first
import { CAMPUS_BUILDINGS } from '../campusMap';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const counts = (newCount: number, replies: number) => ({ new_since: { at: null, count: newCount, by_lane: {} }, my_new_replies: replies });

it('Where to? words find it, on pages and in the home Wayfinder; other words do not', () => {
  for (const w of ['community', 'post', 'question', 'ask', 'board', 'forum']) expect(means(w)).toBe(true);
  expect(means('library')).toBe(false);
  expect(searchCampus('forum', [...CAMPUS_BUILDINGS], null, false)[0]).toMatchObject({ kind: 'board', label: 'Community Board', detail: 'on the Quad · Walk →' });
  expect(searchCampus('library', [...CAMPUS_BUILDINGS], null, false).some((r) => r.kind === 'board')).toBe(false);
  const ctx = { audience: 'member' as const, workplace: false, buildings: [...CAMPUS_BUILDINGS], accessOf: () => 'open' as const, presence: null, desks: [], urgent: null, suggested: [] };
  expect(wayfinderSearch('question', ctx).some((i) => i.kind === 'board')).toBe(true);
  expect(wayfinderSearch('library', ctx).some((i) => i.kind === 'board')).toBe(false);
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  __resetBoardBadgeForTests();
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  mockGetBoard.mockReset();
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
const q = (s: string) => container.querySelector(s);
const flush = async () => { for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); }); };

describe('the sign on the map', () => {
  it('is focusable, Enter opens the board with a walk, and the badge is new notes plus new replies, from the light counts call', async () => {
    mockGetBoard.mockResolvedValue(counts(2, 1));
    const opened: unknown[] = [];
    const on = (e: Event) => opened.push((e as CustomEvent).detail);
    window.addEventListener(BOARD_EVENT, on);
    act(() => { root.render(<svg><BoardSign /></svg>); });
    await flush();
    expect(mockGetBoard).toHaveBeenCalledWith({ countsOnly: true });
    const sign = q('[data-testid="cm-cboard-sign"]') as unknown as SVGGElement;
    expect(sign.getAttribute('tabindex')).toBe('0');
    expect(q('[data-testid="cm-cboard-badge"]')!.textContent).toBe('3');
    act(() => { sign.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(opened).toEqual([{ walk: true }]);
    expect(q('[data-testid="cm-cboard-badge"]')).toBeNull();
    window.removeEventListener(BOARD_EVENT, on);
  });

  it('the sign and the chip share one poll and one number, capped at 9+', async () => {
    mockGetBoard.mockResolvedValue(counts(11, 2));
    act(() => { root.render(<><svg><BoardSign /></svg><BoardChipBadge /></>); });
    await flush();
    expect(mockGetBoard).toHaveBeenCalledTimes(1);
    expect(q('[data-testid="cm-cboard-badge"]')!.textContent).toBe('9+');
    expect(q('[data-testid="cb-chip-badge"]')!.textContent).toBe('9+');
  });

  it('nothing new: no badge on either', async () => {
    mockGetBoard.mockResolvedValue(counts(0, 0));
    act(() => { root.render(<><svg><BoardSign /></svg><BoardChipBadge /></>); });
    await flush();
    expect(q('[data-testid="cm-cboard-badge"]')).toBeNull();
    expect(q('[data-testid="cb-chip-badge"]')).toBeNull();
  });
});
