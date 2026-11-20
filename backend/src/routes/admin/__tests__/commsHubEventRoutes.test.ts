jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));
jest.mock('../../../config/env', () => require('../../../__tests__/testSupport/configMocks')
  .envModuleMock({ jwtSecret: 'test-secret' }));
jest.mock('../../../services/commsHub/eventService', () => {
  const actual = jest.requireActual('../../../services/commsHub/eventService');
  return {
    EventNotFoundError: actual.EventNotFoundError,
    EventStateError: actual.EventStateError,
    listEvents: jest.fn(), getEvent: jest.fn(), createEvent: jest.fn(), updateEvent: jest.fn(), duplicateEvent: jest.fn(), cancelEvent: jest.fn(),
  };
});

import jwt from 'jsonwebtoken';
import router from '../commsHubEventRoutes';
import * as svc from '../../../services/commsHub/eventService';

/** CH2.2 events API: guard, Zod before the service, error mapping. The service is mocked; its rules have their own tests. */
const verify = jwt.verify as unknown as jest.Mock;
const ID = '33333333-3333-4333-8333-333333333333';
const VIEW = {
  id: ID, title: 'Demo Tuesday', event_type: 'other', audience: { kind: 'all_members' }, status: 'scheduled',
  starts_at: '2026-12-02T00:00:00.000Z', ends_at: null,
  central: { date: '2026-12-01', start_time: '18:00', end_time: null, label: 'Dec 1, 6:00 PM CST' },
  repeat_rule: null, next_occurrence_at: '2026-12-02T00:00:00.000Z', upcoming_preview: ['2026-12-02T00:00:00.000Z'],
  join_url: null, registration_url: null, hosts: [], description: null,
  placement: { calendar: true, events_page: true, campus_rail: true }, thumbnail_id: null, broadcast_occurrence_id: null,
  created_at: '2026-11-20T00:00:00.000Z', updated_at: '2026-11-20T00:00:00.000Z',
};

async function call(method: string, path: string, opts: { body?: unknown; params?: Record<string, string>; query?: Record<string, string>; who?: Record<string, unknown> } = {}) {
  const layer = (router as any).stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
  const req: any = { method: method.toUpperCase(), headers: { authorization: 'Bearer t' }, body: opts.body, params: opts.params ?? {}, query: opts.query ?? {} };
  const res: any = { statusCode: 200, body: undefined, status(c: number) { this.statusCode = c; return this; }, json(b: unknown) { this.body = b; return this; } };
  verify.mockReturnValue(opts.who ?? { role: 'admin', mgmt_role: 'community_organizer', sub: 'jackie-1', email: 'jackie@colaberry.com' });
  for (const s of layer.route.stack) {
    let advanced = false;
    await s.handle(req, res, () => { advanced = true; });
    if (!advanced) break;
  }
  return res;
}

const body = { title: 'Demo Tuesday', date: '2026-12-01', start_time: '18:00' };
beforeEach(() => jest.clearAllMocks());

describe('CH2.2 events API', () => {
  it('create: 201 with the event, the actor passed through', async () => {
    (svc.createEvent as jest.Mock).mockResolvedValue(VIEW);
    const res = await call('post', '/api/admin/comms-hub/events', { body });
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ event: VIEW });
    expect(svc.createEvent).toHaveBeenCalledWith(expect.objectContaining({ title: 'Demo Tuesday' }), { id: 'jackie-1', label: 'jackie@colaberry.com' });
  });

  it('a bad body is 400 and the service is never called', async () => {
    const res = await call('post', '/api/admin/comms-hub/events', { body: { ...body, start_time: '6pm' } });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/start_time/);
    expect(svc.createEvent).not.toHaveBeenCalled();
  });

  it('a rule zod cannot see (end before start) is a 400 with the plain reason', async () => {
    const { EventInputError } = jest.requireActual('../../../services/commsHub/eventInput');
    (svc.createEvent as jest.Mock).mockRejectedValueOnce(new EventInputError('The end time must be after the start time.'));
    const res = await call('post', '/api/admin/comms-hub/events', { body: { ...body, end_time: '17:00' } });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'The end time must be after the start time.', error_class: 'ValidationError' });
  });

  it('a bad id or scope is 400 before the service runs', async () => {
    expect((await call('get', '/api/admin/comms-hub/events/:id', { params: { id: 'nope' } })).statusCode).toBe(400);
    expect((await call('get', '/api/admin/comms-hub/events', { query: { scope: 'everything' } })).statusCode).toBe(400);
    expect(svc.getEvent).not.toHaveBeenCalled();
    expect(svc.listEvents).not.toHaveBeenCalled();
  });

  it('service errors map to 404, 409 and a plain 500', async () => {
    (svc.updateEvent as jest.Mock).mockRejectedValueOnce(new svc.EventNotFoundError('Event not found.'));
    expect((await call('put', '/api/admin/comms-hub/events/:id', { params: { id: ID }, body })).statusCode).toBe(404);
    (svc.cancelEvent as jest.Mock).mockRejectedValueOnce(new svc.EventStateError('End the live stream before cancelling this event.'));
    expect((await call('post', '/api/admin/comms-hub/events/:id/cancel', { params: { id: ID } })).statusCode).toBe(409);
    (svc.duplicateEvent as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await call('post', '/api/admin/comms-hub/events/:id/duplicate', { params: { id: ID } });
    spy.mockRestore();
    expect(r.statusCode).toBe(500);
    expect(r.body.error).not.toMatch(/db down/);
  });

  it('every route refuses a role without comms_hub', async () => {
    const who = { role: 'admin', mgmt_role: 'revenue', sub: 'x' };
    for (const [m, p] of [['get', '/api/admin/comms-hub/events'], ['post', '/api/admin/comms-hub/events'], ['get', '/api/admin/comms-hub/events/:id'],
      ['put', '/api/admin/comms-hub/events/:id'], ['post', '/api/admin/comms-hub/events/:id/duplicate'], ['post', '/api/admin/comms-hub/events/:id/cancel']]) {
      expect((await call(m, p, { who, params: { id: ID }, body })).statusCode).toBe(403);
    }
  });
});
