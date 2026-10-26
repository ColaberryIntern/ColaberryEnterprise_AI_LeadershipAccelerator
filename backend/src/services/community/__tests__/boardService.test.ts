const mockPosts = jest.fn();
const mockMembers = jest.fn();
const mockLikes = jest.fn();
const mockQuery = jest.fn();
const mockMarks = jest.fn();
jest.mock('../../../models', () => ({
  CommunityPost: { findAll: (...a: unknown[]) => mockPosts(...a) },
  CommunityMember: { findAll: (...a: unknown[]) => mockMembers(...a) },
  CommunityLike: { findAll: (...a: unknown[]) => mockLikes(...a) },
}));
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));
jest.mock('../../communityService', () => ({
  getOrCreateMember: () => Promise.resolve({ id: 'me', level: 2 }),
  resolveCohortId: () => Promise.resolve('cohort-A'),
}));
jest.mock('../boardSeen', () => ({ seenMarks: () => mockMarks() }));
// eslint-disable-next-line import/first
import { getBoard } from '../boardService';

/**
 * Campus v14 B1 (C65): the board reads only the viewer's cohort's visible posts, never shows a locked post's text, marks your own
 * posts, counts replies on them newer than your last look, and keeps counts whole while a search narrows the lists.
 */
const NOW = Date.parse('2026-10-26T17:00:00Z');
const ago = (h: number): Date => new Date(NOW - h * 3600_000);
const post = (o: Record<string, unknown>) => ({ category: 'General', pinned: false, comment_count: 0, like_count: 0, min_level: 1, week: null, ritual_meta: null, created_at: ago(1), ...o });

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  mockPosts.mockResolvedValue([
    post({ id: 'a', member_id: 'me', body: '👋 Roll Call · Week 1\n\nI\'m Pat', ritual_meta: { ritual: 'roll_call', values: { intro: 'Pat' } } }),
    post({ id: 'b', member_id: 'other', body: 'How do I fix this MCP timeout?', category: 'Support' }),
    post({ id: 'c', member_id: 'other', body: 'Members only secret', min_level: 4 }),
  ]);
  mockMembers.mockResolvedValue([{ id: 'me', display_name: 'Pat Lee', avatar_url: null, level: 2 }, { id: 'other', display_name: 'Sam Roe', avatar_url: null, level: 3 }]);
  mockLikes.mockResolvedValue([{ likeable_id: 'b' }]);
  mockQuery.mockResolvedValue([{ post_id: 'a', created_at: ago(1) }, { post_id: 'a', created_at: ago(5) }]);
  mockMarks.mockResolvedValue(new Map([['board', ago(3).toISOString()]]));
});

it('reads only the viewer\'s cohort, visible posts', async () => {
  await getBoard('enr-1', { lane: 'all', olderCursor: null, countsOnly: false }, NOW);
  expect(mockPosts.mock.calls[0][0].where).toEqual({ cohort_id: 'cohort-A', status: 'visible' });
});

it('builds cards: ritual, lane, mine, likes, and a locked teaser without its text', async () => {
  const b = await getBoard('enr-1', { lane: 'all', olderCursor: null, countsOnly: false }, NOW);
  const all = [...b.unanswered, ...b.fresh];
  const a = all.find((p) => p.id === 'a')!;
  expect(a).toEqual(expect.objectContaining({ mine: true, lane: 'intro', ritual: expect.objectContaining({ key: 'roll_call' }), ritual_values: { intro: 'Pat' } }));
  expect(all.find((p) => p.id === 'b')).toEqual(expect.objectContaining({ lane: 'q', viewer_has_liked: true }));
  const c = all.find((p) => p.id === 'c')!;
  expect([c.locked, c.body]).toEqual([true, null]);
  expect(b.unanswered.map((p) => p.id)).toEqual(['b']);
});

it('counts replies on my posts newer than my last look', async () => {
  const b = await getBoard('enr-1', { lane: 'mine', olderCursor: null, countsOnly: false }, NOW);
  expect(b.my_new_replies).toBe(1);
  expect(b.fresh.find((p) => p.id === 'a')!.new_replies).toBe(1);
});

it('a search narrows the lists, never the counts; counts_only returns no posts', async () => {
  const s = await getBoard('enr-1', { lane: 'all', q: 'mcp', olderCursor: null, countsOnly: false }, NOW);
  expect([...s.unanswered, ...s.fresh].map((p) => p.id)).toEqual(['b']);
  expect(s.counts.all).toBe(3);
  mockLikes.mockClear();
  const c = await getBoard('enr-1', { lane: 'all', olderCursor: null, countsOnly: true }, NOW);
  expect([c.fresh.length, c.counts.all, c.my_new_replies]).toEqual([0, 3, 1]);
  expect(mockLikes).not.toHaveBeenCalled(); // counts_only built no cards
});
