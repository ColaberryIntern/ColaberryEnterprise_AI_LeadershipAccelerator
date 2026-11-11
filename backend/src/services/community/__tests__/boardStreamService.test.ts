const mockPosts = jest.fn();
jest.mock('../../../models', () => ({
  CommunityPost: { findAll: (...a: unknown[]) => mockPosts(...a) },
  CommunityMember: { findAll: () => Promise.resolve([{ id: 'me', display_name: 'Pat Lee', avatar_url: null, level: 2 }, { id: 'other', display_name: 'Sam Roe', avatar_url: null, level: 3 }]) },
  CommunityLike: { findAll: () => Promise.resolve([]) },
  Cohort: { findByPk: () => Promise.resolve({ start_date: '2026-10-19' }) },
}));
jest.mock('../../../config/database', () => ({ sequelize: { query: () => Promise.resolve([]) } }));
jest.mock('../../communityService', () => ({
  getOrCreateMember: () => Promise.resolve({ id: 'me', level: 2 }),
  resolveCohortId: () => Promise.resolve('cohort-A'),
}));
jest.mock('../boardSeen', () => ({ seenMarks: () => Promise.resolve(new Map()) }));
// eslint-disable-next-line import/first
import { boardHappening, getSince, getStream } from '../boardStreamService';

/** Campus v20 N2 (C133): the stream and the pill read the board's own cohort-scoped data and never show a locked post's text. */
const NOW = Date.parse('2026-11-11T17:00:00Z');
const ago = (h: number): Date => new Date(NOW - h * 3600_000);
const post = (o: Record<string, unknown>) => ({ category: 'General', pinned: false, comment_count: 0, like_count: 0, min_level: 1, week: null, ritual_meta: null, body: 'Text', ...o });

beforeEach(() => {
  mockPosts.mockResolvedValue([
    post({ id: 'pin', member_id: 'other', pinned: true, created_at: ago(30), body: 'Open House Thursday' }),
    post({ id: 'q', member_id: 'other', category: 'Support', created_at: ago(2), body: 'How do I connect Claude Code to my repo?' }),
    post({ id: 'old', member_id: 'other', created_at: ago(24 * 40), body: 'From last month' }),
    post({ id: 'locked', member_id: 'other', created_at: ago(1), body: 'Members only', min_level: 4 }),
    post({ id: 'mine', member_id: 'me', created_at: ago(3), body: 'My note' }),
    post({ id: 'win', member_id: 'other', created_at: ago(5), body: 'Show and tell', ritual_meta: { ritual: 'show_and_tell', values: {} } }),
  ]);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

it('reads only the viewer\'s cohort, visible posts', async () => {
  await getStream('enr-1', { lane: 'all', cursor: null }, NOW);
  expect(mockPosts.mock.calls[0][0].where).toEqual({ cohort_id: 'cohort-A', status: 'visible' });
});

it('Everything: pinned first, then every post newest first, including the month-old one (nothing capped away)', async () => {
  const s = await getStream('enr-1', { lane: 'all', cursor: null }, NOW);
  expect(s.pinned.map((p) => p.id)).toEqual(['pin']);
  expect(s.posts.map((p) => p.id)).toEqual(['locked', 'q', 'mine', 'win', 'old']);
  expect(s.posts.find((p) => p.id === 'locked')!.body).toBeNull();
  expect(s.open_questions).toBe(1);
  expect(s.counts.all).toBe(6);
  expect(s.week_ritual).not.toBeNull();
  expect(s.next_cursor).toBeNull();
});

it('a search narrows the list and keeps the counts', async () => {
  const s = await getStream('enr-1', { lane: 'all', q: 'claude', cursor: null }, NOW);
  expect(s.posts.map((p) => p.id)).toEqual(['q']);
  expect(s.counts.all).toBe(6);
});

it('since: other people\'s posts newer than the given one, never mine', async () => {
  const r = await getSince('enr-1', 'win');
  expect(r.posts.map((p) => p.id)).toEqual(['locked', 'q']);
  expect(r.count).toBe(2);
});

it('the board part of the strip: open questions and the latest win with its author', async () => {
  await expect(boardHappening('enr-1')).resolves.toEqual({ open_questions: 1, latest_win: expect.objectContaining({ id: 'win', author: 'Sam Roe' }) });
});
