jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));
jest.mock('../../../config/env', () => require('../../../__tests__/testSupport/configMocks').envModuleMock({ jwtSecret: 'test-secret' }));
const mockCounts = jest.fn();
jest.mock('../../../services/commsHub/eventCounts', () => {
  class EventCountsNotFound extends Error { constructor() { super('Event not found.'); } }
  return { EventCountsNotFound, eventCounts: (...a: unknown[]) => mockCounts(...a) };
});

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import router from '../commsHubCountsRoutes';
import { EventCountsNotFound } from '../../../services/commsHub/eventCounts';

/** CH9.7 GET .../events/:id/counts: gated, uuid id, counts in the declared shape, no-store. */
const verify = jwt.verify as unknown as jest.Mock;
const app = express();
app.use(router);
const PATH = '/api/admin/comms-hub/events/11111111-1111-4111-8111-111111111111/counts';
const JACKIE = { role: 'admin', mgmt_role: 'community_organizer', sub: 'u-jackie', email: 'jackie@colaberry.com' };
const as = (who: Record<string, unknown> | null) => { verify.mockReturnValue(who); return who ? { Authorization: 'Bearer t' } : {}; };
const COUNTS = { registered: { value: 40, reason: null }, watched_live: { value: 12, reason: null }, watched_replay: { value: null, reason: 'The stream has not ended yet, so there is no replay.' } };
let errSpy: jest.SpyInstance;
beforeEach(() => { jest.clearAllMocks(); errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => errSpy.mockRestore());

it('answers the counts in the declared shape, not cached', async () => {
  mockCounts.mockResolvedValue(COUNTS);
  const res = await request(app).get(PATH).set(as(JACKIE));
  expect([res.status, res.headers['cache-control']]).toEqual([200, 'no-store']);
  expect(res.body).toEqual(COUNTS);
  expect(mockCounts).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
});
it('401 with no token, 403 without the hub, 400 on a non-uuid id; nothing counted', async () => {
  expect((await request(app).get(PATH)).status).toBe(401);
  expect((await request(app).get(PATH).set(as({ role: 'admin', mgmt_role: 'support' }))).status).toBe(403);
  expect((await request(app).get('/api/admin/comms-hub/events/abc/counts').set(as(JACKIE))).status).toBe(400);
  expect(mockCounts).not.toHaveBeenCalled();
});
it('a missing event is 404; anything else is a 500 with its class, logged', async () => {
  mockCounts.mockRejectedValueOnce(new EventCountsNotFound());
  expect((await request(app).get(PATH).set(as(JACKIE))).status).toBe(404);
  mockCounts.mockRejectedValueOnce(new Error('pool exhausted'));
  const res = await request(app).get(PATH).set(as(JACKIE));
  expect([res.status, res.body.error_class]).toEqual([500, 'CountsFailed']);
  expect(errSpy).toHaveBeenCalled();
});
