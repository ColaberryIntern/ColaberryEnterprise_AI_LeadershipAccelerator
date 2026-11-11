/**
 * Campus v20 N2 (C132 / C133): Colaberry Now opened. The TV on the left, the stream on the right: header with the real new-since
 * count, the composer (Post / Question / this week's ritual, the server's own words on a failure), the v14 section chips (Questions
 * "n open", red new dots), the Happening-now strip (real data only; each chip acts), one newest-first list with pinned first, endless
 * paging near the bottom, the new-posts pill that never moves the list, the thread drawer, and Esc closing the drawer first.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import type { BoardPost } from '../board/boardData';
import type { Happening, StreamResponse } from '../now/nowApi';

const mockStream = jest.fn();
const mockSince = jest.fn();
const mockHappening = jest.fn();
const mockSeen = jest.fn();
const mockCreatePost = jest.fn();
const mockGetTv = jest.fn();
const mockOpenMap = jest.fn();
jest.mock('../now/nowApi', () => ({
  getStream: (...a: unknown[]) => mockStream(...a), getSince: (...a: unknown[]) => mockSince(...a), getHappening: () => mockHappening(),
}));
jest.mock('../board/boardData', () => ({ ...jest.requireActual('../board/boardData'), markBoardSeen: (...a: unknown[]) => mockSeen(...a) }));
jest.mock('../../../services/communityApi', () => ({
  createPost: (...a: unknown[]) => mockCreatePost(...a), fetchComments: () => Promise.resolve([]), createComment: jest.fn(), togglePostLike: jest.fn(),
}));
jest.mock('../../../services/colaberryTvApi', () => ({ ...jest.requireActual('../../../services/colaberryTvApi'), getTv: () => mockGetTv() }));
jest.mock('../CampusContext', () => ({
  ...jest.requireActual('../CampusContext'),
  useCampus: () => ({ openMap: mockOpenMap, settings: { workplaceNames: false } }),
}));
// eslint-disable-next-line import/first
import { ColaberryNow, TV_POLL_MS } from '../now/ColaberryNow';
// eslint-disable-next-line import/first
import CommunityBoardHost from '../board/CommunityBoard';
// eslint-disable-next-line import/first
import { openBoard } from '../board/boardApi';
// eslint-disable-next-line import/first
import { appendPage, happeningChips, insertNew, newestOthers, sectionOf } from '../now/nowModel';
// eslint-disable-next-line import/first
import { SINCE_POLL_MS } from '../now/NowStream';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const NOW = Date.now();
const iso = (minsAgo: number) => new Date(NOW - minsAgo * 60_000).toISOString();
const post = (id: string, minsAgo: number, o: Partial<BoardPost> = {}): BoardPost => ({
  id, body: 'b', category: 'General', pinned: false, like_count: 2, comment_count: 1, viewer_has_liked: false, locked: false, min_level: 1,
  created_at: iso(minsAgo), member: { id: 'm2', display_name: 'Sam Roe', avatar_url: null, level: 3 }, ritual: null, ritual_values: null,
  lane: 'general', mine: false, new_replies: 0, title: `Post ${id}`, excerpt: 'more', ...o,
});
const zero = { all: 0, mine: 0, ann: 0, q: 0, intro: 0, wins: 0, tips: 0, ideas: 0, general: 0 };
const RITUAL = { week: 2, posted: 4, category: 'General', ritual: { key: 'skill_drop', week: 2, name: 'Skill Drop', icon: '🧩', accent: '', ask: 'Share 3 skills', lead: '', postCta: '', fields: [{ key: 'skills', label: 'My 3 skills', required: true, kind: 'list' as const }], headlineField: 'skills', variant: 'standard', reaction: { emoji: '👏', label: 'Cheer' }, mechanic: { icon: '', caption: '' }, beforeAfter: null } };
const STREAM = (o: Partial<StreamResponse> = {}): StreamResponse => ({
  counts: { ...zero, all: 29, q: 3, mine: 2, wins: 8 }, open_questions: 2,
  new_since: { at: iso(120), count: 7, by_lane: { ...zero, all: 7, q: 1 } }, my_new_replies: 0, week_ritual: RITUAL as never,
  pinned: [post('pin', 1200, { pinned: true, lane: 'ann', title: 'Open House Thursday' })],
  posts: [post('a', 30), post('q1', 60, { lane: 'q', category: 'Support', comment_count: 0, title: 'How do I connect Claude Code?' }), post('w', 180, { lane: 'wins', title: 'What I built' })],
  next_cursor: 'c1', ...o,
});
const HAPPENING: Happening = {
  on_campus: { count: 13, busiest: 'commons', busiest_count: 5 },
  next_event: { id: 'e1', title: 'AI Internship Presentation Event', starts_at: new Date(NOW + 86_400_000).toISOString(), timezone: 'America/Chicago' },
  open_questions: 3, latest_win: { id: 'w', title: 'What I built', author: 'Lena Park' }, shorts: 2,
};
const TV = { videos: [{ id: 'v1', youtube_id: 'Pa5J5T6MZok', title: 'Short one', duration_s: null, created_at: iso(5) }, { id: 'v2', youtube_id: 'o0Pd4j4Temc', title: 'Short two', duration_s: null, created_at: iso(5) }], can_manage: false };

let container: HTMLDivElement;
let root: Root;
const onClose = jest.fn();
const q = (s: string) => container.querySelector(s) as HTMLElement | null;
const all = (s: string) => Array.from(container.querySelectorAll(s)) as HTMLElement[];
const ids = () => all('[data-testid="cn-post"]').map((e) => e.getAttribute('data-id'));
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };
async function open(compose: 'q' | 'post' | null = null): Promise<void> {
  act(() => { root.render(<MemoryRouter><ColaberryNow me="Ali Muwwakkil" compose={compose} onClose={onClose} /></MemoryRouter>); });
  await flush();
}
const press = (el: Element | null) => act(() => { (el as HTMLElement).click(); });
const key = (k: string) => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k })); });

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  for (const m of [mockStream, mockSince, mockHappening, mockSeen, mockCreatePost, mockGetTv, mockOpenMap, onClose]) m.mockReset();
  mockStream.mockResolvedValue(STREAM());
  mockSince.mockResolvedValue({ posts: [], count: 0 });
  mockHappening.mockResolvedValue(HAPPENING);
  mockSeen.mockResolvedValue(null);
  mockGetTv.mockResolvedValue(TV);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.useRealTimers(); });

describe('the pure parts', () => {
  it('pages append without repeats; held posts go on top newest first; the pill counts from the newest post by someone else', () => {
    expect(appendPage([post('a', 1), post('b', 2)], [post('b', 2), post('c', 3)]).map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(insertNew([post('a', 10)], [post('y', 2), post('x', 1)]).map((p) => p.id)).toEqual(['x', 'y', 'a']);
    expect(newestOthers([[post('mine', 1, { mine: true }), post('b', 5)], [post('c', 3)]])).toBe('c');
    expect(newestOthers([[post('mine', 1, { mine: true })]])).toBeNull();
  });
  it('a Happening chip with nothing to say is left out', () => {
    expect(happeningChips({ on_campus: null, next_event: null, open_questions: 0, latest_win: null, shorts: 0 }, () => null, () => '')).toEqual([]);
    expect(happeningChips(null, () => null, () => '')).toEqual([]);
    expect(happeningChips(HAPPENING, () => 'Meeting Rooms', () => 'TUE 10:00 AM').map((c) => c.kind)).toEqual(['campus', 'event', 'questions', 'win', 'shorts']);
  });
  it('the section chip on a post: announcement, ritual, or lane', () => {
    expect(sectionOf(post('p', 1, { pinned: true }))).toEqual({ icon: '📣', label: 'Announcement' });
    expect(sectionOf(post('p', 1, { lane: 'q' })).label).toBe('Question');
    expect(sectionOf(post('p', 1, { ritual: { key: 'roll_call', name: 'Roll Call', icon: '👋', week: 1, reaction: { emoji: '👋', label: 'Hi' } } })).label).toBe('Roll Call');
  });
});

describe('Colaberry Now', () => {
  it('opens the TV and the stream side by side: pinned first, then newest first; the header says what is new', async () => {
    await open();
    expect(q('[data-testid="cn-tv"]')).toBeTruthy();
    expect(q('[data-testid="cn-tv-count"]')!.textContent).toBe('1 OF 2 · LOOPS');
    expect(ids()).toEqual(['pin', 'a', 'q1', 'w']);
    expect(q('[data-testid="cn-sub"]')!.textContent).toContain('7 new since you looked');
    expect(all('[data-testid="cn-post"]')[2].textContent).toContain('answer it');
    expect(mockSeen).toHaveBeenCalled();
  });

  it('the section chips: counts, Questions "n open", red dots where there is something new', async () => {
    await open();
    // as the prototype reads: "Questions 2 open" (the open count, not the total and then the open count)
    expect(q('[data-testid="cn-lane-q"] small')!.textContent).toBe('2 open');
    expect(q('[data-testid="cn-lane-mine"] small')!.textContent).toBe('2');
    expect(q('[data-testid="cn-lane-wins"] small')!.textContent).toBe('8');
    expect(q('[data-testid="cn-dot-q"]')).toBeTruthy();
    expect(q('[data-testid="cn-dot-wins"]')).toBeNull();
    press(q('[data-testid="cn-lane-q"]'));
    await flush();
    expect(mockStream).toHaveBeenLastCalledWith({ lane: 'q', q: '' });
  });

  it('each Happening chip acts: walk to the busiest room, open Events, the Questions filter, the latest win thread, restart the TV', async () => {
    await open();
    press(q('[data-testid="cn-chip-questions"]'));
    await flush();
    expect(mockStream).toHaveBeenLastCalledWith({ lane: 'q', q: '' });
    press(q('[data-testid="cn-chip-win"]'));
    await flush();
    expect(q('[data-testid="cb-drawer"]')).toBeTruthy();
    press(q('[data-testid="cn-tv-next"]'));
    press(q('[data-testid="cn-chip-shorts"]'));
    await flush();
    expect(q('[data-testid="cn-tv-title"]')!.textContent).toBe('Short one');
    press(q('[data-testid="cn-chip-campus"]'));
    expect(mockOpenMap).toHaveBeenLastCalledWith('commons');
    expect(onClose).toHaveBeenCalled();
    press(q('[data-testid="cn-chip-event"]'));
    expect(mockOpenMap).toHaveBeenLastCalledWith('amphi');
  });

  it('a chip without data is not shown', async () => {
    mockHappening.mockResolvedValue({ ...HAPPENING, on_campus: null, next_event: null });
    await open();
    expect(q('[data-testid="cn-chip-campus"]')).toBeNull();
    expect(q('[data-testid="cn-chip-event"]')).toBeNull();
    expect(q('[data-testid="cn-chip-questions"]')).toBeTruthy();
  });

  it('new posts while open never move the list: the pill holds them until it is tapped', async () => {
    jest.useFakeTimers();
    await open();
    mockSince.mockResolvedValue({ posts: [post('n2', 1), post('n1', 2)], count: 2 });
    await act(async () => { jest.advanceTimersByTime(SINCE_POLL_MS); });
    await flush();
    expect(mockSince).toHaveBeenCalledWith('a');
    expect(q('[data-testid="cn-pill"]')!.textContent).toBe('↑ 2 new posts');
    expect(ids()).toEqual(['pin', 'a', 'q1', 'w']);
    press(q('[data-testid="cn-pill"]'));
    expect(ids()).toEqual(['pin', 'n2', 'n1', 'a', 'q1', 'w']);
    expect(q('[data-testid="cn-pill"]')).toBeNull();
  });

  it('scrolling near the bottom loads the next 20 by cursor, without repeats', async () => {
    await open();
    mockStream.mockResolvedValueOnce(STREAM({ posts: [post('w', 180), post('old', 9000)], next_cursor: null }));
    const list = q('[data-testid="cn-list"]')!;
    Object.defineProperty(list, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(list, 'clientHeight', { value: 600, configurable: true });
    Object.defineProperty(list, 'scrollTop', { value: 1300, configurable: true });
    act(() => { list.dispatchEvent(new Event('scroll', { bubbles: true })); });
    await flush();
    expect(mockStream).toHaveBeenLastCalledWith({ lane: 'all', q: '', cursor: 'c1' });
    expect(ids()).toEqual(['pin', 'a', 'q1', 'w', 'old']);
    expect(q('[data-testid="cn-more"]')!.textContent).toBe('You’re all caught up.');
  });

  it('posting a question: it goes first with a glow, and the toast names the section', async () => {
    await open('q');
    const input = q('[data-testid="cn-compose-input"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => { setter.call(input, 'How do I add a second MCP server to Claude Code when the first one is already configured in my settings file?'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    mockCreatePost.mockResolvedValue({});
    mockStream.mockResolvedValue(STREAM({ posts: [post('mine1', 0, { mine: true, lane: 'q' }), post('a', 30)] }));
    press(q('[data-testid="cn-compose-post"]'));
    await flush();
    expect(mockCreatePost).toHaveBeenCalledWith(expect.objectContaining({ category: 'Support' }));
    expect(ids()[1]).toBe('mine1');
    expect(all('[data-testid="cn-post"]')[1].className).toContain('glow');
    expect(q('[data-testid="cn-toast"]')!.textContent).toContain('Questions');
  });

  it('a short post shows the server’s own words', async () => {
    await open();
    const input = q('[data-testid="cn-compose-input"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => { setter.call(input, 'too short'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    mockCreatePost.mockRejectedValue({ response: { data: { error: 'Invalid post', details: { fieldErrors: { body: ['Posts need at least 15 words — give the cohort something they can use.'] } } } } });
    press(q('[data-testid="cn-compose-post"]'));
    await flush();
    expect(q('[data-testid="cn-compose-error"]')!.textContent).toBe('Posts need at least 15 words — give the cohort something they can use.');
  });

  it('the kind select offers this week’s ritual, which opens its guided composer', async () => {
    await open();
    const sel = q('[data-testid="cn-compose-kind"]') as HTMLSelectElement;
    expect(Array.from(sel.options).map((o) => o.textContent)).toEqual(['💬 Post', '❓ Question', '🧩 Skill Drop']);
    act(() => { sel.value = 'ritual'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(q('[data-testid="cb-compose"]')).toBeTruthy();
  });

  it('Esc closes the thread drawer first, then Colaberry Now', async () => {
    await open();
    press(all('[data-testid="cn-post"]')[1]);
    await flush();
    expect(q('[data-testid="cb-drawer"]')).toBeTruthy();
    key('Escape');
    expect(q('[data-testid="cb-drawer"]')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    key('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('search narrows the stream (debounced)', async () => {
    jest.useFakeTimers();
    await open();
    const s = q('[data-testid="cn-search"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => { setter.call(s, 'mcp'); s.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { jest.advanceTimersByTime(300); });
    await flush();
    expect(mockStream).toHaveBeenLastCalledWith({ lane: 'all', q: 'mcp' });
  });

  it('the TV re-reads its playlist every 30 s; a failed re-read keeps what is playing and is logged', async () => {
    jest.useFakeTimers();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await open();
    expect(mockGetTv).toHaveBeenCalledTimes(1);
    mockGetTv.mockRejectedValueOnce(Object.assign(new Error('down'), { name: 'NetworkError' }));
    await act(async () => { jest.advanceTimersByTime(TV_POLL_MS); });
    await flush();
    expect(mockGetTv).toHaveBeenCalledTimes(2);
    expect(q('[data-testid="cn-tv-title"]')!.textContent).toBe('Short one');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('colaberry_tv_refresh_failed'));
    warn.mockRestore();
  });

  it('opening Colaberry Now marks the TV as looked at (the left panel note stops saying "new")', async () => {
    window.localStorage.removeItem('cm-tv-seen');
    await open();
    expect(window.localStorage.getItem('cm-tv-seen')).toBeTruthy();
  });

  it('through the real host: any opener shows Colaberry Now, and closing it stops the TV (about:blank)', async () => {
    act(() => { root.render(<MemoryRouter><CommunityBoardHost reduceMotion me="Ali Muwwakkil" /></MemoryRouter>); });
    expect(q('[data-testid="cm-cnow"]')).toBeNull();
    act(() => { openBoard({ walk: true }); });
    await flush();
    expect(q('[data-testid="cm-cnow"]')).toBeTruthy();
    const f = q('[data-testid="cn-tv-frame"]') as HTMLIFrameElement;
    expect(f.getAttribute('src')).toContain('youtube-nocookie.com/embed/Pa5J5T6MZok');
    key('Escape');
    expect(q('[data-testid="cm-cnow"]')).toBeNull();
    expect(f.getAttribute('src')).toBe('about:blank');
  });

  it('a stream that fails to load says so, and the TV still plays', async () => {
    mockStream.mockRejectedValue(new Error('down'));
    await open();
    expect(container.textContent).toContain('We can’t load the stream right now.');
    expect(q('[data-testid="cn-tv-frame"]')).toBeTruthy();
  });
});
