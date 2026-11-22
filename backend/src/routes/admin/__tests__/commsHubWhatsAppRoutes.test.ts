jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));
jest.mock('../../../config/env', () => require('../../../__tests__/testSupport/configMocks').envModuleMock({ jwtSecret: 'test-secret' }));
const mockStatus = jest.fn();
jest.mock('../../../services/commsHub/whatsapp/whatsappStatus', () => ({ whatsappStatus: (...a: unknown[]) => mockStatus(...a) }));
const mockState = { read: jest.fn(), clearBreaker: jest.fn() };
jest.mock('../../../services/commsHub/whatsapp/sendState', () => ({ sendStateStore: mockState }));
const mockLogActivity = jest.fn();
jest.mock('../../../services/commsHub/activityLog', () => ({ logActivity: (...a: unknown[]) => mockLogActivity(...a) }));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import router from '../commsHubWhatsAppRoutes';

/** CH10.1 GET .../whatsapp/status: gated, strict shape, no-store; a leaked field is refused. */
const verify = jwt.verify as unknown as jest.Mock;
const app = express();
app.use(express.json());
app.use(router);
const PATH = '/api/admin/comms-hub/whatsapp/status';
const JACKIE = { role: 'admin', mgmt_role: 'community_organizer', sub: 'u-jackie', email: 'jackie@colaberry.com' };
const as = (who: Record<string, unknown> | null) => { verify.mockReturnValue(who); return who ? { Authorization: 'Bearer t' } : {}; };
const OFF = { configured: false, enabled: false, state: 'not_configured', number_last4: null, reason: 'WhatsApp is switched off for the hub.' };
const ANSWER = { ...OFF, paused_until: null };
let errSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks(); errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mockState.read.mockResolvedValue({ next_send_at: null, day: null, count: 0, breaker_until: null, breaker_reason: null });
});
afterEach(() => errSpy.mockRestore());

it('answers the status in the declared shape, not cached', async () => {
  mockStatus.mockResolvedValue(OFF);
  const res = await request(app).get(PATH).set(as(JACKIE));
  expect([res.status, res.headers['cache-control']]).toEqual([200, 'no-store']);
  expect(res.body).toEqual(ANSWER);
});
it('401 with no token, 403 without the hub; the status is never read', async () => {
  expect((await request(app).get(PATH)).status).toBe(401);
  expect((await request(app).get(PATH).set(as({ role: 'admin', mgmt_role: 'support' }))).status).toBe(403);
  expect(mockStatus).not.toHaveBeenCalled();
});
it('a full number or any extra field can never reach the browser, even in production', async () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    mockStatus.mockResolvedValue({ ...OFF, configured: true, enabled: true, state: 'connected', number_last4: '15551234567', reason: null });
    const a = await request(app).get(PATH).set(as(JACKIE));
    mockStatus.mockResolvedValue({ ...OFF, token: 'tok_SECRET', number: '15551234567' });
    const b = await request(app).get(PATH).set(as(JACKIE));
    expect([a.status, a.body.number_last4]).toEqual([200, null]);
    expect(b.body).toEqual(ANSWER);
    for (const res of [a, b]) {
      expect(JSON.stringify(res.body)).not.toContain('5551234567');
      expect(JSON.stringify(res.body)).not.toContain('tok_SECRET');
    }
  } finally { process.env.NODE_ENV = prev; }
});
it('a failure is a 500 with its class, logged', async () => {
  mockStatus.mockRejectedValueOnce(new Error('boom'));
  const res = await request(app).get(PATH).set(as(JACKIE));
  expect([res.status, res.body.error_class]).toEqual([500, 'StatusFailed']);
  expect(errSpy).toHaveBeenCalled();
});

describe('CH10.4 the breaker in the status, and clearing it early', () => {
  const CLEAR = '/api/admin/comms-hub/whatsapp/breaker/clear';
  it('an open breaker shows as paused_until; a passed one does not', async () => {
    mockStatus.mockResolvedValue(OFF);
    const until = new Date(Date.now() + 3600_000);
    mockState.read.mockResolvedValueOnce({ next_send_at: null, day: null, count: 0, breaker_until: until, breaker_reason: 'rate_limited' });
    expect((await request(app).get(PATH).set(as(JACKIE))).body.paused_until).toBe(until.toISOString());
    mockState.read.mockResolvedValueOnce({ next_send_at: null, day: null, count: 0, breaker_until: new Date(Date.now() - 1000), breaker_reason: 'rate_limited' });
    expect((await request(app).get(PATH).set(as(JACKIE))).body.paused_until).toBeNull();
  });
  it('401 logged out; 403 without the hub; 403 for a hub holder without an organizer role; nothing cleared', async () => {
    expect((await request(app).post(CLEAR).send({ confirm: true })).status).toBe(401);
    expect((await request(app).post(CLEAR).set(as({ role: 'admin', mgmt_role: 'support' })).send({ confirm: true })).status).toBe(403);
    const taiwo = { role: 'admin', mgmt_role: 'lead_intake', mgmt_extra_sections: ['comms_hub'], sub: 'u-taiwo', email: 'taiwo@colaberry.com' };
    const refused = await request(app).post(CLEAR).set(as(taiwo)).send({ confirm: true });
    expect([refused.status, refused.body.error_class]).toEqual([403, 'Forbidden']);
    expect(mockState.clearBreaker).not.toHaveBeenCalled();
  });
  it('400 without an explicit confirm', async () => {
    for (const body of [{}, { confirm: false }, { confirm: 'yes' }, { confirm: true, extra: 1 }]) {
      expect((await request(app).post(CLEAR).set(as(JACKIE)).send(body)).status).toBe(400);
    }
    expect(mockState.clearBreaker).not.toHaveBeenCalled();
  });
  it('200 for an organizer with a confirm: cleared, with an activity row naming who', async () => {
    const was = new Date('2026-12-03T18:00:00Z');
    mockState.clearBreaker.mockResolvedValue(was);
    const res = await request(app).post(CLEAR).set(as(JACKIE)).send({ confirm: true });
    expect([res.status, res.body]).toEqual([200, { cleared: true }]);
    expect(mockLogActivity).toHaveBeenCalledWith({ id: 'u-jackie', label: 'jackie@colaberry.com' }, 'whatsapp.breaker_cleared', 'settings', null, { was_until: was.toISOString() });
    mockState.clearBreaker.mockResolvedValue(null);
    expect((await request(app).post(CLEAR).set(as({ role: 'super_admin', sub: 'u-ali', email: 'ali@colaberry.com' })).send({ confirm: true })).body).toEqual({ cleared: false });
  });
});
