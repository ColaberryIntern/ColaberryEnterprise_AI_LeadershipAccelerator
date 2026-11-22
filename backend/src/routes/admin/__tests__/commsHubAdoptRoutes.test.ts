jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));
jest.mock('../../../config/env', () => require('../../../__tests__/testSupport/configMocks').envModuleMock({ jwtSecret: 'test-secret' }));
jest.mock('../commsHubEventRoutes', () => ({ actorOf: (req: { admin?: { sub?: string; email?: string } }) => ({ id: req.admin?.sub ?? null, label: req.admin?.email ?? null }) }));
jest.mock('../../../services/commsHub/eventbrite/registrants', () => ({ listRegistrants: jest.fn(), findPublicEvent: jest.fn() }));
// CH9.6 the reach count behind "N of M registrants have platform accounts".
const mockReach = jest.fn();
jest.mock('../../../services/commsHub/eventbrite/registrantAudience', () => ({ registrantReach: (...a: unknown[]) => mockReach(...a) }));
const mockAdopt = jest.fn();
// The three refusals are the route's contract; their real messages live in adoption.ts and are checked there.
jest.mock('../../../services/commsHub/eventbrite/adoption', () => {
  class AdoptNotFoundError extends Error { constructor() { super('That event is not on the public Eventbrite list.'); } }
  class AdoptEndedError extends Error { constructor() { super('This event has ended, so there is nothing left to manage.'); } }
  class AdoptUnavailableError extends Error { constructor() { super('The Eventbrite list is unavailable right now. Try again in a few minutes.'); } }
  return { AdoptEndedError, AdoptNotFoundError, AdoptUnavailableError, adoptEventbriteEvent: (...a: unknown[]) => mockAdopt(...a) };
});

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import router from '../commsHubAdoptRoutes';
import { AdoptEndedError, AdoptNotFoundError, AdoptUnavailableError } from '../../../services/commsHub/eventbrite/adoption';

/**
 * CH9.5 POST .../eventbrite-events/:ccppEventId/adopt through real Express routing: who may, a
 * digits-only id, 201 on create and 200 when it already existed, and each refusal its own status.
 */
const verify = jwt.verify as unknown as jest.Mock;
const app = express();
app.use(router);
const PATH = (id: string) => `/api/admin/comms-hub/eventbrite-events/${id}/adopt`;
const JACKIE = { role: 'admin', mgmt_role: 'community_organizer', sub: 'u-jackie', email: 'jackie@colaberry.com' };
const VIEW = {
  id: '11111111-1111-4111-8111-111111111111', title: 'AI Open House', event_type: 'open_house', audience: { kind: 'all_members' }, status: 'scheduled',
  starts_at: '2026-12-04T00:30:00.000Z', ends_at: '2026-12-04T02:00:00.000Z',
  central: { date: '2026-12-03', start_time: '18:30', end_time: '20:00', label: 'Thursday, December 3, 6:30 PM CST' },
  repeat_rule: null, next_occurrence_at: '2026-12-04T00:30:00.000Z', upcoming_preview: ['2026-12-04T00:30:00.000Z'],
  join_url: null, registration_url: 'https://www.eventbrite.com/e/ai-open-house-1992498063344', hosts: [], description: 'See what builders shipped.',
  placement: { calendar: false, events_page: true, campus_rail: false }, thumbnail_id: null, broadcast_occurrence_id: null,
  ccpp_event_id: '1992498063344', ccpp_missing_since: null, created_at: '2026-11-21T22:00:00.000Z', updated_at: '2026-11-21T22:00:00.000Z',
};
const as = (who: Record<string, unknown> | null) => { verify.mockReturnValue(who); return who ? { Authorization: 'Bearer t' } : {}; };
let errSpy: jest.SpyInstance;
beforeEach(() => { jest.clearAllMocks(); errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => errSpy.mockRestore());

it('no token is 401, a role without the hub is 403, and nothing is adopted', async () => {
  expect((await request(app).post(PATH('1992498063344'))).status).toBe(401);
  expect((await request(app).post(PATH('1992498063344')).set(as({ role: 'admin', mgmt_role: 'marketing' }))).status).toBe(403);
  expect(mockAdopt).not.toHaveBeenCalled();
});

it('a new hub event is 201 with the event; adopting again is 200 with the same event, as the signed-in person', async () => {
  mockAdopt.mockResolvedValueOnce({ event: VIEW, created: true }).mockResolvedValueOnce({ event: VIEW, created: false });
  const first = await request(app).post(PATH('1992498063344')).set(as(JACKIE));
  const again = await request(app).post(PATH('1992498063344')).set(as(JACKIE));
  expect([first.status, again.status]).toEqual([201, 200]);
  expect(first.body.event.id).toBe(again.body.event.id);
  expect(first.body.event.ccpp_event_id).toBe('1992498063344');
  expect(mockAdopt).toHaveBeenCalledWith('1992498063344', { id: 'u-jackie', label: 'jackie@colaberry.com' });
});

it.each(['abc', '1;DROP', '123456789012345678901'])('%j is a 400 and nothing is adopted', async (id) => {
  expect((await request(app).post(PATH(encodeURIComponent(id))).set(as(JACKIE))).status).toBe(400);
  expect(mockAdopt).not.toHaveBeenCalled();
});

it.each([
  [new AdoptNotFoundError(), 404, 'NotFound'],
  [new AdoptEndedError(), 409, 'EventEnded'],
  [new AdoptUnavailableError(), 503, 'UpstreamUnavailable'],
])('%s answers %i (%s) with its plain message', async (err, status, cls) => {
  mockAdopt.mockRejectedValueOnce(err);
  const res = await request(app).post(PATH('1992498063344')).set(as(JACKIE));
  expect([res.status, res.body.error_class, res.body.error]).toEqual([status, cls, (err as Error).message]);
});

it('anything else is a 500 with its class, and it is logged', async () => {
  mockAdopt.mockRejectedValueOnce(new Error('deadlock detected'));
  const res = await request(app).post(PATH('1992498063344')).set(as(JACKIE));
  expect([res.status, res.body.error_class]).toEqual([500, 'AdoptFailed']);
  expect(errSpy).toHaveBeenCalled();
});

describe('CH9.6 GET /events/:id/registrant-reach (counts only)', () => {
  const R = '/api/admin/comms-hub/events/11111111-1111-4111-8111-111111111111/registrant-reach';
  it('answers the counts, not cached; never a person', async () => {
    mockReach.mockResolvedValue({ registrants: 40, reachable: 12, eventbrite: 'ok' });
    const res = await request(app).get(R).set(as(JACKIE));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ registrants: 40, reachable: 12, eventbrite: 'ok' });
    expect(res.headers['cache-control']).toBe('no-store');
  });
  it('401 with no token, 403 without the hub, 400 on a non-uuid id', async () => {
    expect((await request(app).get(R)).status).toBe(401);
    expect((await request(app).get(R).set(as({ role: 'admin', mgmt_role: 'marketing' }))).status).toBe(403);
    expect((await request(app).get('/api/admin/comms-hub/events/abc/registrant-reach').set(as(JACKIE))).status).toBe(400);
    expect(mockReach).not.toHaveBeenCalled();
  });
  it('a hub-made event is a 404; anything else a 500 with its class', async () => {
    const { ConnectorPermanentError } = jest.requireActual('../../../services/commsHub/connectors/types');
    mockReach.mockRejectedValueOnce(new ConnectorPermanentError('That event is not an Eventbrite event managed in the hub.', 'not_managed'));
    expect((await request(app).get(R).set(as(JACKIE))).status).toBe(404);
    mockReach.mockRejectedValueOnce(new Error('pool exhausted'));
    const res = await request(app).get(R).set(as(JACKIE));
    expect([res.status, res.body.error_class]).toEqual([500, 'ReachFailed']);
  });
});

