const mockView = jest.fn();
const mockConfirm = jest.fn();
jest.mock('../../services/placement/bookingService', () => ({ bookingView: (...a: unknown[]) => mockView(...a), confirmBooking: (...a: unknown[]) => mockConfirm(...a) }));

import express from 'express';
import request from 'supertest';
import { expectNoRoomUrl, SENTINEL_PROVIDER_URL } from '../../services/placement/__tests__/helpers/noRoomUrl';

/** CP8.2 (kit F4 step 3): the public booking API: validated, uniform 404, plain 410/409, never cached, no room link leak. */
const TOKEN = 'A'.repeat(43);
const URL = `/api/public/booking/${TOKEN}`;
const VIEW = { candidate: 'Ann', company: 'Acme', position: 'Data Analyst', minutes: 30, recordingNotice: 'recorded only if everyone agrees', timezone: 'America/Chicago', reason: null,
  slots: [{ startsAt: '2026-11-23T15:00:00.000Z', central: 'Mon, Nov 23, 9:00 AM CST', local: null }] };
const BOOKED = { status: 'booked', startsAt: '2026-11-23T15:00:00.000Z', minutes: 30, roomPage: 'https://hire.refactored.ai/room/?i=iv-1&e=1&t=x', replay: false };
/** Mounted as server.ts mounts them: the confirm (own 10kb parser) BEFORE the global 5mb JSON parser, the view after. */
function app(): express.Express {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { view, confirm } = (require('../publicBookingRoutes') as typeof import('../publicBookingRoutes')).createBookingRouters();
  const a = express();
  a.use(confirm);
  a.use(express.json({ limit: '5mb' }));
  a.use(view);
  return a;
}
const body = { slot: '2026-11-23T15:00:00.000Z', tz: 'America/New_York', interviewers: ['Pat@Acme.example'] };
beforeEach(() => {
  mockView.mockReset().mockResolvedValue({ status: 'ok', view: VIEW });
  mockConfirm.mockReset().mockResolvedValue(BOOKED);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('GET /api/public/booking/:token', () => {
  it('200 with the page data, never cached, and NO room link anywhere (deep scan)', async () => {
    const res = await request(app()).get(`${URL}?tz=America/New_York`);
    expect([res.status, res.headers['cache-control']]).toEqual([200, 'no-store']);
    expect(res.body.booking.candidate).toBe('Ann');
    expect(mockView).toHaveBeenCalledWith(TOKEN, { tz: 'America/New_York' });
    expectNoRoomUrl(res.body);
    expect(JSON.stringify(res.body)).not.toMatch(/@/); // no learner (or anyone's) email address
  });
  it('a malformed token is the same 404 as an unknown one; a bad tz is 400', async () => {
    mockView.mockResolvedValueOnce({ status: 'not_found' });
    const unknown = await request(app()).get(URL);
    const malformed = await request(app()).get('/api/public/booking/not!a!token');
    expect([unknown.status, malformed.status]).toEqual([404, 404]);
    expect(unknown.body).toEqual(malformed.body);
    expect((await request(app()).get(`${URL}?tz=Mars/Base`)).status).toBe(400);
    expect((await request(app()).get(`${URL}?enrollmentId=x`)).status).toBe(400);
  });
  it('used, expired or closed: 410 with a plain reason; a crash: 500 without detail', async () => {
    for (const reason of ['used', 'expired', 'closed']) {
      mockView.mockResolvedValueOnce({ status: 'gone', reason });
      const res = await request(app()).get(URL);
      expect([res.status, res.body.reason]).toEqual([410, reason]);
      expect(res.body.error).toMatch(/\.$/);
    }
    mockView.mockRejectedValueOnce(new Error('db down'));
    expect((await request(app()).get(URL)).body).toEqual({ error: 'Could not load the booking page. Try again in a moment.' });
  });
  it('a response that somehow carried the provider link would be caught by the scan (the check is live)', () => {
    expect(() => expectNoRoomUrl({ booking: { ...VIEW, slots: [{ note: SENTINEL_PROVIDER_URL }] } })).toThrow();
  });
});

describe('POST /api/public/booking/:token/confirm', () => {
  it('200 booked: the consent-room PAGE link only, never the provider link (deep scan); emails lowercased', async () => {
    const res = await request(app()).post(`${URL}/confirm`).send(body);
    expect([res.status, res.headers['cache-control']]).toEqual([200, 'no-store']);
    expect(res.body).toEqual({ booked: { startsAt: BOOKED.startsAt, minutes: 30, roomPage: BOOKED.roomPage }, replay: false });
    expectNoRoomUrl(res.body);
    expect(mockConfirm).toHaveBeenCalledWith(TOKEN, { slot: body.slot, tz: 'America/New_York', interviewers: ['pat@acme.example'] });
  });
  it('validates the body: no slot, a bad zone, a bad email, six interviewers or an extra field are 400 and nothing is booked', async () => {
    for (const b of [{ tz: 'America/Chicago' }, { ...body, tz: 'Nowhere' }, { ...body, interviewers: ['nope'] },
      { ...body, interviewers: Array.from({ length: 6 }, (_, i) => `p${i}@x.example`) }, { ...body, enrollmentId: 'x' }]) {
      expect((await request(app()).post(`${URL}/confirm`).send(b)).status).toBe(400);
    }
    expect(mockConfirm).not.toHaveBeenCalled();
  });
  it('404 unknown, 410 used/expired/closed, 409 taken or arranging, 500 on a crash', async () => {
    mockConfirm.mockResolvedValueOnce({ status: 'not_found' }).mockResolvedValueOnce({ status: 'gone', reason: 'closed' })
      .mockResolvedValueOnce({ status: 'taken' }).mockResolvedValueOnce({ status: 'arranging' }).mockRejectedValueOnce(new Error('x'));
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await request(app()).post(`${URL}/confirm`).send(body)).status);
    expect(codes).toEqual([404, 410, 409, 409, 500]);
  });
});

describe('limits (per booking link: on this deployment req.ip is the Cloudflare edge)', () => {
  it('5 confirms on link A, then link B from the same IP still works, and A\'s 6th is 429', async () => {
    const a = app();
    for (let i = 0; i < 5; i++) expect((await request(a).post(`${URL}/confirm`).send(body)).status).toBe(200);
    const TOKEN_B = 'B'.repeat(43);
    expect((await request(a).post(`/api/public/booking/${TOKEN_B}/confirm`).send(body)).status).toBe(200);
    expect((await request(a).post(`${URL}/confirm`).send(body)).status).toBe(429);
    expect(mockConfirm.mock.calls.map((c) => c[0])).toEqual([TOKEN, TOKEN, TOKEN, TOKEN, TOKEN, TOKEN_B]);
  });
  it('page reads are per link too: 60 on A, then B still 200 and A 429', async () => {
    const a = app();
    for (let i = 0; i < 60; i++) await request(a).get(URL);
    expect((await request(a).get(`/api/public/booking/${'B'.repeat(43)}`)).status).toBe(200);
    expect((await request(a).get(URL)).status).toBe(429);
  });
  it('the page read: 60 a minute, then 429', async () => {
    const a = app();
    for (let i = 0; i < 60; i++) expect((await request(a).get(URL)).status).toBe(200);
    const res = await request(a).get(URL);
    expect([res.status, res.body.error]).toEqual([429, 'Too many requests. Please try again in a few minutes.']);
  });
  it('the confirm: 5 per 15 minutes, then 429 (and the service is not called)', async () => {
    const a = app();
    for (let i = 0; i < 5; i++) expect((await request(a).post(`${URL}/confirm`).send(body)).status).toBe(200);
    expect((await request(a).post(`${URL}/confirm`).send(body)).status).toBe(429);
    expect(mockConfirm).toHaveBeenCalledTimes(5);
  });
  it('the confirm body is capped at 10kb by its OWN parser, even with the global 5mb parser mounted after it', async () => {
    const big = { ...body, pad: 'x'.repeat(11 * 1024) };
    const res = await request(app()).post(`${URL}/confirm`).set('Content-Type', 'application/json').send(JSON.stringify(big));
    expect([res.status, res.body.error]).toEqual([413, 'Request too large.']);
    expect((await request(app()).post(`${URL}/confirm`).set('Content-Type', 'application/json').send('{"slot": ')).status).toBe(400);
    expect(mockConfirm).not.toHaveBeenCalled();
  });
});
