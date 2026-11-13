import { cursorOf, type BoardRow } from '../boardModel';
import { latestWinId, sinceIds, streamIds } from '../boardStream';

/**
 * Campus v20 N2 (C133): the stream is one endless list, newest first, every post (no Fresh cap), 20 a page; pinned first on
 * Everything and never repeated; a lane filters; the pill counts other people's posts newer than the newest one on screen.
 */
const at = (m: number) => new Date(Date.parse('2026-11-11T12:00:00Z') - m * 60_000).toISOString();
const row = (id: string, minsAgo: number, o: Partial<BoardRow> = {}): BoardRow =>
  ({ id, member_id: 'other', category: 'General', pinned: false, ritual_key: null, created_at: at(minsAgo), comment_count: 0, ...o });

describe('streamIds', () => {
  const rows = Array.from({ length: 45 }, (_, i) => row(`p${String(i).padStart(2, '0')}`, i + 1));
  const pinned = row('pin', 600, { pinned: true });

  it('Everything: pinned first (page one only), then every post newest first, 20 a page, until the end', () => {
    const one = streamIds([...rows, pinned], { lane: 'all', viewerMemberId: 'me', cursor: null });
    expect(one.pinned).toEqual(['pin']);
    expect(one.posts).toHaveLength(20);
    expect(one.posts[0]).toBe('p00');
    expect(one.posts).not.toContain('pin');
    const two = streamIds([...rows, pinned], { lane: 'all', viewerMemberId: 'me', cursor: one.next_cursor });
    expect(two.pinned).toEqual([]);
    expect(two.posts[0]).toBe('p20');
    const three = streamIds([...rows, pinned], { lane: 'all', viewerMemberId: 'me', cursor: two.next_cursor });
    expect(three.posts).toHaveLength(5);
    expect(three.next_cursor).toBeNull();
    expect(new Set([...one.posts, ...two.posts, ...three.posts]).size).toBe(45);
  });

  it('a lane filters (Questions), and Your notes is the viewer\'s own; a pinned post shows in its own lane list', () => {
    const list = [row('q1', 1, { category: 'Support' }), row('g1', 2), row('m1', 3, { member_id: 'me' }), row('a1', 4, { pinned: true })];
    expect(streamIds(list, { lane: 'q', viewerMemberId: 'me', cursor: null }).posts).toEqual(['q1']);
    expect(streamIds(list, { lane: 'mine', viewerMemberId: 'me', cursor: null }).posts).toEqual(['m1']);
    expect(streamIds(list, { lane: 'ann', viewerMemberId: 'me', cursor: null })).toEqual({ pinned: [], posts: ['a1'], next_cursor: null });
  });

  it('empty is empty; a cursor whose post was deleted resumes after it, never from the top', () => {
    expect(streamIds([], { lane: 'all', viewerMemberId: 'me', cursor: null })).toEqual({ pinned: [], posts: [], next_cursor: null });
    const gone = cursorOf(row('deleted', 10.5));
    const r = streamIds(rows, { lane: 'all', viewerMemberId: 'me', cursor: gone });
    expect(r.posts[0]).toBe('p10');
  });
});

describe('sinceIds', () => {
  const list = [row('new2', 1), row('mine', 2, { member_id: 'me' }), row('new1', 3), row('top', 5), row('old', 9)];
  it('other people\'s posts newer than the one on top, newest first; mine are never counted', () => {
    expect(sinceIds(list, 'top', 'me')).toEqual(['new2', 'new1']);
  });
  it('nothing newer, an unknown id, and the cap', () => {
    expect(sinceIds(list, 'new2', 'me')).toEqual([]);
    expect(sinceIds(list, '11111111-2222-4333-8444-000000000009', 'me')).toEqual([]);
    expect(sinceIds(list, 'old', 'me', 2)).toEqual(['new2', 'new1']);
  });
});

it('latestWinId is the newest Wins & builds post, or null', () => {
  expect(latestWinId([row('w-old', 9, { ritual_key: 'cohort_wins' }), row('w-new', 2, { ritual_key: 'cohort_wins' }), row('g', 1)])).toBe('w-new');
  expect(latestWinId([row('g', 1)])).toBeNull();
});
