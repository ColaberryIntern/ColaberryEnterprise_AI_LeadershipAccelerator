jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));
jest.mock('../../campusRoutes', () => ({
  sendValidated: (res: { json: (b: unknown) => unknown }, schema: { parse: (b: unknown) => unknown }, body: unknown) => res.json(schema.parse(body)),
  logFailure: jest.fn(),
}));
jest.mock('../../../config/env', () => require('../../../__tests__/testSupport/configMocks').envModuleMock({ jwtSecret: 'test-secret' }));
const mockList = jest.fn();
jest.mock('../../../services/commsHub/eventbrite/eventbriteEvents', () => ({ listEventbriteEvents: (...a: unknown[]) => mockList(...a) }));

import jwt from 'jsonwebtoken';
import router from '../commsHubEventbriteRoutes';

/** CH9.2 GET /api/admin/comms-hub/eventbrite-events: gated, query validated, answer matches its declared shape. */
const verify = jwt.verify as unknown as jest.Mock;
const PATH = '/api/admin/comms-hub/eventbrite-events';
const ORGANIZER = { role: 'admin', mgmt_role: 'community_organizer', sub: 'u-jackie', email: 'jackie@colaberry.com' };
async function call(o: { query?: Record<string, string>; who?: Record<string, unknown> | null } = {}) {
  const layer = (router as any).stack.find((l: any) => l.route?.path === PATH && l.route.methods.get);
  const req: any = { method: 'GET', headers: o.who === null ? {} : { authorization: 'Bearer t' }, params: {}, query: o.query ?? {} };
  const res: any = { statusCode: 200, body: undefined, status(c: number) { this.statusCode = c; return this; }, json(b: unknown) { this.body = b; return this; } };
  verify.mockReturnValue(o.who === undefined ? ORGANIZER : o.who);
  for (const s of layer.route.stack) { let go = false; await s.handle(req, res, () => { go = true; }); if (!go) break; }
  return res;
}
const EVENT = { ccpp_event_id: '1234567890', title: 'AI Open House', starts_at: '2026-12-04T00:30:00.000Z', ends_at: null, registration_url: 'https://www.eventbrite.com/e/x-1234567890', image_url: null, registered: 14, eventbrite_status: 'live' };
beforeEach(() => jest.clearAllMocks());

it('refuses no token (401) and a role without the hub (403), and never reads Eventbrite', async () => {
  expect((await call({ who: null })).statusCode).toBe(401);
  expect((await call({ who: { role: 'admin', mgmt_role: 'support' } })).statusCode).toBe(403);
  expect(mockList).not.toHaveBeenCalled();
});
it('defaults to upcoming and answers the declared shape', async () => {
  mockList.mockResolvedValue({ status: 'ok', window: 'upcoming', events: [EVENT], fetched_at: '2026-11-21T22:00:00.000Z' });
  const res = await call();
  expect(res.statusCode).toBe(200);
  expect(mockList).toHaveBeenCalledWith('upcoming');
  expect(res.body.events[0]).toEqual(EVENT);
});
it('passes past through', async () => {
  mockList.mockResolvedValue({ status: 'unavailable', window: 'past', events: [], fetched_at: '2026-11-21T22:00:00.000Z' });
  expect((await call({ query: { window: 'past' } })).body.status).toBe('unavailable');
  expect(mockList).toHaveBeenCalledWith('past');
});
it.each([[{ window: 'all' }], [{ window: 'upcoming', extra: '1' }]])('a bad query %j is a 400', async (query) => {
  expect((await call({ query })).statusCode).toBe(400);
  expect(mockList).not.toHaveBeenCalled();
});
it('an answer that breaks its contract is refused, not passed on (a non-numeric id)', async () => {
  mockList.mockResolvedValue({ status: 'ok', window: 'upcoming', events: [{ ...EVENT, ccpp_event_id: 'abc' }], fetched_at: 'x' });
  expect((await call()).statusCode).toBe(500);
});
