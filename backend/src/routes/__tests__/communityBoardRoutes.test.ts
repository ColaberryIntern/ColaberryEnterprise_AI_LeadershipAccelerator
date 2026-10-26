import type { Request, Response } from 'express';

const mockGetBoard = jest.fn();
const mockMarkSeen = jest.fn();
let mockCampusOn = true;
jest.mock('../../services/community/boardService', () => ({ getBoard: (...a: unknown[]) => mockGetBoard(...a) }));
jest.mock('../../services/community/boardSeen', () => ({ markSeen: (...a: unknown[]) => mockMarkSeen(...a) }));
jest.mock('../../services/campus/campusPilot', () => ({ campusOnFor: () => mockCampusOn }));
jest.mock('../../middlewares/participantAuth', () => ({ requireParticipant: jest.fn() }));
// eslint-disable-next-line import/first
import { getBoardRoute, postSeenRoute } from '../communityBoardRoutes';

/**
 * Campus v14 B1 (C65 / C66): the board and its seen mark. The viewer comes only from the token; malformed input is 400 before any
 * read; the campus off is 403; a failure is a classified 500 that never hangs.
 */
type Out = { status: number; json: unknown };
async function call(handler: (req: Request, res: Response) => Promise<void>, req: Partial<Request>): Promise<Out> {
  const out: Out = { status: 200, json: undefined };
  const res = { status(s: number) { out.status = s; return this; }, json(j: unknown) { out.json = j; return this; } } as unknown as Response;
  await handler({ participant: { sub: 'enr-1' }, ...req } as Request, res);
  return out;
}
beforeEach(() => { mockGetBoard.mockReset(); mockMarkSeen.mockReset(); mockCampusOn = true; });

describe('GET /community/board', () => {
  it('reads the board for the token\'s learner, defaulting to all', async () => {
    mockGetBoard.mockResolvedValue({ counts: {} });
    const o = await call(getBoardRoute, { query: {} });
    expect(o.status).toBe(200);
    expect(mockGetBoard).toHaveBeenCalledWith('enr-1', { lane: 'all', q: undefined, olderCursor: null, countsOnly: false });
  });
  it('passes lane, search, the older cursor and counts_only', async () => {
    mockGetBoard.mockResolvedValue({});
    await call(getBoardRoute, { query: { lane: 'q', q: ' mcp ', older_cursor: 'start', counts_only: '1' } });
    expect(mockGetBoard).toHaveBeenCalledWith('enr-1', { lane: 'q', q: 'mcp', olderCursor: 'start', countsOnly: true });
  });
  it.each([
    ['an unknown lane', { lane: 'everything' }],
    ['an unknown parameter (strict)', { cohort_id: 'other-cohort' }],
    ['a search too long', { q: 'x'.repeat(121) }],
  ])('%s is 400 and reads nothing', async (_n, query) => {
    expect((await call(getBoardRoute, { query: query as never })).status).toBe(400);
    expect(mockGetBoard).not.toHaveBeenCalled();
  });
  it('campus off is 403', async () => {
    mockCampusOn = false;
    expect((await call(getBoardRoute, { query: {} })).status).toBe(403);
  });
  it('a failure is a classified 500', async () => {
    mockGetBoard.mockRejectedValue(new Error('connect ETIMEDOUT'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const o = await call(getBoardRoute, { query: {} });
    expect(o.status).toBe(500);
    expect((o.json as { error_class: string }).error_class).toBeTruthy();
  });
});

describe('POST /community/board/seen', () => {
  it('marks the board seen for the token\'s learner', async () => {
    mockMarkSeen.mockResolvedValue('2026-10-26T17:00:00.000Z');
    const o = await call(postSeenRoute, { body: {} });
    expect(mockMarkSeen).toHaveBeenCalledWith('enr-1', 'board', undefined, false);
    expect(o.json).toEqual({ seen_at: '2026-10-26T17:00:00.000Z' });
  });
  it('marks one of your posts seen', async () => {
    mockMarkSeen.mockResolvedValue('x');
    const id = '0b3a5c1e-2d4f-4a6b-8c9d-0e1f2a3b4c5d';
    await call(postSeenRoute, { body: { post_id: id } });
    expect(mockMarkSeen).toHaveBeenCalledWith('enr-1', `post:${id}`, undefined, false);
  });
  it('the localStorage migration carries its time once (onlyIfMissing)', async () => {
    mockMarkSeen.mockResolvedValue('x');
    await call(postSeenRoute, { body: { at: '2026-10-25T18:55:00Z', migrate: true } });
    expect(mockMarkSeen).toHaveBeenCalledWith('enr-1', 'board', '2026-10-25T18:55:00Z', true);
  });
  it.each([
    ['a migrate without a time', { migrate: true }],
    ['a post id that is not a uuid', { post_id: 'abc' }],
    ['an extra field', { enrollment_id: 'someone-else' }],
  ])('%s is 400', async (_n, body) => {
    expect((await call(postSeenRoute, { body })).status).toBe(400);
    expect(mockMarkSeen).not.toHaveBeenCalled();
  });
});
