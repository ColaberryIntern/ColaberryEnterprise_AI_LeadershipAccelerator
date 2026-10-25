/**
 * C30 (v7 R3): the Community Board on the Quad. The board shows the four tabs and real notes from the community feed (questions =
 * Support posts with their answer counts, announcements = pinned posts, posts = the rest); "Ask a question" pins a Support post
 * through the existing endpoint and the new note is first after the reload; the badge counts posts since your last look; the sign on
 * the map is focusable and Enter opens the board (walking you there); Where to? finds it.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import type { CommunityPost } from '../../../services/communityApi';

const mockApi = { fetchPosts: jest.fn(), createPost: jest.fn() };
jest.mock('../../../services/communityApi', () => ({
  fetchPosts: (...a: unknown[]) => mockApi.fetchPosts(...a),
  createPost: (...a: unknown[]) => mockApi.createPost(...a),
}));

// eslint-disable-next-line import/first
import { CommunityBoard } from '../board/CommunityBoard';
// eslint-disable-next-line import/first
import BoardSign from '../board/BoardSign';
// eslint-disable-next-line import/first
import { BOARD_EVENT } from '../board/boardApi';
// eslint-disable-next-line import/first
import { newSince, noteCount, noteKind, onTab, means } from '../board/boardModel';
// eslint-disable-next-line import/first
import { searchCampus } from '../campusSearch';
// eslint-disable-next-line import/first
import { wayfinderSearch } from '../wayfinderIndex';
// eslint-disable-next-line import/first
import { CAMPUS_BUILDINGS } from '../campusMap';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const post = (id: string, o: Partial<CommunityPost> = {}): CommunityPost => ({
  id, body: `Body ${id}`, media_urls: [], category: 'General', pinned: false, like_count: 2, comment_count: 0, viewer_has_liked: false,
  mentioned_member_ids: [], min_level: 0, locked: false, created_at: '2026-10-25T10:00:00Z', member: { id: 'm', display_name: 'Grace Hopper', avatar_url: null, level: 1 },
  recent_commenters: [], ...o,
});
const Q = post('q1', { category: 'Support', comment_count: 0 });
const A = post('a1', { pinned: true });
const P = post('p1');

describe('the rules', () => {
  it('questions are Support posts, announcements pinned, posts the rest; the tabs filter', () => {
    expect([noteKind(Q), noteKind(A), noteKind(P)]).toEqual(['q', 'ann', 'post']);
    expect(onTab([Q, A, P], 'q')).toEqual([Q]);
    expect(onTab([Q, A, P], 'all')).toHaveLength(3);
  });
  it('counts: a question has answers ("No answers yet" at 0), a post likes; the badge counts posts since your last look', () => {
    expect(noteCount(Q)).toBe('No answers yet');
    expect(noteCount({ ...Q, comment_count: 3 })).toBe('3 answers');
    expect(noteCount(P)).toBe('2 likes');
    expect(newSince([P, post('n', { created_at: '2026-10-25T12:00:00Z' })], Date.parse('2026-10-25T11:00:00Z'))).toBe(1);
    expect(newSince([P], null)).toBe(0);
  });
  it('Where to? words find it, on pages and in the home Wayfinder; other words do not', () => {
    for (const w of ['community', 'post', 'question', 'ask', 'board', 'forum']) expect(means(w)).toBe(true);
    expect(means('library')).toBe(false);
    expect(searchCampus('forum', [...CAMPUS_BUILDINGS], null, false)[0]).toMatchObject({ kind: 'board', label: 'Community Board', detail: 'on the Quad · Walk →' });
    expect(searchCampus('library', [...CAMPUS_BUILDINGS], null, false).some((r) => r.kind === 'board')).toBe(false);
    const ctx = { audience: 'member' as const, workplace: false, buildings: [...CAMPUS_BUILDINGS], accessOf: () => 'open' as const, presence: null, desks: [], urgent: null, suggested: [] };
    expect(wayfinderSearch('question', ctx).some((i) => i.kind === 'board')).toBe(true);
    expect(wayfinderSearch('library', ctx).some((i) => i.kind === 'board')).toBe(false);
  });
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  Object.values(mockApi).forEach((f) => f.mockReset());
  window.localStorage.clear();
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
const q = (s: string) => container.querySelector(s);
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };

describe('the board', () => {
  it('four tabs and the real notes; Questions shows only the question', async () => {
    mockApi.fetchPosts.mockResolvedValue({ posts: [Q, A, P], next_cursor: null });
    act(() => { root.render(<MemoryRouter><CommunityBoard onClose={() => undefined} /></MemoryRouter>); });
    await flush();
    expect(Array.from(container.querySelectorAll('[role="tab"]')).map((t) => t.textContent)).toEqual(['Everything', 'Questions', 'Posts', 'Announcements']);
    expect(container.querySelectorAll('.cm-cb-note')).toHaveLength(3);
    expect(q('[data-testid="cm-cb-note-q1"]')!.className).toContain('is-q');
    expect(q('[data-testid="cm-cb-note-a1"]')!.className).toContain('is-ann');
    expect(q('[data-testid="cm-cb-note-q1"]')!.textContent).toContain('Grace');
    act(() => { (q('[data-testid="cm-cb-tab-q"]') as HTMLButtonElement).click(); });
    expect(Array.from(container.querySelectorAll('.cm-cb-note')).map((n) => n.getAttribute('data-testid'))).toEqual(['cm-cb-note-q1']);
  });

  it('Ask a question pins a Support post through the existing endpoint; after the reload the new note is first', async () => {
    mockApi.fetchPosts.mockResolvedValueOnce({ posts: [P], next_cursor: null });
    mockApi.createPost.mockResolvedValue(post('new', { category: 'Support' }));
    act(() => { root.render(<MemoryRouter><CommunityBoard onClose={() => undefined} /></MemoryRouter>); });
    await flush();
    act(() => { (q('[data-testid="cm-cb-ask"]') as HTMLButtonElement).click(); });
    const ta = q('[data-testid="cm-cb-compose"] textarea') as HTMLTextAreaElement;
    act(() => { const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!; set.call(ta, 'How do I connect my repo?'); ta.dispatchEvent(new Event('input', { bubbles: true })); });
    mockApi.fetchPosts.mockResolvedValueOnce({ posts: [post('new', { category: 'Support', body: 'How do I connect my repo?' }), P], next_cursor: null });
    await act(async () => { (q('[data-testid="cm-cb-pin"]') as HTMLButtonElement).click(); });
    await flush();
    expect(mockApi.createPost).toHaveBeenCalledWith({ body: 'How do I connect my repo?', category: 'Support' });
    expect(container.querySelector('.cm-cb-note')!.getAttribute('data-testid')).toBe('cm-cb-note-new');
  });

  it('a post the feed refuses says the feed\'s own reason (posts need at least 15 words), and the composer counts words', async () => {
    mockApi.fetchPosts.mockResolvedValue({ posts: [], next_cursor: null });
    mockApi.createPost.mockRejectedValue({ response: { status: 400, data: { error: 'Invalid post', details: { fieldErrors: { body: ['Posts need at least 15 words — give the cohort something they can use.'] } } } } });
    act(() => { root.render(<MemoryRouter><CommunityBoard compose="post" onClose={() => undefined} /></MemoryRouter>); });
    await flush();
    const ta = q('[data-testid="cm-cb-compose"] textarea') as HTMLTextAreaElement;
    act(() => { const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!; set.call(ta, 'too short'); ta.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(q('[data-testid="cm-cb-words"]')!.textContent).toBe('2 words · posts need at least 15');
    await act(async () => { (q('[data-testid="cm-cb-pin"]') as HTMLButtonElement).click(); });
    await flush();
    expect(q('[role="alert"]')!.textContent).toContain('Posts need at least 15 words');
  });

  it('a feed outage says so; opening the board marks it read', async () => {
    mockApi.fetchPosts.mockRejectedValue(new Error('down'));
    act(() => { root.render(<MemoryRouter><CommunityBoard onClose={() => undefined} /></MemoryRouter>); });
    await flush();
    expect(container.textContent).toContain('can’t load the board');
    expect(window.localStorage.getItem('cm-board-seen')).not.toBeNull();
  });
});

describe('the sign on the map', () => {
  it('is focusable, Enter opens the board with a walk, and the badge shows new posts', async () => {
    window.localStorage.setItem('cm-board-seen', String(Date.parse('2026-10-25T09:00:00Z')));
    mockApi.fetchPosts.mockResolvedValue({ posts: [P, post('p2')], next_cursor: null });
    const opened: unknown[] = [];
    const on = (e: Event) => opened.push((e as CustomEvent).detail);
    window.addEventListener(BOARD_EVENT, on);
    act(() => { root.render(<svg><BoardSign /></svg>); });
    await flush();
    const sign = q('[data-testid="cm-cboard-sign"]') as unknown as SVGGElement;
    expect(sign.getAttribute('tabindex')).toBe('0');
    expect(q('[data-testid="cm-cboard-badge"]')!.textContent).toBe('2');
    act(() => { sign.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(opened).toEqual([{ walk: true }]);
    expect(q('[data-testid="cm-cboard-badge"]')).toBeNull();
    window.removeEventListener(BOARD_EVENT, on);
  });
});
