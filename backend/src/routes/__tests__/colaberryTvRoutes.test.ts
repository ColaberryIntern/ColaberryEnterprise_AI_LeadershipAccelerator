import type { Request, Response } from 'express';

const mockList = jest.fn();
const mockListAll = jest.fn();
const mockAdd = jest.fn();
const mockUpdate = jest.fn();
const mockReorder = jest.fn();
const mockRemove = jest.fn();
const mockAudience = jest.fn();
const mockMgmt = jest.fn();
let mockCampusOn = true;
jest.mock('../../services/colaberryTv/tvService', () => ({
  listForViewer: (...a: unknown[]) => mockList(...a), listAll: () => mockListAll(), addShort: (...a: unknown[]) => mockAdd(...a),
  updateShort: (...a: unknown[]) => mockUpdate(...a), reorderShorts: (...a: unknown[]) => mockReorder(...a), removeShort: (...a: unknown[]) => mockRemove(...a),
}));
jest.mock('../../services/campus/campusAudience', () => ({ campusAudienceFor: (id: string) => mockAudience(id) }));
jest.mock('../../services/access/mgmtBridgeService', () => ({ getMgmtStatus: (id: string) => mockMgmt(id) }));
jest.mock('../../services/campus/campusPilot', () => ({ campusOnFor: () => mockCampusOn }));
jest.mock('../../middlewares/participantAuth', () => ({ requireParticipant: jest.fn() }));
// eslint-disable-next-line import/first
import { getTvRoute, manageAddRoute, manageListRoute, manageOrderRoute, manageRemoveRoute, manageUpdateRoute } from '../colaberryTvRoutes';

/**
 * Campus v20 N3 (C134): learners read the on-air list for their audience; only staff with the `campaigns` section manage it, and the
 * section lookup fails closed. Malformed input is 400 before any read; a failure is a classified 500.
 */
// The handlers answer several JSON shapes (list, error, playlist); the tests read fields off them, so the body is untyped here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Out = { status: number; json: any };
async function call(handler: (req: Request, res: Response) => Promise<void>, req: Partial<Request>): Promise<Out> {
  const out: Out = { status: 200, json: undefined };
  const res = { status(s: number) { out.status = s; return this; }, json(j: unknown) { out.json = j; return this; } } as unknown as Response;
  await handler({ participant: { sub: 'enr-1' }, query: {}, params: {}, body: {}, ...req } as Request, res);
  return out;
}
const ID = '11111111-2222-4333-8444-000000000001';
const STAFF = { is_mgmt: true, role: 'owner', label: 'Owner', sections: ['dashboard', 'campaigns'] };
const ROW = { id: ID, youtube_id: 'Pa5J5T6MZok', title: 'Short', duration_s: null, audience: 'all', on_air: true, position: 1, created_at: '2026-11-11T15:00:00Z' };

beforeEach(() => {
  for (const m of [mockList, mockListAll, mockAdd, mockUpdate, mockReorder, mockRemove, mockAudience, mockMgmt]) m.mockReset();
  mockCampusOn = true;
  mockAudience.mockResolvedValue('explorer');
  mockMgmt.mockResolvedValue({ is_mgmt: false, role: null, label: null, sections: [] });
  mockListAll.mockResolvedValue([ROW]);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('GET /api/portal/colaberry-tv', () => {
  it('lists for the token\'s learner and their audience; an explorer cannot manage', async () => {
    mockList.mockResolvedValue([{ id: ID }]);
    const o = await call(getTvRoute, {});
    expect(o.status).toBe(200);
    expect(o.json).toEqual({ videos: [{ id: ID }], can_manage: false });
    expect(mockAudience).toHaveBeenCalledWith('enr-1');
    expect(mockList).toHaveBeenCalledWith('explorer');
  });
  it('staff with campaigns can manage', async () => {
    mockMgmt.mockResolvedValue(STAFF);
    mockList.mockResolvedValue([]);
    expect((await call(getTvRoute, {})).json.can_manage).toBe(true);
  });
  it('a failing section lookup counts as cannot manage (fail closed), and the list still loads', async () => {
    mockMgmt.mockRejectedValue(new Error('db down'));
    mockList.mockResolvedValue([]);
    const o = await call(getTvRoute, {});
    expect(o.status).toBe(200);
    expect(o.json.can_manage).toBe(false);
  });
  it('an unknown query parameter is 400; campus off is 403; a failure is a classified 500', async () => {
    expect((await call(getTvRoute, { query: { cohort: 'x' } as never })).status).toBe(400);
    mockCampusOn = false;
    expect((await call(getTvRoute, {})).status).toBe(403);
    mockCampusOn = true;
    mockAudience.mockRejectedValue(new Error('connect ETIMEDOUT'));
    const o = await call(getTvRoute, {});
    expect(o.status).toBe(500);
    expect(o.json.error_class).toBeTruthy();
  });
});

describe('the manage routes', () => {
  const routes: Array<[string, (req: Request, res: Response) => Promise<void>, Partial<Request>]> = [
    ['list', manageListRoute, {}],
    ['add', manageAddRoute, { body: { url: 'https://youtube.com/shorts/Pa5J5T6MZok' } }],
    ['update', manageUpdateRoute, { params: { id: ID } as never, body: { on_air: false } }],
    ['order', manageOrderRoute, { body: { ids: [ID] } }],
    ['remove', manageRemoveRoute, { params: { id: ID } as never }],
  ];

  it.each(routes)('%s is 403 for an explorer and touches nothing', async (_n, h, req) => {
    const o = await call(h, req);
    expect(o.status).toBe(403);
    expect(o.json.error_class).toBe('NotTvManager');
    for (const m of [mockListAll, mockAdd, mockUpdate, mockReorder, mockRemove]) expect(m).not.toHaveBeenCalled();
  });
  it.each(routes)('%s is 403 when the section lookup throws (fail closed)', async (_n, h, req) => {
    mockMgmt.mockRejectedValue(new Error('db down'));
    expect((await call(h, req)).status).toBe(403);
  });
  it.each(routes)('%s is 403 with the campus off', async (_n, h, req) => {
    mockMgmt.mockResolvedValue(STAFF);
    mockCampusOn = false;
    expect((await call(h, req)).status).toBe(403);
  });

  describe('as staff with campaigns', () => {
    beforeEach(() => { mockMgmt.mockResolvedValue(STAFF); });

    it('add: a new link is 201 with the playlist; the same link again is 200, not created', async () => {
      mockAdd.mockResolvedValueOnce({ row: ROW, created: true }).mockResolvedValueOnce({ row: ROW, created: false });
      const a = await call(manageAddRoute, { body: { url: 'https://www.youtube.com/shorts/Pa5J5T6MZok' } });
      expect(a.status).toBe(201);
      expect(a.json.created).toBe(true);
      expect(a.json.videos).toEqual([{ id: ID, youtube_id: 'Pa5J5T6MZok', title: 'Short', duration_s: null, audience: 'all', on_air: true, position: 1 }]);
      expect(mockAdd).toHaveBeenCalledWith('Pa5J5T6MZok', 'enrollment:enr-1');
      const b = await call(manageAddRoute, { body: { url: 'https://youtu.be/Pa5J5T6MZok' } });
      expect(b.status).toBe(200);
      expect(b.json.created).toBe(false);
    });
    it.each([
      ['no url', {}],
      ['an extra key', { url: 'https://youtu.be/Pa5J5T6MZok', on_air: true }],
      ['not a YouTube link', { url: 'https://example.com/video' }],
    ])('add with %s is 400 and adds nothing', async (_n, body) => {
      expect((await call(manageAddRoute, { body })).status).toBe(400);
      expect(mockAdd).not.toHaveBeenCalled();
    });
    it('update: a bad id or an empty change is 400; an unknown id is 404', async () => {
      expect((await call(manageUpdateRoute, { params: { id: 'nope' } as never, body: { on_air: true } })).status).toBe(400);
      expect((await call(manageUpdateRoute, { params: { id: ID } as never, body: {} })).status).toBe(400);
      mockUpdate.mockResolvedValue('not_found');
      expect((await call(manageUpdateRoute, { params: { id: ID } as never, body: { title: 'x' } })).status).toBe(404);
      mockUpdate.mockResolvedValue(ROW);
      expect((await call(manageUpdateRoute, { params: { id: ID } as never, body: { audience: 'members' } })).status).toBe(200);
      expect(mockUpdate).toHaveBeenLastCalledWith(ID, { audience: 'members' }, 'enrollment:enr-1');
    });
    it('order: a stale order is 409; a good one returns the playlist', async () => {
      mockReorder.mockResolvedValueOnce('mismatch').mockResolvedValueOnce([ROW]);
      expect((await call(manageOrderRoute, { body: { ids: [ID] } })).status).toBe(409);
      expect((await call(manageOrderRoute, { body: { ids: [ID] } })).status).toBe(200);
      expect((await call(manageOrderRoute, { body: { ids: [ID, ID] } })).status).toBe(400);
    });
    it('remove: unknown is 404; removed returns the playlist', async () => {
      mockRemove.mockResolvedValueOnce('not_found').mockResolvedValueOnce('removed');
      expect((await call(manageRemoveRoute, { params: { id: ID } as never })).status).toBe(404);
      expect((await call(manageRemoveRoute, { params: { id: ID } as never })).status).toBe(200);
    });
    it('a service failure is a classified 500 without a stack', async () => {
      mockRemove.mockRejectedValue(new Error('connect ETIMEDOUT'));
      const o = await call(manageRemoveRoute, { params: { id: ID } as never });
      expect(o.status).toBe(500);
      expect(JSON.stringify(o.json)).not.toMatch(/at |\.ts/);
    });
  });
});
