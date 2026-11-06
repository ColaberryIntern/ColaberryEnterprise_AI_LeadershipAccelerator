/**
 * The hire routes over real Express: what an unauthenticated caller can and cannot get.
 * The services are mocked at their module boundary; their own suites test them.
 */
jest.mock('../../services/hire/hireTalentDirectory', () => ({ getHireTalentDirectory: jest.fn() }));
jest.mock('../../services/hire/hireIntro', () => ({ requestHireIntro: jest.fn() }));

import express from 'express';
import request from 'supertest';
import { createHireRouter } from '../publicHireTalentRoutes';
import { getHireTalentDirectory } from '../../services/hire/hireTalentDirectory';
import { requestHireIntro } from '../../services/hire/hireIntro';

const mockDirectory = getHireTalentDirectory as unknown as jest.Mock;
const mockIntro = requestHireIntro as unknown as jest.Mock;

function app() {
  const a = express();
  a.use(express.json());
  a.use(createHireRouter()); // a fresh rate-limit store per app
  return a;
}

beforeEach(() => {
  mockDirectory.mockReset().mockResolvedValue({ ok: true, totals: { listed: 0 }, talent: [] });
  mockIntro.mockReset().mockResolvedValue({ status: 'created', http: 201 });
});

describe('GET /api/public/hire/talent', () => {
  it('serves the directory with the two-minute public cache that makes it "always live"', async () => {
    const res = await request(app()).get('/api/public/hire/talent').query({ track: 'fde' });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=120');
    expect(mockDirectory).toHaveBeenCalledWith({ track: 'fde' });
  });

  it('answers 400 for an unknown track or an oversized q, and never reaches the service', async () => {
    expect((await request(app()).get('/api/public/hire/talent').query({ track: 'wizard' })).status).toBe(400);
    expect((await request(app()).get('/api/public/hire/talent').query({ q: 'x'.repeat(500) })).status).toBe(400);
    expect(mockDirectory).not.toHaveBeenCalled();
  });

  it('answers 500 with a fixed message when the database fails - nothing internal leaks', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockDirectory.mockRejectedValue(new Error('password authentication failed for user "postgres"'));
    const res = await request(app()).get('/api/public/hire/talent');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Unable to load talent' });
    expect(JSON.parse(String(err.mock.calls[0][0])).event).toBe('public_hire_talent_read_failed');
    err.mockRestore();
  });
});

describe('POST /api/public/hire/intro', () => {
  const body = { talentSlug: 'ann-lee', name: 'Jane', email: 'jane@acme.com', company: 'Acme', role: 'FDE', message: '' };

  it('answers a JSON caller with a status and nothing else', async () => {
    const res = await request(app()).post('/api/public/hire/intro').send(body);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true, status: 'created' });
  });

  it('maps duplicate to 200, invalid to 400, not_found to 404 and failed to 502', async () => {
    mockIntro.mockResolvedValueOnce({ status: 'duplicate', http: 200 });
    expect((await request(app()).post('/api/public/hire/intro').send(body)).status).toBe(200);
    mockIntro.mockResolvedValueOnce({ status: 'invalid', http: 400, error: 'email' });
    expect((await request(app()).post('/api/public/hire/intro').send(body)).status).toBe(400);
    mockIntro.mockResolvedValueOnce({ status: 'not_found', http: 404 });
    const nf = await request(app()).post('/api/public/hire/intro').send(body);
    expect(nf.status).toBe(404);
    expect(nf.body).toEqual({ error: 'Not found' });
    mockIntro.mockResolvedValueOnce({ status: 'failed', http: 502 });
    expect((await request(app()).post('/api/public/hire/intro').send(body)).status).toBe(502);
  });

  it('answers a no-JS form post with a 303 to the FIXED hire address, never one from the request', async () => {
    const res = await request(app()).post('/api/public/hire/intro').type('form')
      .send({ ...body, redirect: 'https://evil.example' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('https://hire.refactored.ai/intro/?sent=1&talent=ann-lee');
    mockIntro.mockResolvedValueOnce({ status: 'invalid', http: 400, error: 'x' });
    const bad = await request(app()).post('/api/public/hire/intro').type('form').send({ ...body, talentSlug: '<x>' });
    expect(bad.headers.location).toBe('https://hire.refactored.ai/intro/?error=1&talent=');
  });

  it('trips the per-IP rate limit after five requests', async () => {
    const a = app();
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      expect((await request(a).post('/api/public/hire/intro').send(body)).status).toBe(201);
    }
    expect((await request(a).post('/api/public/hire/intro').send(body)).status).toBe(429);
  });
});
