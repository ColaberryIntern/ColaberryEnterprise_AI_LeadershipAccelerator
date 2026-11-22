jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));
jest.mock('../../../config/env', () => require('../../../__tests__/testSupport/configMocks').envModuleMock({ jwtSecret: 'test-secret' }));
const mockStatus = jest.fn();
jest.mock('../../../services/commsHub/whatsapp/whatsappStatus', () => ({ whatsappStatus: (...a: unknown[]) => mockStatus(...a) }));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import router from '../commsHubWhatsAppRoutes';

/** CH10.1 GET .../whatsapp/status: gated, strict shape, no-store; a leaked field is refused. */
const verify = jwt.verify as unknown as jest.Mock;
const app = express();
app.use(router);
const PATH = '/api/admin/comms-hub/whatsapp/status';
const JACKIE = { role: 'admin', mgmt_role: 'community_organizer', sub: 'u-jackie', email: 'jackie@colaberry.com' };
const as = (who: Record<string, unknown> | null) => { verify.mockReturnValue(who); return who ? { Authorization: 'Bearer t' } : {}; };
const OFF = { configured: false, enabled: false, state: 'not_configured', number_last4: null, reason: 'WhatsApp is switched off for the hub.' };
let errSpy: jest.SpyInstance;
beforeEach(() => { jest.clearAllMocks(); errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => errSpy.mockRestore());

it('answers the status in the declared shape, not cached', async () => {
  mockStatus.mockResolvedValue(OFF);
  const res = await request(app).get(PATH).set(as(JACKIE));
  expect([res.status, res.headers['cache-control']]).toEqual([200, 'no-store']);
  expect(res.body).toEqual(OFF);
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
    expect(b.body).toEqual(OFF);
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
