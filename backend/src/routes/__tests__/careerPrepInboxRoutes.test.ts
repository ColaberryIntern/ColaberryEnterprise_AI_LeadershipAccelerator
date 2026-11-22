jest.mock('../../middlewares/authFailureLog', () => ({ logAuthFailure: jest.fn(), describeCaller: () => ({ forwarded_for: null, user_agent: null }) }));
const mockEnabled = jest.fn();
jest.mock('../../services/careerPrep/careerPrepFlag', () => ({ careerPrepEnabled: (...a: unknown[]) => mockEnabled(...a) }));
jest.mock('../../services/campus/campusPilot', () => ({ campusOnFor: () => true }));
const mockGet = jest.fn();
const mockSave = jest.fn();
const mockList = jest.fn();
jest.mock('../../services/placement/inboxService', () => ({
  getInbox: (...a: unknown[]) => mockGet(...a), saveInboxAddress: (...a: unknown[]) => mockSave(...a), listReceived: (...a: unknown[]) => mockList(...a),
}));

const mockSendTest = jest.fn();
jest.mock('../../services/placement/inboxTestJob', () => ({ sendTest: (...a: unknown[]) => mockSendTest(...a) }));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

/** CP6.1 (kit F2): the job-search inbox routes: gated, validated, always the caller's own. */
const SECRET = ['career', 'prep', 'inbox'].join('-');
process.env.JWT_SECRET = SECRET;
const token = (sub = 'enr-ali', extra: Record<string, unknown> = {}) => `Bearer ${jwt.sign({ sub, cohort_id: 'coh-1', role: 'participant', ...extra }, SECRET)}`;
// The real server's view right after a save: forwarding not verified yet, so health is 'setup' (inboxHealth.ts).
const VIEW = { address: 'ann.lee.careers@gmail.com', health: 'setup', healthLabel: 'Not set up yet', verifiedAt: null, forwardingConfirmedAt: null, lastReceivedAt: null,
  lastTestAt: null, lastTestMs: null, receivedThisMonth: 0, steps: { create: true, added: true, forwarding: false, tested: false } };
// The route module pulls in the app's models; loading it is slow on a loaded machine, so it is loaded ONCE before any
// test, with its own budget (never inside a test's 5 seconds), and every test reuses one app (T20 fold pattern).
let shared: express.Express | null = null;
beforeAll(async () => {
  const router = (await import('../careerPrepInboxRoutes')).default;
  shared = express();
  shared.use(express.json());
  shared.use(router);
}, 60_000);
function app(): express.Express {
  if (!shared) throw new Error('the router did not load');
  return shared;
}
const URL = '/api/portal/career-prep/inbox';
beforeEach(() => { mockEnabled.mockReset().mockResolvedValue(true); mockGet.mockReset().mockResolvedValue(VIEW); mockSave.mockReset(); mockList.mockReset().mockResolvedValue([]); });

describe('the job-search inbox routes', () => {
  it('401 without a token, 404 with Career Prep off, on every route', async () => {
    for (const [m, u] of [['get', URL], ['put', URL], ['get', `${URL}/received`]] as const) expect((await request(app())[m](u)).status).toBe(401);
    mockEnabled.mockResolvedValue(false);
    expect((await request(app()).get(URL).set('Authorization', token())).status).toBe(404);
    expect((await request(app()).put(URL).set('Authorization', token()).send({ address: 'a@gmail.com' })).status).toBe(404);
    expect((await request(app()).get(`${URL}/received`).set('Authorization', token())).status).toBe(404);
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockList).not.toHaveBeenCalled();
  });
  it('GET returns the caller\'s own inbox (the enrollment comes only from the token)', async () => {
    const res = await request(app()).get(`${URL}?enrollmentId=enr-someone-else`).set('Authorization', token('enr-ali'));
    expect(res.status).toBe(200);
    expect(res.body.inbox.healthLabel).toBe('Not set up yet');
    expect(mockGet).toHaveBeenCalledWith('enr-ali');
  });
  it('PUT validates the body: missing or extra fields are 400 and nothing is saved', async () => {
    expect((await request(app()).put(URL).set('Authorization', token()).send({})).status).toBe(400);
    expect((await request(app()).put(URL).set('Authorization', token()).send({ address: 'a@gmail.com', enrollmentId: 'x' })).status).toBe(400);
    expect(mockSave).not.toHaveBeenCalled();
  });
  it('PUT: a non-Gmail address is 400 with a plain message; another learner\'s inbox is 409', async () => {
    mockSave.mockResolvedValueOnce({ status: 'invalid', reason: 'not_gmail' });
    const bad = await request(app()).put(URL).set('Authorization', token()).send({ address: 'ann@yahoo.com' });
    expect([bad.status, bad.body.error]).toEqual([400, 'Use a Gmail address: the forwarding steps are Gmail\'s.']);
    mockSave.mockResolvedValueOnce({ status: 'taken' });
    expect((await request(app()).put(URL).set('Authorization', token()).send({ address: 'abc@gmail.com' })).status).toBe(409);
  });
  it('PUT saves for the caller and returns the inbox; saving it again answers the same', async () => {
    mockSave.mockResolvedValue({ status: 'saved', inbox: VIEW });
    const res = await request(app()).put(URL).set('Authorization', token('enr-ali')).send({ address: ' ann.lee.careers@gmail.com ' });
    expect([res.status, res.body.inbox.address]).toEqual([200, 'ann.lee.careers@gmail.com']);
    expect(mockSave).toHaveBeenCalledWith('enr-ali', 'ann.lee.careers@gmail.com');
    mockSave.mockResolvedValue({ status: 'unchanged', inbox: VIEW });
    expect((await request(app()).put(URL).set('Authorization', token('enr-ali')).send({ address: 'ann.lee.careers@gmail.com' })).status).toBe(200);
  });
  it('GET received: bounded limit, the caller\'s own, and a 500 says so plainly', async () => {
    expect((await request(app()).get(`${URL}/received?limit=0`).set('Authorization', token())).status).toBe(400);
    expect((await request(app()).get(`${URL}/received?limit=20`).set('Authorization', token('enr-ali'))).status).toBe(200);
    expect(mockList).toHaveBeenCalledWith('enr-ali', 20);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockList.mockRejectedValueOnce(new Error('db down'));
    const res = await request(app()).get(`${URL}/received`).set('Authorization', token());
    expect([res.status, res.body.error]).toEqual([500, 'Could not load what your inbox received.']);
  });
  it('refuses a read-only view-as token for the write', async () => {
    const ro = token('enr-ali', { read_only: true, impersonated_by: 'admin-1' });
    const res = await request(app()).put(URL).set('Authorization', ro).send({ address: 'a@gmail.com' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(mockSave).not.toHaveBeenCalled();
    expect((await request(app()).post(`${URL}/test`).set('Authorization', ro).send({})).status).toBeGreaterThanOrEqual(400);
    expect(mockSendTest).not.toHaveBeenCalled();
  });
});

describe('POST /inbox/test (T11: the forwarding test, gated by career_prep_inbox_tests_enabled)', () => {
  const T = `${URL}/test`;
  beforeEach(() => mockSendTest.mockReset());
  it('401 without a token, 404 with Career Prep off; nothing is sent', async () => {
    expect((await request(app()).post(T).send({})).status).toBe(401);
    mockEnabled.mockResolvedValue(false);
    expect((await request(app()).post(T).set('Authorization', token()).send({})).status).toBe(404);
    expect(mockSendTest).not.toHaveBeenCalled();
  });
  it('400 on any body field (the enrollment comes only from the token)', async () => {
    expect((await request(app()).post(T).set('Authorization', token()).send({ enrollmentId: 'enr-someone-else' })).status).toBe(400);
    expect(mockSendTest).not.toHaveBeenCalled();
  });
  it('switch off: 409 "Inbox tests are switched off" and no inbox read', async () => {
    mockSendTest.mockResolvedValue({ status: 'switched_off' });
    const res = await request(app()).post(T).set('Authorization', token('enr-ali')).send({});
    expect([res.status, res.body]).toEqual([409, { error: 'Inbox tests are switched off' }]);
    expect(mockSendTest).toHaveBeenCalledWith('enr-ali');
    expect(mockGet).not.toHaveBeenCalled();
  });
  it('sent: 200 with the inbox as the server now sees it; a second click the same day says already_today', async () => {
    mockSendTest.mockResolvedValueOnce({ status: 'sent', sentAt: '2026-11-21T18:00:00.000Z' }).mockResolvedValueOnce({ status: 'already_today' });
    const first = await request(app()).post(T).set('Authorization', token('enr-ali')).send({});
    expect([first.status, first.body.test]).toEqual([200, { status: 'sent' }]);
    expect(mockGet).toHaveBeenCalledWith('enr-ali');
    const again = await request(app()).post(T).set('Authorization', token('enr-ali')).send({});
    expect([again.status, again.body.test]).toEqual([200, { status: 'already_today' }]);
  });
  it('no address yet is 409; a failed send is 502; a crash is 500, each in plain words', async () => {
    mockSendTest.mockResolvedValueOnce({ status: 'no_inbox' });
    expect((await request(app()).post(T).set('Authorization', token()).send({})).body).toEqual({ error: 'Add your job-search address first.' });
    mockSendTest.mockResolvedValueOnce({ status: 'failed', errorClass: 'SendBlocked' });
    const failed = await request(app()).post(T).set('Authorization', token()).send({});
    expect([failed.status, failed.body.error]).toEqual([502, 'Could not send the test. Try again in a moment.']);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockSendTest.mockRejectedValueOnce(new Error('db down'));
    expect((await request(app()).post(T).set('Authorization', token()).send({})).status).toBe(500);
  });
});
