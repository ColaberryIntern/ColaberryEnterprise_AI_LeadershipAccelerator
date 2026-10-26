/**
 * Campus v14 (C67-C71): the board in sections. Header (new since, total, search, Add a note, the Community page), the ritual bar, the
 * Sections column (counts, Questions "n open", Your notes "n new"), Everything (pinned, Needs an answer, Fresh with ages and NEW), the
 * thread drawer (Esc closes it before the board), the server seen mark, posting, and the legacy localStorage mark migrated once.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { BoardPost, BoardResponse } from '../board/boardData';

const mockGetBoard = jest.fn();
const mockSeen = jest.fn();
const mockCreatePost = jest.fn();
jest.mock('../board/boardData', () => {
  const actual = jest.requireActual('../board/boardData');
  return { ...actual, getBoard: (...a: unknown[]) => mockGetBoard(...a), markBoardSeen: (...a: unknown[]) => mockSeen(...a) };
});
jest.mock('../../../services/communityApi', () => ({
  createPost: (...a: unknown[]) => mockCreatePost(...a),
  fetchComments: () => Promise.resolve([{ id: 'c1', body: 'Try a backoff cap', created_at: new Date().toISOString(), member: { id: 'm2', display_name: 'Sam Roe', avatar_url: null, level: 3 }, parent_comment_id: null, like_count: 0, viewer_has_liked: false, replies: [] }]),
  createComment: jest.fn(),
  togglePostLike: jest.fn(),
}));
// eslint-disable-next-line import/first
import { CommunityBoard } from '../board/CommunityBoard';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
const post = (o: Partial<BoardPost>): BoardPost => ({
  id: 'p', body: 'b', category: 'General', pinned: false, like_count: 2, comment_count: 0, viewer_has_liked: false, locked: false, min_level: 1,
  created_at: iso(3_600_000), member: { id: 'm2', display_name: 'Sam Roe', avatar_url: null, level: 3 }, ritual: null, ritual_values: null,
  lane: 'general', mine: false, new_replies: 0, title: 'A note', excerpt: 'more', ...o,
});
const zero = { all: 0, mine: 0, ann: 0, q: 0, intro: 0, wins: 0, tips: 0, ideas: 0, general: 0 };
const BOARD: BoardResponse = {
  counts: { ...zero, all: 14, mine: 1, q: 3, intro: 2, general: 8, ann: 1 },
  open_questions: 2,
  new_since: { at: iso(2 * 3_600_000), count: 3, by_lane: { ...zero, all: 3, intro: 2, general: 1 } },
  my_new_replies: 1,
  pinned: [post({ id: 'pin', pinned: true, lane: 'ann', title: 'Welcome to Week 2' })],
  unanswered: [post({ id: 'q1', lane: 'q', category: 'Support', title: 'How do I fix this MCP timeout?' })],
  fresh: [post({ id: 'f1', title: 'Fresh one', created_at: iso(600_000), ritual: { key: 'roll_call', name: 'Roll Call', icon: '👋', week: 1, reaction: { emoji: '👋', label: 'Welcome' } }, lane: 'intro' })],
  this_week: [post({ id: 'w1', title: 'Earlier', created_at: iso(3 * 86_400_000) })],
  last_week: [],
  older: { posts: [], next_cursor: null },
  week_ritual: { week: 2, posted: 4, category: 'General', ritual: { key: 'skill_drop', week: 2, name: 'Skill Drop', icon: '🧩', accent: '', ask: 'Share 3 skills', lead: '', postCta: '', fields: [{ key: 'skills', label: 'My 3 skills', required: true, kind: 'list' }], headlineField: 'skills', variant: 'standard', reaction: { emoji: '👏', label: 'Cheer' }, mechanic: { icon: '', caption: '' }, beforeAfter: null } },
};

let container: HTMLDivElement;
let root: Root;
let path = '';
const onClose = jest.fn();
function Where(): null { path = useLocation().pathname; return null; }
beforeEach(() => {
  jest.useRealTimers();
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  mockGetBoard.mockReset(); mockSeen.mockReset(); mockCreatePost.mockReset(); onClose.mockReset();
  mockGetBoard.mockResolvedValue(BOARD); mockSeen.mockResolvedValue('x');
  window.localStorage.clear();
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); };
const mount = async () => {
  act(() => { root.render(<MemoryRouter initialEntries={['/portal/campus']}><Where /><Routes><Route path="*" element={<CommunityBoard onClose={onClose} />} /></Routes></MemoryRouter>); });
  await flush();
};

it('the header says what is new since you looked and how many notes there are; the ritual bar shows this week', async () => {
  await mount();
  expect(q('cb-status')!.textContent).toMatch(/^3 new since you looked on .+ · 14 notes from everyone on campus$/);
  expect(q('cb-ritual')!.textContent).toContain('This week · Week 2 · Skill Drop');
  expect(q('cb-ritual')!.textContent).toContain('4 posted this week');
});

it('sections: counts, Questions "2 open", Your notes "1 new", a red dot on lanes with new notes', async () => {
  await mount();
  expect(q('cb-lane-q')!.textContent).toContain('2 open');
  expect(q('cb-lane-mine')!.textContent).toContain('1 new');
  expect(q('cb-lane-general')!.textContent).toContain('8');
  expect(q('cb-lane-intro')!.querySelector('.nw')).not.toBeNull();
  expect(q('cb-lane-tips')!.querySelector('.nw')).toBeNull();
});

it('Everything: pinned, Needs an answer, Fresh with an age and NEW, then Earlier this week', async () => {
  await mount();
  expect(q('cb-pinned-pin')!.textContent).toContain('Welcome to Week 2');
  expect(q('cb-unanswered')!.textContent).toContain('How do I fix this MCP timeout?');
  const note = q('cb-note-f1')!;
  expect(note.textContent).toContain('10m ago');
  expect(note.textContent).toContain('NEW');
  expect(note.querySelector('time')!.getAttribute('dateTime')).toBe(BOARD.fresh[0].created_at);
  expect(q('cb-this-week')!.textContent).toContain('Earlier');
});

it('marks the board seen on the server after it loads (and migrates nothing when the server already has a mark)', async () => {
  window.localStorage.setItem('cm-board-seen', String(now - 86_400_000));
  await mount();
  await flush();
  expect(mockSeen).toHaveBeenCalledWith();
  expect(mockSeen).not.toHaveBeenCalledWith(expect.objectContaining({ migrate: true }));
  expect(window.localStorage.getItem('cm-board-seen')).toBeNull();
});

it('with no server mark yet, the old browser mark is migrated once, then the board is marked seen', async () => {
  mockGetBoard.mockResolvedValue({ ...BOARD, new_since: { ...BOARD.new_since, at: null, count: 0 } });
  const legacy = now - 86_400_000;
  window.localStorage.setItem('cm-board-seen', String(legacy));
  await mount();
  await flush();
  expect(mockSeen).toHaveBeenNthCalledWith(1, { at: new Date(legacy).toISOString(), migrate: true });
  expect(mockSeen).toHaveBeenNthCalledWith(2);
});

it('a note opens the thread drawer with its replies; Esc closes the drawer first, then the board', async () => {
  await mount();
  act(() => { q('cb-note-f1')!.click(); });
  await flush();
  expect(q('cb-drawer')).not.toBeNull();
  expect(q('cb-react')!.textContent).toContain('👋 Welcome · 2');
  expect(container.querySelectorAll('[data-testid="cb-reply"]')).toHaveLength(1);
  act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
  expect(q('cb-drawer')).toBeNull();
  expect(onClose).not.toHaveBeenCalled();
  act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
  expect(onClose).toHaveBeenCalled();
});

it('search is debounced and asks the server', async () => {
  jest.useFakeTimers();
  await mount();
  act(() => {
    const input = q('cb-search') as HTMLInputElement;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    set.call(input, 'mcp');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(mockGetBoard).not.toHaveBeenCalledWith(expect.objectContaining({ q: 'mcp' }));
  act(() => { jest.advanceTimersByTime(260); });
  await act(async () => { await Promise.resolve(); });
  expect(mockGetBoard).toHaveBeenCalledWith(expect.objectContaining({ q: 'mcp' }));
  jest.useRealTimers();
});

it('a section shows its description; Your notes is empty with the plain line', async () => {
  await mount();
  mockGetBoard.mockResolvedValue({ ...BOARD, pinned: [], unanswered: [], fresh: [], this_week: [], last_week: [] });
  act(() => { q('cb-lane-mine')!.click(); });
  await flush();
  expect(q('cb-empty')!.textContent).toContain('You haven’t posted yet');
  act(() => { q('cb-lane-tips')!.click(); });
  await flush();
  expect(q('cb-lanedesc')!.textContent).toContain('Skill Drop, Steal This Prompt');
  expect(q('cb-empty')!.textContent).toBe('Nothing here yet.');
});

it('the Community page is one click away (C71)', async () => {
  await mount();
  act(() => { q('cm-cb-feed')!.click(); });
  expect(path).toBe('/portal/community');
  expect(onClose).toHaveBeenCalled();
});

it('posting a question: the composer says where it goes, then the board shows the toast', async () => {
  mockCreatePost.mockResolvedValue({});
  await mount();
  act(() => { q('cb-add')!.click(); });
  expect(q('cb-compose-where')!.textContent).toContain('into Questions');
  act(() => {
    const ta = q('cb-compose-body') as HTMLTextAreaElement;
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    set.call(ta, 'How do I keep my MCP server from timing out when the CRM rate limits every request I send to it?');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { q('cb-compose-post')!.click(); await Promise.resolve(); });
  await flush();
  expect(mockCreatePost).toHaveBeenCalledWith(expect.objectContaining({ category: 'Support' }));
  expect(q('cb-toast')!.textContent).toContain('filed in Questions');
});
