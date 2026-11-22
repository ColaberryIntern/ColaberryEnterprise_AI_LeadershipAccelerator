// Two employers in memory, scoped the way clientStore.ts's SQL scopes them (that SQL runs on Postgres in
// clientStore.integration.test.ts). Rows carry the sentinel provider URL, as the database row would, to prove that no
// answer ever passes it on.
jest.mock('../../middlewares/authFailureLog', () => ({ logAuthFailure: jest.fn(), describeCaller: () => ({ forwarded_for: null, user_agent: null }) }));
jest.mock('../../services/caseStudy/caseStudySurfaceProfiles', () => ({ getCaseStudySurfaceProfile: () => ({ publicBaseUrl: 'https://hire.refactored.ai' }) }));
const A = 'aaaaaaaa-0000-4000-8000-00000000000a'; const B = 'bbbbbbbb-0000-4000-8000-00000000000b';
const ANN = '11111111-0000-4000-8000-000000000001'; const BOB = '22222222-0000-4000-8000-000000000002';
const IV = '33333333-0000-4000-8000-000000000003';
const mockDb = {
  members: [{ member_id: 'm-a', client_id: A, client_name: 'Acme', email: 'pat@acme.example' }, { member_id: 'm-b', client_id: B, client_name: 'Globex', email: 'sam@globex.example' }],
  candidates: [{ client_id: A, enrollment_id: ANN, full_name: 'Ann Lee', put_forward_at: new Date('2026-11-20T15:00:00Z') },
    { client_id: B, enrollment_id: BOB, full_name: 'Bob Ray', put_forward_at: new Date('2026-11-20T15:00:00Z') }],
  interviews: [] as Array<Record<string, unknown>>,
  tokens: [] as string[],
  offers: [] as Array<Record<string, unknown>>,
};
jest.mock('../../services/placement/clientStore', () => ({
  memberById: async (id: string, c: string) => mockDb.members.find((m) => m.member_id === id && m.client_id === c),
  clientCandidates: async (c: string) => mockDb.candidates.filter((x) => x.client_id === c),
  clientCandidate: async (c: string, e: string) => mockDb.candidates.find((x) => x.client_id === c && x.enrollment_id === e),
  clientInterviews: async (c: string, id?: string) => mockDb.interviews.filter((x) => x.client_id === c && (!id || x.id === id)),
  clientOffers: async (c: string) => mockDb.offers.filter((x) => x.client_id === c),
  membershipsFor: async (email: string) => mockDb.members.filter((m) => m.email === email),
  reserveSigninToken: async (email: string) => { mockDb.tokens.push(email); return String(mockDb.tokens.length); },
}));
// The sign-in mail: a send the test controls (it hangs until released), so the 202 can be timed against it.
const mockMail = { send: jest.fn() };
jest.mock('../../services/emailService', () => ({ guardedSendMail: (...a: unknown[]) => mockMail.send(...a), resolveEmailRecipient: async (to: string, subject: string) => ({ to, subject }) }));
jest.mock('../../services/email/idempotentSend', () => ({ sendOnce: async (_id: unknown, send: () => Promise<{ ok: boolean }>) => ((await send()).ok ? { outcome: 'sent' } : { outcome: 'failed', errorClass: 'X' }) }));
const mockCreate = jest.fn();
jest.mock('../../services/placement/offerService', () => ({ createOffer: (...a: unknown[]) => mockCreate(...a), feeRate: async () => 1.1 }));
// The card facts (clientCards.ts, tested on its own): records which ids the route asked about, so a test can prove it
// only ever asks about the signed-in client's own candidates.
const mockCards = { asked: [] as string[][], unavailable: false, xss: false };
jest.mock('../../services/placement/clientCards', () => ({
  loadCardFacts: async (ids: string[]) => {
    mockCards.asked.push(ids);
    const facts = new Map(ids.map((id) => [id, id.startsWith('1111') ? { readiness: 72, profile: mockCards.unavailable ? null : {
      url: mockCards.xss ? 'javascript:alert(1)//talent/x/' : 'https://hire.refactored.ai/talent/ann-lee/', role: 'AI Solutions Analyst',
      verifiedProjects: ['Freight ETA forecasting'], verifiedCount: 1 } } : { readiness: null, profile: null }]));
    return { facts, profilesUnavailable: mockCards.unavailable };
  },
}));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { createHireClientRouter, MakeOfferBody } from '../hireClientRoutes';
import { REQUEST_LINK_RESPONSE } from '../../services/placement/clientAuth';
import { expectNoRoomUrl, SENTINEL_PROVIDER_URL } from '../../services/placement/__tests__/helpers/noRoomUrl';

/** CP10.2 (kit "Employer portal"): the employer API through the REAL router, guard and views. */
let switchOn = true;
let detached: Array<Promise<string>> = [];
const app = express();
app.use(express.json());
app.use(createHireClientRouter({ read: async () => switchOn, track: (p) => { detached.push(p); } }));
const settle = async () => { for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r)); };
const as = (mid: string, cid: string) => `Bearer ${jwt.sign({ kind: 'hire_client_session', mid, cid }, env.jwtSecret, { audience: 'hire-client', expiresIn: 600 })}`;
const PAT = as('m-a', A); const SAM = as('m-b', B);
const offerBody = (over: Record<string, unknown> = {}) => ({ clientKey: '44444444-0000-4000-8000-000000000004', enrollmentId: ANN, role: 'AI Solutions Analyst',
  pay: { basis: 'yearly', salaryCents: 105_000_00 }, startDate: '2027-01-04', agreed: true, agreementTextVersion: 'f7-fee-2026-11', ...over });
const OFFER_ROW = { id: '55555555-0000-4000-8000-000000000005', offer_group_id: '66666666-0000-4000-8000-000000000006', version: 1, client_id: A, enrollment_id: ANN,
  full_name: 'Ann Lee', role: 'AI Solutions Analyst', pay_basis: 'yearly', salary_cents: '10500000', hourly_rate_cents: null, hours_per_week: null,
  first_year_cents: '10500000', fee_rate_bp: 11000, fee_cents: '11550000', start_date: '2027-01-04', respond_by: null, status: 'sent', invoice_status: null,
  created_at: new Date('2026-11-22T15:00:00Z') };

beforeEach(() => {
  switchOn = true;
  mockDb.interviews = [
    { client_id: A, id: IV, enrollment_id: ANN, full_name: 'Ann Lee', company: 'Acme', position: 'Analyst', state: 'booked', starts_at: new Date('2026-11-25T16:00:00Z'),
      minutes: 30, recording_consent: 'on', room_url: SENTINEL_PROVIDER_URL, room_provider_id: '987654' },
    { client_id: A, id: '77777777-0000-4000-8000-000000000007', enrollment_id: ANN, full_name: 'Ann Lee', company: 'Acme', position: 'Analyst', state: 'new',
      starts_at: null, minutes: null, recording_consent: null, room_url: SENTINEL_PROVIDER_URL },
    { client_id: A, id: '99999999-0000-4000-8000-000000000009', enrollment_id: ANN, full_name: 'Ann Lee', company: 'Acme', position: 'Analyst', state: 'done',
      starts_at: new Date('2026-11-21T16:00:00Z'), minutes: 30, recording_consent: 'declined', room_url: SENTINEL_PROVIDER_URL },
  ];
  mockDb.offers = []; mockDb.tokens = []; detached = [];
  mockMail.send.mockReset().mockResolvedValue({ messageId: 'mid-1' });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  mockCreate.mockReset().mockImplementation(async () => { mockDb.offers = [OFFER_ROW]; return { status: 'ok', offer: OFFER_ROW, replay: false }; });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('sign-in answers', () => {
  it('request-link: switch off, unknown or malformed, all the same 202 message', async () => {
    switchOn = false;
    const off = await request(app).post('/api/hire/client/auth/request-link').send({ email: 'pat@acme.example' });
    switchOn = true;
    const junk = await request(app).post('/api/hire/client/auth/request-link').send({ email: 'nope' });
    for (const r of [off, junk]) expect([r.status, r.body]).toEqual([202, { message: REQUEST_LINK_RESPONSE }]);
  });
  it('a member is answered as fast as an unknown address: the 202 goes out before the token row and the (hanging) send', async () => {
    let release: (v: unknown) => void = () => undefined;
    mockMail.send.mockImplementation(() => new Promise((r) => { release = r; })); // never resolves until released
    const time = async (email: string) => { const t0 = Date.now(); const r = await request(app).post('/api/hire/client/auth/request-link').send({ email }); return { r, ms: Date.now() - t0 }; };
    const member = await time('pat@acme.example');
    const unknown = await time('nobody@nowhere.example');
    for (const x of [member, unknown]) expect([x.r.status, x.r.body]).toEqual([202, { message: REQUEST_LINK_RESPONSE }]);
    expect(member.ms).toBeLessThan(250);
    expect(Math.abs(member.ms - unknown.ms)).toBeLessThan(150);
    // ...and the work still happens afterwards: one token row, one send (still hanging), then sent once released.
    await settle();
    expect([mockDb.tokens, mockMail.send.mock.calls.length]).toEqual([['pat@acme.example'], 1]);
    release({ messageId: 'mid-2' });
    expect(await Promise.all(detached)).toEqual(['sent', 'no_access']);
  });
  it('switch off: 202, and no token row and no send happen afterwards either', async () => {
    switchOn = false;
    expect((await request(app).post('/api/hire/client/auth/request-link').send({ email: 'pat@acme.example' })).status).toBe(202);
    await settle();
    expect(await Promise.all(detached)).toEqual(['off']);
    expect([mockDb.tokens.length, mockMail.send.mock.calls.length]).toEqual([0, 0]);
  });
  it('a failure in the detached work is logged with its class, never an unhandled rejection', async () => {
    mockMail.send.mockRejectedValue(Object.assign(new Error('smtp down'), { name: 'TimeoutError' }));
    expect((await request(app).post('/api/hire/client/auth/request-link').send({ email: 'pat@acme.example' })).status).toBe(202);
    await settle();
    expect(await Promise.all(detached)).toEqual(['failed']);
    expect((console.warn as jest.Mock).mock.calls.map((c) => JSON.parse(String(c[0]))).find((l) => l.event === 'hire_client_link_request_error')).toMatchObject({ error_class: 'TimeoutError' });
  });
  it('redeem with a bad token: 401, one message', async () => {
    const r = await request(app).post('/api/hire/client/auth/redeem').send({ token: 'x' });
    expect(r.status).toBe(401);
    expect(r.body.error).toMatch(/no longer valid/);
  });
});

describe('scoped to the signed-in client', () => {
  it('candidates: client A sees only Ann; client B sees only Bob; B asking for Ann is 404', async () => {
    const a = await request(app).get('/api/hire/client/candidates').set('Authorization', PAT);
    expect(a.body.candidates).toEqual([{ enrollmentId: ANN, name: 'Ann Lee', initials: 'AL', putForwardAt: '2026-11-20T15:00:00.000Z', readiness: 72,
      profile: { url: 'https://hire.refactored.ai/talent/ann-lee/', role: 'AI Solutions Analyst', verifiedProjects: ['Freight ETA forecasting'], verifiedCount: 1 } }]);
    expect(a.body).toMatchObject({ profilesUnavailable: false, feeRateBp: 11000 });
    expect((await request(app).get(`/api/hire/client/candidates/${ANN}`).set('Authorization', SAM)).status).toBe(404);
    const one = await request(app).get(`/api/hire/client/candidates/${ANN}`).set('Authorization', PAT);
    expect(one.status).toBe(200);
    expect(one.body).toMatchObject({ candidate: { enrollmentId: ANN, readiness: 72 }, profilesUnavailable: false });
    expect((await request(app).get('/api/hire/client/candidates/not-a-uuid').set('Authorization', PAT)).status).toBe(404);
    expect(a.headers['cache-control']).toBe('no-store');
  });
  it('card facts are asked ONLY for this client\'s own candidates (never another client\'s, never a 404\'d id)', async () => {
    mockCards.asked = [];
    await request(app).get('/api/hire/client/candidates').set('Authorization', SAM);
    await request(app).get(`/api/hire/client/candidates/${ANN}`).set('Authorization', SAM); // 404: no facts read
    expect(mockCards.asked).toEqual([[BOB]]);
    const b = await request(app).get('/api/hire/client/candidates').set('Authorization', SAM);
    expect(b.body.candidates[0]).toMatchObject({ enrollmentId: BOB, readiness: null, profile: null }); // absent = null, never invented
  });
  it('the Hire profiles could not be read: the list still loads and says so (profilesUnavailable), with no profile', async () => {
    mockCards.unavailable = true;
    try {
      const a = await request(app).get('/api/hire/client/candidates').set('Authorization', PAT);
      expect(a.status).toBe(200);
      expect(a.body).toMatchObject({ profilesUnavailable: true, candidates: [{ profile: null, readiness: 72 }] });
    } finally { mockCards.unavailable = false; }
  });
  it('a profile link that is not an https /talent/ address is refused by the response contract (500, never sent on)', async () => {
    mockCards.xss = true;
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const a = await request(app).get('/api/hire/client/candidates').set('Authorization', PAT);
      expect(a.status).toBe(500);
      expect(JSON.stringify(a.body)).not.toContain('javascript:');
    } finally { mockCards.xss = false; err.mockRestore(); }
  });
  it('interviews: never the provider link; Join is the signed room PAGE, only when booked', async () => {
    const r = await request(app).get('/api/hire/client/interviews').set('Authorization', PAT);
    expect(r.status).toBe(200);
    expectNoRoomUrl(r.body);
    expect(JSON.stringify(r.body)).not.toContain('987654');
    expect(r.body.interviews[0]).toMatchObject({ status: 'booked', recorded: true });
    expect(r.body.interviews[0].joinPage).toMatch(new RegExp(`^https://hire\\.refactored\\.ai/room/\\?i=${IV}&e=\\d+&t=[A-Za-z0-9_-]{43}$`));
    expect(r.body.interviews[1]).toMatchObject({ status: 'not_booked', joinPage: null });
    expect(r.body.interviews[2]).toMatchObject({ status: 'held', joinPage: null, recorded: false }); // a held interview with a time: no Join
    expect((await request(app).get('/api/hire/client/interviews').set('Authorization', SAM)).body.interviews).toEqual([]);
  });
  it('candidates pass the no-room-url scan too', async () => {
    expectNoRoomUrl((await request(app).get('/api/hire/client/candidates').set('Authorization', PAT)).body);
  });
  it('no session, a wrong audience, the switch off: 401 on every data route', async () => {
    const participant = `Bearer ${jwt.sign({ sub: ANN, role: 'participant' }, env.jwtSecret)}`;
    for (const path of ['candidates', 'interviews', 'offers']) {
      expect((await request(app).get(`/api/hire/client/${path}`)).status).toBe(401);
      expect((await request(app).get(`/api/hire/client/${path}`).set('Authorization', participant)).status).toBe(401);
    }
    switchOn = false;
    expect((await request(app).get('/api/hire/client/candidates').set('Authorization', PAT)).status).toBe(401);
  });
});

describe('make an offer', () => {
  it('201 with the server-computed fee; the employer agreed as the signed-in member; company = the client', async () => {
    const r = await request(app).post('/api/hire/client/offers').set('Authorization', PAT).send(offerBody());
    expect(r.status).toBe(201);
    expect(r.body.offer).toMatchObject({ feeCents: 115_500_00, firstYearCents: 105_000_00, status: 'sent', invoiceStatus: null });
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ clientId: A, company: 'Acme', feeAgreed: true, agreedBy: 'hire_client_member:m-a', createdBy: 'hire_client_member:m-a',
      agreementTextVersion: 'f7-fee-2026-11' });
    expect((await request(app).get('/api/hire/client/offers').set('Authorization', PAT)).body.offers).toHaveLength(1);
    expect((await request(app).get('/api/hire/client/offers').set('Authorization', SAM)).body.offers).toEqual([]);
  });
  it('without the agreement box: 400 and nothing is created', async () => {
    for (const agreed of [false, undefined]) {
      const r = await request(app).post('/api/hire/client/offers').set('Authorization', PAT).send(offerBody({ agreed }));
      expect(r.status).toBe(400);
    }
    expect((await request(app).post('/api/hire/client/offers').set('Authorization', PAT).send(offerBody({ agreed: false }))).body.error).toBe('Tick the box to agree to the placement fee before sending.');
    expect(mockCreate).not.toHaveBeenCalled();
  });
  it('over-length role, a fee sent by the page, or unknown fields: 400 (refused, never cut short)', async () => {
    const long = await request(app).post('/api/hire/client/offers').set('Authorization', PAT).send(offerBody({ role: 'r'.repeat(201) }));
    expect([long.status, long.body.error]).toEqual([400, 'The role can be at most 200 characters.']);
    expect((await request(app).post('/api/hire/client/offers').set('Authorization', PAT).send({ ...offerBody(), feeCents: 1 })).status).toBe(400);
    expect(MakeOfferBody.safeParse({ ...offerBody(), agreementTextVersion: 'v'.repeat(41) }).success).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
  });
  it('another client\'s candidate or interview: 404; a service refusal is 400 with its reason', async () => {
    expect((await request(app).post('/api/hire/client/offers').set('Authorization', SAM).send(offerBody())).status).toBe(404);
    expect((await request(app).post('/api/hire/client/offers').set('Authorization', PAT).send(offerBody({ interviewId: '88888888-0000-4000-8000-000000000008' }))).status).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
    mockCreate.mockResolvedValueOnce({ status: 'invalid', reason: 'The yearly salary must be at least $1.' });
    const bad = await request(app).post('/api/hire/client/offers').set('Authorization', PAT).send(offerBody({ pay: { basis: 'yearly', salaryCents: 99 } }));
    expect([bad.status, bad.body.error]).toEqual([400, 'The yearly salary must be at least $1.']);
  });
  it('a replayed click answers 200 with replay true; a key that belongs to another client\'s offer is 404', async () => {
    await request(app).post('/api/hire/client/offers').set('Authorization', PAT).send(offerBody());
    mockCreate.mockResolvedValueOnce({ status: 'ok', offer: OFFER_ROW, replay: true });
    const again = await request(app).post('/api/hire/client/offers').set('Authorization', PAT).send(offerBody());
    expect([again.status, again.body.replay]).toEqual([200, true]);
    mockDb.candidates.push({ client_id: B, enrollment_id: ANN, full_name: 'Ann Lee', put_forward_at: new Date() });
    mockCreate.mockResolvedValueOnce({ status: 'ok', offer: OFFER_ROW, replay: true });
    expect((await request(app).post('/api/hire/client/offers').set('Authorization', SAM).send(offerBody())).status).toBe(404);
    mockDb.candidates.pop();
  });
  it('a store failure is a logged 500, never a crash', async () => {
    mockCreate.mockRejectedValueOnce(Object.assign(new Error('db down'), { name: 'SequelizeConnectionError' }));
    expect((await request(app).post('/api/hire/client/offers').set('Authorization', PAT).send(offerBody())).status).toBe(500);
    expect(String((console.error as jest.Mock).mock.calls[0][0])).toContain('hire_client_make_offer_failed');
  });
});
