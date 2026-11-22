/**
 * CP10.3 (kit F8): the employer portal's follow-ups API through the REAL router, guard (requireHireClient) and rules.
 * Two employers in memory; the follow-up store is a stand-in scoped the way followUpStore.ts's SQL scopes it (that SQL
 * runs on Postgres in followUpStore.integration.test.ts).
 */
jest.mock('../../middlewares/authFailureLog', () => ({ logAuthFailure: jest.fn(), describeCaller: () => ({ forwarded_for: null, user_agent: null }) }));
jest.mock('../../services/caseStudy/caseStudySurfaceProfiles', () => ({ getCaseStudySurfaceProfile: () => ({ publicBaseUrl: 'https://hire.refactored.ai' }) }));
const A = 'aaaaaaaa-0000-4000-8000-00000000000a'; const B = 'bbbbbbbb-0000-4000-8000-00000000000b';
const ANN = '11111111-0000-4000-8000-000000000001'; const BOB = '22222222-0000-4000-8000-000000000002';
const OFFER = '55555555-0000-4000-8000-000000000005';
const CAROL = '33333333-0000-4000-8000-000000000003'; // a second candidate of client A
jest.mock('../../services/placement/clientStore', () => ({
  memberById: async (id: string, c: string) => [{ member_id: 'm-a', client_id: A, client_name: 'Acme', email: 'pat@acme.example' },
    { member_id: 'm-b', client_id: B, client_name: 'Globex', email: 'sam@globex.example' }].find((m) => m.member_id === id && m.client_id === c),
  clientCandidate: async (c: string, e: string) => ((c === A && (e === ANN || e === CAROL)) || (c === B && e === BOB) ?{ enrollment_id: e, full_name: 'X', put_forward_at: new Date() } : undefined),
  clientOffers: async (c: string) => (c === A ? [{ id: OFFER, enrollment_id: ANN }] : []),
}));
type Stored = Record<string, unknown> & { id: string; client_id: string };
const mockFus = new Map<string, Stored>();
jest.mock('../../services/placement/followUpStore', () => ({
  insertFollowUp: async (f: Record<string, unknown>) => {
    if (mockFus.has(String(f.id))) return false;
    mockFus.set(String(f.id), { ...f, id: String(f.id), client_id: String(f.clientId), status: 'scheduled', attempts: 0 });
    return true;
  },
  clientFollowUps: async (c: string, id?: string) => [...mockFus.values()].filter((f) => f.client_id === c && (!id || f.id === id)).map((f) => ({
    id: f.id, enrollment_id: f.enrollmentId, full_name: f.enrollmentId === ANN ? 'Ann Lee' : 'Bob Ray', subject: f.subject, template: f.template, send_on: f.sendOn,
    only_if: f.onlyIf, status: f.status, status_reason: f.status_reason ?? null, attempts: f.attempts, sent_at: f.sent_at ?? null, opens: f.opens ?? 0, clicks: f.clicks ?? {},
    replied: f.replied === true, to_email: 'ann@learner.example' })),
  cancelFollowUp: async (c: string, id: string) => {
    const f = mockFus.get(id);
    if (!f || f.client_id !== c || f.status !== 'scheduled') return false;
    f.status = 'cancelled';
    return true;
  },
}));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { createHireClientFollowUpRouter } from '../hireClientFollowUpRoutes';
import { TEXT } from '../../services/placement/followUpRules';

let portalOn = true; let mailOn = false;
const app = express();
app.use(express.json());
app.use(createHireClientFollowUpRouter({ portalRead: async () => portalOn, read: async () => mailOn }));
const as = (mid: string, cid: string) => `Bearer ${jwt.sign({ kind: 'hire_client_session', mid, cid }, env.jwtSecret, { audience: 'hire-client', expiresIn: 600 })}`;
const PAT = as('m-a', A); const SAM = as('m-b', B);
const KEY = '99999999-0000-4000-8000-000000000009';
const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString();
const body = (over: Record<string, unknown> = {}) => ({ id: KEY, enrollmentId: ANN, template: 'offer_reminder', subject: 'Checking in on our offer',
  body: 'Hi {first},\n\nJust checking in on our offer.\n\nAcme', sendOn: inAnHour(), onlyIf: 'no_reply', ...over });
const schedule = (b: Record<string, unknown>, who = PAT) => request(app).post('/api/hire/client/follow-ups').set('Authorization', who).send(b);

beforeEach(() => { portalOn = true; mailOn = false; mockFus.clear(); jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => jest.restoreAllMocks());

describe('the guard', () => {
  it('no session, or the portal switched off: 401 and nothing stored', async () => {
    expect((await request(app).get('/api/hire/client/follow-ups')).status).toBe(401);
    portalOn = false;
    expect((await schedule(body())).status).toBe(401);
    expect(mockFus.size).toBe(0);
  });
});

describe('scheduling', () => {
  it('201 with the row; the same id again is a replay (200), stored once; never cached', async () => {
    const r1 = await schedule(body());
    expect(r1.status).toBe(201);
    expect(r1.headers['cache-control']).toBe('no-store');
    expect(r1.body).toMatchObject({ replay: false, mailOn: false, followUp: { id: KEY, candidateName: 'Ann Lee', status: 'scheduled', onlyIf: 'no_reply', clicks: { link: 0, other: 0 } } });
    const r2 = await schedule(body({ subject: 'Changed' }));
    expect([r2.status, r2.body.replay, r2.body.followUp.subject]).toEqual([200, true, 'Checking in on our offer']);
    expect(mockFus.size).toBe(1);
    expect(mockFus.get(KEY)).toMatchObject({ clientId: A, memberId: 'm-a', createdBy: 'hire_client_member:m-a' });
  });
  it('an em dash in the message: 400 with the clear message; nothing stored', async () => {
    const r = await schedule(body({ body: `Hi {first} ${String.fromCharCode(0x2014)} checking in` }));
    expect([r.status, r.body.error]).toEqual([400, TEXT.dashBody]);
    expect(mockFus.size).toBe(0);
  });
  it('two links, or an attachment: 400', async () => {
    expect((await schedule(body({ body: 'https://a.example and https://b.example' }))).body.error).toBe(TEXT.oneLink);
    const r = await schedule({ ...body(), attachments: [{ filename: 'x.pdf' }] });
    expect([r.status, r.body.error]).toEqual([400, 'Attachments and other extras cannot be sent with a follow-up.']);
  });
  it('the send time: required unless sending now; not both; not in the past', async () => {
    expect((await schedule(body({ sendOn: null }))).body.error).toBe('Pick a send time, or send it now.');
    expect((await schedule(body({ sendNow: true }))).body.error).toBe('Pick a send time, or send it now, not both.');
    expect((await schedule(body({ sendOn: new Date(Date.now() - 3_600_000).toISOString() }))).body.error).toBe(TEXT.past);
    const now = await schedule(body({ sendOn: undefined, sendNow: true }));
    expect(now.status).toBe(201);
    expect(Math.abs(new Date(now.body.followUp.sendOn).getTime() - Date.now())).toBeLessThan(10_000);
  });
  it('a candidate not put forward to this client, or an offer that is not theirs: 404', async () => {
    expect((await schedule(body({ enrollmentId: BOB }))).status).toBe(404);
    expect((await schedule(body({ offerId: OFFER }))).status).toBe(201);
    // Client A's own offer, but to another of its candidates: not this candidate's offer.
    expect((await schedule(body({ id: '99999999-0000-4000-8000-00000000000c', enrollmentId: CAROL, offerId: OFFER }))).status).toBe(404);
    expect((await schedule(body({ id: '99999999-0000-4000-8000-00000000000b', enrollmentId: BOB, offerId: OFFER }), SAM)).status).toBe(404);
  });
  it('an id another client already used finds nothing in this client\'s scope: 404, and their row is untouched', async () => {
    await schedule(body());
    const r = await schedule(body({ enrollmentId: BOB }), SAM);
    expect(r.status).toBe(404);
    expect(mockFus.get(KEY)?.client_id).toBe(A);
  });
});

describe('the list and cancel', () => {
  it('each client sees only its own; mailOn says whether email is switched on; no candidate address in the answer', async () => {
    await schedule(body());
    mailOn = true;
    const a = await request(app).get('/api/hire/client/follow-ups').set('Authorization', PAT);
    expect([a.status, a.body.followUps.length, a.body.mailOn]).toEqual([200, 1, true]);
    expect(JSON.stringify(a.body)).not.toMatch(/learner\.example/);
    const b = await request(app).get('/api/hire/client/follow-ups').set('Authorization', SAM);
    expect(b.body.followUps).toEqual([]);
  });
  it('shows Replied once the candidate answered after it went, and the opens and clicks', async () => {
    await schedule(body());
    Object.assign(mockFus.get(KEY) as Stored, { status: 'clicked', sent_at: new Date(), replied: true, opens: 2, clicks: { link: 1 } });
    const r = await request(app).get('/api/hire/client/follow-ups').set('Authorization', PAT);
    expect(r.body.followUps[0]).toMatchObject({ status: 'replied', opens: 2, clicks: { link: 1, other: 0 } });
  });
  it('cancel: 200 while scheduled, 409 once it is not, 404 for another client\'s', async () => {
    await schedule(body());
    expect((await request(app).post(`/api/hire/client/follow-ups/${KEY}/cancel`).set('Authorization', SAM)).status).toBe(404);
    expect((await request(app).post(`/api/hire/client/follow-ups/${KEY}/cancel`).set('Authorization', PAT)).status).toBe(200);
    const again = await request(app).post(`/api/hire/client/follow-ups/${KEY}/cancel`).set('Authorization', PAT);
    expect([again.status, again.body.error]).toEqual([409, 'This follow-up is no longer waiting to go, so it cannot be cancelled.']);
    expect((await request(app).post('/api/hire/client/follow-ups/nope/cancel').set('Authorization', PAT)).status).toBe(404);
  });
});
