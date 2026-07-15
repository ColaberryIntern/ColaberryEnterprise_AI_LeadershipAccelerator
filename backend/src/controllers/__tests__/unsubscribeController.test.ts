/**
 * Integration tests for the public one-click unsubscribe endpoint.
 * Mocks the models module + processOptOut; uses a real signed token so the
 * controller's verification runs for real. Covers happy path, idempotency,
 * invalid token, unknown lead, malformed query, one-click POST, and DB failure.
 */
import express from 'express';
import request from 'supertest';
import { signUnsubscribe } from '../../services/unsubscribeTokenService';

const findByPk = jest.fn();
const processOptOut = jest.fn().mockResolvedValue({ cancelled: 0 });

jest.mock('../../models', () => ({ Lead: { findByPk: (...a: any[]) => findByPk(...a) } }));
jest.mock('../../services/unsubscribeEnforcementService', () => ({
  processOptOut: (...a: any[]) => processOptOut(...a),
}));

const LEAD_ID = 5271;
const EMAIL = 'haithamnori@gmail.com';
const validSig = signUnsubscribe(LEAD_ID, EMAIL);

const buildApp = async () => {
  const app = express();
  const routerModule = await import('../../routes/unsubscribeRoutes');
  app.use(routerModule.default);
  return app;
};

beforeEach(() => {
  findByPk.mockReset();
  processOptOut.mockReset();
  processOptOut.mockResolvedValue({ cancelled: 0 });
});

describe('GET /api/unsubscribe', () => {
  it('opts out an active lead with a valid token (happy path)', async () => {
    findByPk.mockResolvedValue({ id: LEAD_ID, email: EMAIL, status: 'new' });
    const app = await buildApp();
    const res = await request(app).get(`/api/unsubscribe?lid=${LEAD_ID}&sig=${validSig}`);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/unsubscribed/i);
    expect(processOptOut).toHaveBeenCalledTimes(1);
    expect(processOptOut).toHaveBeenCalledWith(LEAD_ID, 'email', expect.any(String), 'unsub_link');
  });

  it('is idempotent: already-unsubscribed lead succeeds without a new opt-out', async () => {
    findByPk.mockResolvedValue({ id: LEAD_ID, email: EMAIL, status: 'unsubscribed' });
    const app = await buildApp();
    const res = await request(app).get(`/api/unsubscribe?lid=${LEAD_ID}&sig=${validSig}`);
    expect(res.status).toBe(200);
    expect(processOptOut).not.toHaveBeenCalled();
  });

  it('rejects an invalid signature (no opt-out)', async () => {
    findByPk.mockResolvedValue({ id: LEAD_ID, email: EMAIL, status: 'new' });
    const app = await buildApp();
    const res = await request(app).get(`/api/unsubscribe?lid=${LEAD_ID}&sig=${'0'.repeat(64)}`);
    expect(res.status).toBe(400);
    expect(processOptOut).not.toHaveBeenCalled();
  });

  it('rejects a malformed query (missing sig)', async () => {
    const app = await buildApp();
    const res = await request(app).get(`/api/unsubscribe?lid=${LEAD_ID}`);
    expect(res.status).toBe(400);
    expect(findByPk).not.toHaveBeenCalled();
  });

  it('treats an unknown lead as an invalid link (no opt-out)', async () => {
    findByPk.mockResolvedValue(null);
    const app = await buildApp();
    const res = await request(app).get(`/api/unsubscribe?lid=999999&sig=${validSig}`);
    expect(res.status).toBe(400);
    expect(processOptOut).not.toHaveBeenCalled();
  });

  it('returns 503 when the lookup fails (no false success)', async () => {
    findByPk.mockRejectedValue(new Error('db down'));
    const app = await buildApp();
    const res = await request(app).get(`/api/unsubscribe?lid=${LEAD_ID}&sig=${validSig}`);
    expect(res.status).toBe(503);
    expect(processOptOut).not.toHaveBeenCalled();
  });
});

describe('POST /api/unsubscribe (RFC 8058 one-click)', () => {
  it('opts out on a valid one-click POST', async () => {
    findByPk.mockResolvedValue({ id: LEAD_ID, email: EMAIL, status: 'new' });
    const app = await buildApp();
    const res = await request(app)
      .post(`/api/unsubscribe?lid=${LEAD_ID}&sig=${validSig}`)
      .type('form')
      .send('List-Unsubscribe=One-Click');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'unsubscribed' });
    expect(processOptOut).toHaveBeenCalledTimes(1);
  });

  it('rejects a one-click POST with a bad token', async () => {
    findByPk.mockResolvedValue({ id: LEAD_ID, email: EMAIL, status: 'new' });
    const app = await buildApp();
    const res = await request(app)
      .post(`/api/unsubscribe?lid=${LEAD_ID}&sig=${'0'.repeat(64)}`)
      .type('form')
      .send('List-Unsubscribe=One-Click');
    expect(res.status).toBe(400);
    expect(processOptOut).not.toHaveBeenCalled();
  });
});
