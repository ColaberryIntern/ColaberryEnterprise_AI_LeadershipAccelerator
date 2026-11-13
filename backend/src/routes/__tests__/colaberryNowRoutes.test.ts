import type { Request, Response } from 'express';

const mockStream = jest.fn();
const mockSince = jest.fn();
const mockHappening = jest.fn();
let mockCampusOn = true;
jest.mock('../../services/community/boardStreamService', () => ({ getStream: (...a: unknown[]) => mockStream(...a), getSince: (...a: unknown[]) => mockSince(...a) }));
jest.mock('../../services/colaberryNow/happeningService', () => ({ getHappening: (...a: unknown[]) => mockHappening(...a) }));
jest.mock('../../services/campus/campusPilot', () => ({ campusOnFor: () => mockCampusOn }));
jest.mock('../../middlewares/participantAuth', () => ({ requireParticipant: jest.fn() }));
// eslint-disable-next-line import/first
import { getHappeningRoute, getSinceRoute, getStreamRoute } from '../colaberryNowRoutes';

/** Campus v20 N2 (C133): the stream, the pill and the strip. Viewer and cohort from the token only; 400 before any read; 403 off. */
type Out = { status: number; json: unknown };
async function call(handler: (req: Request, res: Response) => Promise<void>, req: Partial<Request>): Promise<Out> {
  const out: Out = { status: 200, json: undefined };
  const res = { status(s: number) { out.status = s; return this; }, json(j: unknown) { out.json = j; return this; } } as unknown as Response;
  await handler({ participant: { sub: 'enr-1', cohort_id: 'coh-1' }, query: {}, ...req } as Request, res);
  return out;
}
const POST = '11111111-2222-4333-8444-000000000001';
beforeEach(() => {
  for (const m of [mockStream, mockSince, mockHappening]) { m.mockReset(); m.mockResolvedValue({}); }
  mockCampusOn = true;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('GET /community/board/stream', () => {
  it('defaults to Everything from the top, for the token\'s learner', async () => {
    expect((await call(getStreamRoute, {})).status).toBe(200);
    expect(mockStream).toHaveBeenCalledWith('enr-1', { lane: 'all', q: undefined, cursor: null });
  });
  it('passes lane, search and cursor', async () => {
    await call(getStreamRoute, { query: { lane: 'q', q: ' mcp ', cursor: '2026-11-11T10:00:00.000Z|abc' } });
    expect(mockStream).toHaveBeenCalledWith('enr-1', { lane: 'q', q: 'mcp', cursor: '2026-11-11T10:00:00.000Z|abc' });
  });
  it.each([
    ['an unknown lane', { lane: 'everything' }],
    ['an unknown key (no cohort override)', { cohort_id: 'other' }],
    ['a long search', { q: 'x'.repeat(121) }],
    ['a long cursor', { cursor: 'x'.repeat(121) }],
  ])('%s is 400 and reads nothing', async (_n, query) => {
    expect((await call(getStreamRoute, { query: query as never })).status).toBe(400);
    expect(mockStream).not.toHaveBeenCalled();
  });
});

describe('GET /community/board/since', () => {
  it('reads newer posts after the given post', async () => {
    await call(getSinceRoute, { query: { after: POST } });
    expect(mockSince).toHaveBeenCalledWith('enr-1', POST);
  });
  it.each([['missing', {}], ['not a uuid', { after: 'top' }], ['an extra key', { after: POST, lane: 'q' }]])('after %s is 400', async (_n, query) => {
    expect((await call(getSinceRoute, { query: query as never })).status).toBe(400);
    expect(mockSince).not.toHaveBeenCalled();
  });
});

describe('GET /colaberry-now/happening', () => {
  it('reads the strip for the token\'s learner and cohort', async () => {
    await call(getHappeningRoute, {});
    expect(mockHappening).toHaveBeenCalledWith('enr-1', 'coh-1');
  });
  it('any query parameter is 400', async () => {
    expect((await call(getHappeningRoute, { query: { cohort: 'x' } as never })).status).toBe(400);
  });
});

describe('every route', () => {
  const routes: Array<[string, (req: Request, res: Response) => Promise<void>, Partial<Request>, jest.Mock]> = [
    ['stream', getStreamRoute, {}, mockStream], ['since', getSinceRoute, { query: { after: POST } }, mockSince], ['happening', getHappeningRoute, {}, mockHappening],
  ];
  it.each(routes)('%s: campus off is 403', async (_n, h, req, m) => {
    mockCampusOn = false;
    expect((await call(h, req)).status).toBe(403);
    expect(m).not.toHaveBeenCalled();
  });
  it.each(routes)('%s: a failure is a classified 500', async (_n, h, req, m) => {
    m.mockRejectedValue(new Error('connect ETIMEDOUT'));
    const o = await call(h, req);
    expect(o.status).toBe(500);
    expect((o.json as { error_class: string }).error_class).toBeTruthy();
  });
});
