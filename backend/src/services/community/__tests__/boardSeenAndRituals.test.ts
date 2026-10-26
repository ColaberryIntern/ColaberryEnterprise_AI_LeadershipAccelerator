const mockQuery = jest.fn();
const mockFindAll = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));
jest.mock('../../../models', () => ({ CommunityPost: { findAll: (...a: unknown[]) => mockFindAll(...a) } }));
// eslint-disable-next-line import/first
import { markSeen, seenMarks } from '../boardSeen';
// eslint-disable-next-line import/first
import { withRituals } from '../postRituals';
// eslint-disable-next-line import/first
import { __resetCommunityBoardSeenSchemaForTests } from '../../../db/ensureCommunityBoardSeenSchema';

/** Campus v14 (C65 / C66): seen marks are idempotent and never move back; the posts feed gets its ritual, best effort. */
beforeEach(() => { mockQuery.mockReset(); mockFindAll.mockReset(); __resetCommunityBoardSeenSchemaForTests(); });
const lastSql = (): string => String(mockQuery.mock.calls[mockQuery.mock.calls.length - 1][0]);

describe('board seen', () => {
  it('creates the table once (IF NOT EXISTS) and reads the marks by scope', async () => {
    mockQuery.mockResolvedValueOnce(undefined).mockResolvedValueOnce([{ scope: 'board', seen_at: '2026-10-26T17:00:00Z' }]);
    const m = await seenMarks('e1');
    expect(String(mockQuery.mock.calls[0][0])).toMatch(/CREATE TABLE IF NOT EXISTS community_board_seen/);
    expect(m.get('board')).toBe('2026-10-26T17:00:00.000Z');
  });
  it('marking seen keeps the later time (never moves back) and is an upsert', async () => {
    mockQuery.mockResolvedValue([{ seen_at: '2026-10-26T17:00:00Z' }]);
    await markSeen('e1', 'board');
    expect(lastSql()).toMatch(/ON CONFLICT \(enrollment_id, scope\) DO UPDATE SET seen_at = GREATEST/);
  });
  it('the localStorage migration only fills a missing mark', async () => {
    mockQuery.mockResolvedValue([{ seen_at: '2026-10-20T10:00:00Z' }]);
    await markSeen('e1', 'board', '2026-10-25T18:55:00Z', true);
    expect(lastSql()).toMatch(/DO UPDATE SET seen_at = community_board_seen\.seen_at/);
  });
});

describe('withRituals', () => {
  it('adds the ritual from ritual_meta or the heading, null otherwise', async () => {
    mockFindAll.mockResolvedValue([
      { id: 'a', body: 'x', week: 5, ritual_meta: { ritual: 'cohort_wins' } },
      { id: 'b', body: '👋 Roll Call · Week 1\n\nhi', week: null, ritual_meta: null },
      { id: 'c', body: 'plain', week: null, ritual_meta: null },
    ]);
    const out = await withRituals([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    expect(out.map((p) => p.ritual?.key ?? null)).toEqual(['cohort_wins', 'roll_call', null]);
  });
  it('a failed read leaves ritual null and keeps the feed', async () => {
    mockFindAll.mockRejectedValue(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await withRituals([{ id: 'a' }])).toEqual([{ id: 'a', ritual: null }]);
  });
  it('no posts, no read', async () => {
    expect(await withRituals([])).toEqual([]);
    expect(mockFindAll).not.toHaveBeenCalled();
  });
});
