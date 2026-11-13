/**
 * The two booking routes over real Express (profile upgrade §4.2): open times are never cached,
 * a form post is a 303 to a FIXED address, and nothing internal or contact-shaped leaks.
 */
jest.mock('../../services/hire/hireTalentDirectory', () => ({ getHireTalentDirectory: jest.fn() }));
jest.mock('../../services/hire/hireIntro', () => ({ requestHireIntro: jest.fn() }));
jest.mock('../../services/hire/hireInterviews', () => ({ talentSlots: jest.fn(), requestInterview: jest.fn() }));
jest.mock('../../services/hire/hireInterviewAccept', () => ({ readProposal: jest.fn(), acceptProposedTime: jest.fn() }));
jest.mock('../../services/hire/hireInterviewNotify', () => ({
  inBackground: jest.fn(), notifyInterviewRequested: jest.fn(), notifyInterviewConfirmed: jest.fn(),
}));

import express from 'express';
import request from 'supertest';
import { createHireRouter } from '../publicHireTalentRoutes';
import { requestInterview, talentSlots } from '../../services/hire/hireInterviews';
import { acceptProposedTime, readProposal } from '../../services/hire/hireInterviewAccept';
import { inBackground } from '../../services/hire/hireInterviewNotify';

const slots = talentSlots as unknown as jest.Mock;
const req = requestInterview as unknown as jest.Mock;

function app() {
  const a = express();
  a.use(express.json());
  a.use(createHireRouter());
  return a;
}
const CREATED = { status: 'created', http: 201, id: 'int-1', confirmed: false, startsAt: '2026-11-16T15:00:00.000Z', minutes: 20, format: 'intro' };
const bg = inBackground as unknown as jest.Mock;

beforeEach(() => {
  slots.mockReset().mockResolvedValue({ status: 'ok', body: { tz: 'America/Chicago', format: 'intro', minutes: 20, formats: [], slots: [] } });
  req.mockReset().mockResolvedValue(CREATED);
});
afterEach(() => jest.restoreAllMocks());

describe('GET /api/public/hire/talent/:slug/slots', () => {
  it('serves open times with no-store, passing the query through', async () => {
    const res = await request(app()).get('/api/public/hire/talent/ann-lee/slots').query({ tz: 'America/New_York' });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({ ok: true, format: 'intro' });
    expect(slots).toHaveBeenCalledWith('ann-lee', { tz: 'America/New_York' });
  });

  it('is a 404 for an unknown person or a malformed slug, and 400 for a bad query', async () => {
    slots.mockResolvedValueOnce({ status: 'not_found' });
    expect((await request(app()).get('/api/public/hire/talent/nobody/slots')).status).toBe(404);
    expect((await request(app()).get('/api/public/hire/talent/-bad/slots')).status).toBe(404);
    slots.mockResolvedValueOnce({ status: 'invalid', error: 'tz' });
    expect((await request(app()).get('/api/public/hire/talent/ann-lee/slots').query({ tz: 'x' })).status).toBe(400);
  });

  it('answers 500 with a fixed message when the read fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    slots.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    const res = await request(app()).get('/api/public/hire/talent/ann-lee/slots');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Unable to load times' });
  });
});

describe('POST /api/public/hire/interviews', () => {
  const body = { talentSlug: 'ann-lee', format: 'intro', startsAt: '2026-11-16T15:00:00Z', name: 'Jane', email: 'jane@acme.com', company: 'Acme', role: 'CTO' };

  it('answers a JSON caller with the status and the slot, never an address', async () => {
    const res = await request(app()).post('/api/public/hire/interviews').send(body);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true, status: 'created', confirmed: false, startsAt: CREATED.startsAt, minutes: 20, format: 'intro' });
    expect(JSON.stringify(res.body)).not.toMatch(/@|int-1/);
  });

  it('notifies once for a new booking, and not for a duplicate', async () => {
    bg.mockClear();
    await request(app()).post('/api/public/hire/interviews').send(body);
    expect(bg).toHaveBeenCalledTimes(1);
    expect(bg.mock.calls[0].slice(0, 2)).toEqual(['requested', 'int-1']);
    req.mockResolvedValueOnce({ ...CREATED, status: 'duplicate', http: 200 });
    await request(app()).post('/api/public/hire/interviews').send(body);
    expect(bg).toHaveBeenCalledTimes(1);
  });

  it('maps unavailable to 409, not_found to 404 and invalid to 400', async () => {
    req.mockResolvedValueOnce({ status: 'unavailable', http: 409 });
    expect((await request(app()).post('/api/public/hire/interviews').send(body)).status).toBe(409);
    req.mockResolvedValueOnce({ status: 'not_found', http: 404 });
    expect((await request(app()).post('/api/public/hire/interviews').send(body)).status).toBe(404);
    req.mockResolvedValueOnce({ status: 'invalid', http: 400, error: 'email' });
    expect((await request(app()).post('/api/public/hire/interviews').send(body)).status).toBe(400);
  });

  it('answers a no-JS form post with a 303 to the schedule page on the fixed hire host', async () => {
    const res = await request(app()).post('/api/public/hire/interviews').type('form')
      .set('Host', 'evil.example').send({ ...body, record: 'on' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('https://hire.refactored.ai/talent/ann-lee/schedule/?sent=1');
    expect(req.mock.calls[0][0]).toMatchObject({ talentSlug: 'ann-lee', record: 'on' });
  });

  it('never redirects anywhere a crafted slug points', async () => {
    req.mockResolvedValueOnce({ status: 'invalid', http: 400, error: 'talentSlug' });
    const res = await request(app()).post('/api/public/hire/interviews').type('form').send({ ...body, talentSlug: '//evil.example' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('https://hire.refactored.ai/');
  });

  it('a failed form post still lands back on the schedule page, with an error flag', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    req.mockRejectedValueOnce(new Error('deadlock detected'));
    const res = await request(app()).post('/api/public/hire/interviews').type('form').send(body);
    expect(res.headers.location).toBe('https://hire.refactored.ai/talent/ann-lee/schedule/?error=failed');
  });
});

describe('a suggested time: GET .../proposal and POST .../accept', () => {
  const VIEW = { talentSlug: 'ann-lee', startsAt: '2026-11-18T16:30:00.000Z', minutes: 20, format: 'intro' };
  const read = readProposal as unknown as jest.Mock;
  const accept = acceptProposedTime as unknown as jest.Mock;
  const url = '/api/public/hire/interviews/abc';

  it('previews with no-store, passing the token from the query, and notifies nobody', async () => {
    bg.mockClear();
    read.mockResolvedValueOnce({ status: 'open', http: 200, ...VIEW });
    const res = await request(app()).get(`${url}/proposal`).query({ t: 'tok' });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({ ok: true, status: 'open', ...VIEW });
    expect(read).toHaveBeenCalledWith('abc', 'tok');
    expect(bg).not.toHaveBeenCalled();
  });

  it('accepts on the POST with the token from the body, then sends the invite once', async () => {
    bg.mockClear();
    accept.mockResolvedValueOnce({ status: 'confirmed', http: 200, ...VIEW });
    const res = await request(app()).post(`${url}/accept`).send({ t: 'tok' });
    expect(res.body.status).toBe('confirmed');
    expect(accept).toHaveBeenCalledWith('abc', 'tok');
    expect(bg.mock.calls[0].slice(0, 2)).toEqual(['confirmed', 'abc']);
    accept.mockResolvedValueOnce({ status: 'already', http: 200, ...VIEW });
    await request(app()).post(`${url}/accept`).send({ t: 'tok' });
    expect(bg).toHaveBeenCalledTimes(1);
  });

  it('is 404 for a bad link and 409 for a time no longer on offer', async () => {
    accept.mockResolvedValueOnce({ status: 'invalid', http: 404 });
    expect((await request(app()).post(`${url}/accept`).send({ t: 'x' })).status).toBe(404);
    read.mockResolvedValueOnce({ status: 'gone', http: 409 });
    expect((await request(app()).get(`${url}/proposal`).query({ t: 'x' })).status).toBe(409);
  });
});
