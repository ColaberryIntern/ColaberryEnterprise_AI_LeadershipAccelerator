/**
 * Campus v20 N1 / N4 (C131 / C135): Colaberry Now from the outside. The phone on the Quad (badge, the TV thumbnail rotating every 6 s,
 * still under reduced motion, never a video), the rename everywhere (no "Ask the community" left; Where to? finds it with community,
 * board, post, question, tv, now), the left panel's "New on Colaberry TV" note (once a day, dismissible, only with new shorts), and
 * the guard that nothing else on campus plays Colaberry TV.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const mockGetBoard = jest.fn();
const mockGetTv = jest.fn();
jest.mock('../board/boardData', () => ({ ...jest.requireActual('../board/boardData'), getBoard: (...a: unknown[]) => mockGetBoard(...a) }));
jest.mock('../../../services/colaberryTvApi', () => ({ ...jest.requireActual('../../../services/colaberryTvApi'), getTv: () => mockGetTv() }));
// eslint-disable-next-line import/first
import BoardSign, { PHONE_ROTATE_MS } from '../board/BoardSign';
// eslint-disable-next-line import/first
import { __resetBoardBadgeForTests } from '../board/useBoardBadge';
// eslint-disable-next-line import/first
import { BOARD_EVENT } from '../board/boardApi';
// eslint-disable-next-line import/first
import { means } from '../board/boardModel';
// eslint-disable-next-line import/first
import { __resetTvPeekForTests } from '../now/useTvPeek';
// eslint-disable-next-line import/first
import TvNote from '../home/TvNote';
// eslint-disable-next-line import/first
import { centralDay, dismissTvNote, markTvSeen, newShorts, tvNoteFor } from '../now/tvNote';
// eslint-disable-next-line import/first
import { searchCampus } from '../campusSearch';
// eslint-disable-next-line import/first
import { wayfinderSearch } from '../wayfinderIndex';
// eslint-disable-next-line import/first
import { CAMPUS_BUILDINGS } from '../campusMap';
// eslint-disable-next-line import/first
import { CHIPS } from '../home/CampusConcierge';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const short = (n: number, created = '2026-11-11T15:00:00.000Z') => ({ id: `id-${n}`, youtube_id: `yt_short_0${n}`.slice(0, 11), title: `Short ${n}`, duration_s: null, created_at: created });
const counts = (n: number, r: number) => ({ new_since: { at: null, count: n, by_lane: {} }, my_new_replies: r });

let container: HTMLDivElement;
let root: Root;
const q = (s: string) => container.querySelector(s);
const flush = async () => { for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); }); };
beforeEach(() => {
  __resetBoardBadgeForTests(); __resetTvPeekForTests(); window.localStorage.clear();
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  mockGetBoard.mockReset(); mockGetTv.mockReset();
  mockGetBoard.mockResolvedValue(counts(0, 0));
  mockGetTv.mockResolvedValue({ videos: [short(1), short(2), short(3)], can_manage: false });
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.useRealTimers(); });

describe('the phone on the Quad', () => {
  async function draw(reduceMotion = false) { act(() => { root.render(<svg><BoardSign reduceMotion={reduceMotion} /></svg>); }); await flush(); }

  it('is a phone labelled Colaberry Now, with the TV badge, a ring and the current short\'s thumbnail; never a video', async () => {
    await draw();
    expect(q('[data-testid="cm-cboard-sign"]')!.textContent).toContain('Colaberry Now');
    expect(q('[data-testid="cm-cboard-sign"]')!.textContent).toContain('● TV');
    expect(q('[data-testid="cm-cnow-ring"]')).toBeTruthy();
    expect(q('[data-testid="cm-cnow-thumb"]')!.getAttribute('href')).toContain('/vi/yt_short_01/');
    expect(container.querySelector('iframe, video, audio')).toBeNull();
  });

  it.each([[0, 0, null], [5, 2, '7'], [10, 2, '9+']])('badge for %i new posts + %i new replies: %s', async (n, r, label) => {
    mockGetBoard.mockResolvedValue(counts(n, r));
    await draw();
    const b = q('[data-testid="cm-cboard-badge"]');
    expect(b ? b.textContent : null).toBe(label);
  });

  it('the thumbnail changes every 6 s, and stays still under reduced motion', async () => {
    jest.useFakeTimers();
    await draw();
    act(() => { jest.advanceTimersByTime(PHONE_ROTATE_MS); });
    expect(q('[data-testid="cm-cnow-thumb"]')!.getAttribute('data-yt')).toBe('yt_short_02');
    act(() => { root.render(<svg><BoardSign reduceMotion /></svg>); });
    act(() => { jest.advanceTimersByTime(PHONE_ROTATE_MS * 3); });
    expect(q('[data-testid="cm-cnow-thumb"]')!.getAttribute('data-yt')).toBe('yt_short_02');
  });

  it('no shorts: the placeholder screen, no broken image', async () => {
    mockGetTv.mockRejectedValue(new Error('down'));
    await draw();
    expect(q('[data-testid="cm-cnow-thumb"]')).toBeNull();
    expect(q('.ph-thumb-ph')).toBeTruthy();
  });

  it('Enter opens Colaberry Now with the walk', async () => {
    await draw();
    const opened: unknown[] = [];
    const on = (e: Event) => opened.push((e as CustomEvent).detail);
    window.addEventListener(BOARD_EVENT, on);
    act(() => { q('[data-testid="cm-cboard-sign"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    window.removeEventListener(BOARD_EVENT, on);
    expect(opened).toEqual([{ walk: true }]);
  });
});

describe('the rename', () => {
  it('Where to? finds Colaberry Now with community, board, post, question, tv and now', () => {
    const ctx = { audience: 'member' as const, workplace: false, buildings: [...CAMPUS_BUILDINGS], accessOf: () => 'open' as const, presence: null, desks: [], urgent: null, suggested: [] };
    for (const w of ['community', 'board', 'post', 'question', 'tv', 'now']) {
      expect(means(w)).toBe(true);
      expect(searchCampus(w, [...CAMPUS_BUILDINGS], null, false).some((r) => r.kind === 'board' && r.label === 'Colaberry Now')).toBe(true);
      expect(wayfinderSearch(w, ctx).some((i) => i.kind === 'board' && i.title === 'Colaberry Now')).toBe(true);
    }
    expect(means('library')).toBe(false);
    expect(means('t')).toBe(false);
  });

  it('the side panel chip is "📱 Colaberry Now" for members and explorers', () => {
    for (const set of [CHIPS.member, CHIPS.explorer]) expect(set.map(([t]) => t)).toContain('📱 Colaberry Now');
  });

  it('no campus source says "Ask the community" any more', () => {
    const roots = [path.join(__dirname, '..'), path.join(__dirname, '../../../pages/portal/campus')];
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== '__tests__') walk(p); } else if (/\.(tsx?|css)$/.test(e.name) && fs.readFileSync(p, 'utf8').includes('Ask the community')) hits.push(p);
      }
    };
    roots.forEach(walk);
    expect(hits).toEqual([]);
  });
});

describe('the left panel note', () => {
  const NOW = Date.parse('2026-11-11T18:00:00Z');
  it('newShorts: everything before the first look, then only what was added after it', () => {
    const list = [short(1, '2026-11-10T10:00:00.000Z'), short(2, '2026-11-11T10:00:00.000Z')];
    expect(newShorts(list, null).map((s) => s.id)).toEqual(['id-2', 'id-1']);
    expect(newShorts(list, '2026-11-10T12:00:00.000Z').map((s) => s.id)).toEqual(['id-2']);
    expect(newShorts(list, '2026-11-11T12:00:00.000Z')).toEqual([]);
  });

  it('shows with new shorts; dismissed, it is gone for the rest of the Central day and back tomorrow', () => {
    const list = [short(1, '2026-11-11T10:00:00.000Z')];
    expect(tvNoteFor(list, NOW).show).toBe(true);
    dismissTvNote(NOW);
    expect(tvNoteFor(list, NOW + 3_600_000).show).toBe(false);
    expect(tvNoteFor(list, NOW + 86_400_000).show).toBe(true);
    expect(centralDay(Date.parse('2026-11-12T05:30:00Z'))).toBe('2026-11-11'); // 11:30 PM CST is still the 11th
  });

  it('after opening Colaberry Now there is nothing new, so no note', () => {
    markTvSeen(NOW);
    expect(tvNoteFor([short(1, '2026-11-11T10:00:00.000Z')], NOW).show).toBe(false);
  });

  it('renders "n new · on Colaberry Now"; pressing it opens Colaberry Now; ✕ hides it', async () => {
    act(() => { root.render(<TvNote />); });
    await flush();
    expect(q('[data-testid="cm-tvnote"]')!.textContent).toContain('3 new · on Colaberry Now');
    expect(container.querySelector('iframe, video')).toBeNull();
    const opened: unknown[] = [];
    const on = (e: Event) => opened.push((e as CustomEvent).detail);
    window.addEventListener(BOARD_EVENT, on);
    act(() => { (q('.cm-tvnote-go') as HTMLElement).click(); });
    window.removeEventListener(BOARD_EVENT, on);
    expect(opened).toEqual([{ walk: true }]);
    expect(q('[data-testid="cm-tvnote"]')).toBeNull();
  });

  it('✕ hides it for today', async () => {
    act(() => { root.render(<TvNote />); });
    await flush();
    act(() => { (q('[data-testid="cm-tvnote-x"]') as HTMLElement).click(); });
    expect(q('[data-testid="cm-tvnote"]')).toBeNull();
    expect(tvNoteFor([short(9, '2099-01-01T00:00:00.000Z')]).show).toBe(false);
  });
});

describe('nothing else on campus plays Colaberry TV (spec N3)', () => {
  const SRC = path.join(__dirname, '../../..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p); } else if (/\.tsx?$/.test(e.name)) files.push(p);
    }
  };
  walk(SRC);
  const rel = (p: string) => path.relative(SRC, p).split(path.sep).join('/');
  const using = (re: RegExp) => files.filter((f) => re.test(fs.readFileSync(f, 'utf8'))).map(rel).sort();

  it('only ColaberryTv mounts the TV player, and only Colaberry Now mounts ColaberryTv', () => {
    expect(using(/from '\.\/useTvChannel'|from '\.\.\/now\/useTvChannel'|now\/useTvChannel'/)).toEqual(['components/campus/now/ColaberryTv.tsx']);
    expect(using(/import ColaberryTv\b/)).toEqual(['components/campus/now/ColaberryNow.tsx']);
  });

  it('no campus surface (rooms, lessons, quizzes, the workstation, HQ floors) builds a video embed except the TV player', () => {
    const campus = files.filter((f) => /components\/campus\/|pages\/portal\/campus\//.test(rel(f)));
    // code only: a comment may NAME the portal's one broadcast <video> (interior/useStageDock.ts docks it) without building one
    const code = (f: string) => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    const embeds = campus.filter((f) => /<iframe|<video|parseVideoUrl\(|withAutoplay\(|youtube-nocookie/.test(code(f))).map(rel).sort();
    expect(embeds).toEqual(['components/campus/now/ColaberryTv.tsx', 'components/campus/now/useTvChannel.ts']);
  });
});
