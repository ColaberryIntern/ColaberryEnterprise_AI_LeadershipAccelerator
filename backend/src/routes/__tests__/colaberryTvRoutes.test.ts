import type { Request, Response } from 'express';

const mockList = jest.fn();
const mockAudience = jest.fn();
const mockMgmt = jest.fn();
let mockCampusOn = true;
jest.mock('../../services/colaberryTv/tvService', () => ({
  listForViewer: (...a: unknown[]) => mockList(...a),
}));
jest.mock('../../services/campus/campusAudience', () => ({ campusAudienceFor: (id: string) => mockAudience(id) }));
jest.mock('../../services/access/mgmtBridgeService', () => ({ getMgmtStatus: (id: string) => mockMgmt(id) }));
jest.mock('../../services/campus/campusPilot', () => ({ campusOnFor: () => mockCampusOn }));
jest.mock('../../middlewares/participantAuth', () => ({ requireParticipant: jest.fn() }));
// eslint-disable-next-line import/first
import { getTvRoute } from '../colaberryTvRoutes';

/**
 * Campus v20 N3 (C134): learners read the on-air list for their audience. Malformed input is 400 before any read; a failure is a
 * classified 500.
 *
 * TV-2 removed the five manage routes this file also drove - `manageListRoute`, `manageAddRoute`, `manageUpdateRoute`,
 * `manageOrderRoute`, `manageRemoveRoute` - along with the service writes behind them. What is left is the live path, unchanged.
 *
 * `can_manage` IS STILL TESTED HERE and that is deliberate: it outlived the routes it used to gate, because it is the only thing
 * deciding whether the Manage button renders at all. The fail-closed case below is the one that protects it.
 */
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

beforeEach(() => {
  for (const m of [mockList, mockAudience, mockMgmt]) m.mockReset();
  mockCampusOn = true;
  mockAudience.mockResolvedValue('explorer');
  mockMgmt.mockResolvedValue({ is_mgmt: false, role: null, label: null, sections: [] });
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

describe('what TV-2 removed from this module', () => {
  /**
   * The five manage route handlers were exported from `colaberryTvRoutes` and are gone. Asserting
   * their absence is worth a test because the alternative - deleting the cases that drove them -
   * leaves nothing that would notice if they came back unguarded.
   */
  it('exports the live route and nothing that writes', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const mod = require('../colaberryTvRoutes');
    expect(typeof mod.getTvRoute).toBe('function');
    for (const gone of ['manageListRoute', 'manageAddRoute', 'manageUpdateRoute', 'manageOrderRoute', 'manageRemoveRoute']) {
      expect(mod[gone]).toBeUndefined();
    }
  });

  it('the service it calls exposes no write functions either', () => {
    // The mock above mirrors the real module's surface. If a write were reintroduced to
    // `tvService`, this is the line that should make someone justify it.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const svc = require('../../services/colaberryTv/tvService');
    for (const gone of ['addShort', 'updateShort', 'reorderShorts', 'removeShort', 'listAll']) {
      expect(svc[gone]).toBeUndefined();
    }
  });
});
