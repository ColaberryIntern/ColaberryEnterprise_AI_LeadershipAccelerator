jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));
jest.mock('../../../config/env', () => require('../../../__tests__/testSupport/configMocks')
  .envModuleMock({ jwtSecret: 'test-secret' }));

import jwt from 'jsonwebtoken';
import router, { getHubSummary } from '../commsHubRoutes';
import { registerSummaryCounters, resetSummaryCounters } from '../../../services/commsHub/commsHubSummary';

/** CH1.3 the summary route: guarded by comms_hub, returns the contract shape, and reports counters it is given. */
const verify = jwt.verify as unknown as jest.Mock;

function mockRes() {
  const res: any = {
    statusCode: 200, body: undefined as unknown,
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
  return res;
}

/** The route's own middleware chain, run in order, so the guard is tested where it is mounted. */
async function call(payload: Record<string, unknown>) {
  const layer = (router as any).stack.find((l: any) => l.route?.path === '/api/admin/comms-hub/summary');
  const handlers = layer.route.stack.map((s: any) => s.handle);
  const req: any = { method: 'GET', headers: { authorization: 'Bearer t' } };
  const res = mockRes();
  verify.mockReturnValue(payload);
  for (const h of handlers) {
    let advanced = false;
    await h(req, res, () => { advanced = true; });
    if (!advanced) break;
  }
  return res;
}

afterEach(() => { resetSummaryCounters(); jest.clearAllMocks(); });

describe('CH1.3 GET /api/admin/comms-hub/summary', () => {
  it('an empty hub is all zeros and not paused, in the contract shape', async () => {
    const res = await call({ role: 'admin', mgmt_role: 'community_organizer' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      awaiting_approval: 0, scheduled_next_7_days: 0, upcoming_events: 0,
      events_missing_thumbnail: 0, needs_attention: 0, sending_paused: false,
    });
  });

  it('reports what the features register', async () => {
    registerSummaryCounters({ upcomingEvents: async () => 3, eventsMissingThumbnail: async () => 1, sendingPaused: async () => true });
    const res = await call({ role: 'admin', mgmt_role: 'community_organizer' });
    expect(res.body).toMatchObject({ upcoming_events: 3, events_missing_thumbnail: 1, sending_paused: true });
  });

  it('a role without comms_hub is refused by the route guard itself (403), not only by the global gate', async () => {
    const res = await call({ role: 'admin', mgmt_role: 'revenue' });
    expect(res.statusCode).toBe(403);
    expect(res.body).toBeDefined();
  });

  it('a failing counter is a 500 with a plain message, never a partial summary', async () => {
    registerSummaryCounters({ awaitingApproval: async () => { throw new Error('db down'); } });
    const res = mockRes();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await getHubSummary({} as any, res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Could not load the Communications Hub summary.' });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
