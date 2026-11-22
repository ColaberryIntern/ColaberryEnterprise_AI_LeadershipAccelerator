/**
 * CP10.4 (kit F7): the learner's Offers API through the REAL router, gates (requireParticipant, requireCareerPrep) and
 * the REAL offerService. The offer store is a hostile stand-in: every row it hands back carries the fee, the rate, the
 * first-year figure, the agreement fields and the sentinel provider link of the interview the offer came from, so the
 * deep scans below prove the ROUTE never passes any of them on (candidateOffers' SQL, which reads no fee column and only
 * the caller's current versions, runs on Postgres in offerStore.integration.test.ts). Its transaction runs one at a
 * time, as the group's row lock does, so two answers at once are serialized the way Postgres serializes them.
 */
jest.mock('../../middlewares/authFailureLog', () => ({ logAuthFailure: jest.fn(), describeCaller: () => ({ forwarded_for: null, user_agent: null }) }));
const mockEnabled = jest.fn();
jest.mock('../../services/careerPrep/careerPrepFlag', () => ({ careerPrepEnabled: (...a: unknown[]) => mockEnabled(...a) }));
jest.mock('../../services/campus/campusPilot', () => ({ campusOnFor: () => true }));
const mockSend = jest.fn();
jest.mock('../../services/email/idempotentSend', () => ({ sendOnce: (...a: unknown[]) => mockSend(...a) }));

type Row = Record<string, unknown> & { id: string; offer_group_id: string; version: number; enrollment_id: string; status: string; superseded_at: Date | null };
const mockDb = { offers: [] as Row[], invoices: [] as string[], fail: false, listedFor: [] as string[] };
let mockChain: Promise<unknown> = Promise.resolve();
jest.mock('../../services/placement/offerStore', () => {
  const cur = (g: string) => mockDb.offers.find((o) => o.offer_group_id === g && o.superseded_at === null);
  const down = () => { if (mockDb.fail) throw Object.assign(new Error('db down'), { name: 'SequelizeConnectionError' }); };
  return {
    inTransaction: (fn: (t: unknown) => Promise<unknown>) => { const run = mockChain.then(() => fn({})); mockChain = run.catch(() => undefined); return run; },
    lockCurrent: async (g: string) => { down(); const r = cur(g); return r ? { ...r } : undefined; },
    setStatus: async (id: string, status: string) => { const r = mockDb.offers.find((o) => o.id === id) as Row; r.status = status; return { ...r }; },
    insertInvoice: async (o: Row) => { if (mockDb.invoices.includes(o.id)) return false; mockDb.invoices.push(o.id); return true; },
    candidateOffers: async (e: string) => { down(); mockDb.listedFor.push(e); return mockDb.offers.filter((o) => o.enrollment_id === e && o.superseded_at === null).map((o) => ({ ...o })); },
  };
});

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { SENTINEL_PROVIDER_URL, expectNoRoomUrl } from '../../services/placement/__tests__/helpers/noRoomUrl';
import { env } from '../../config/env';

const ANN = '11111111-0000-4000-8000-000000000001'; const BOB = '22222222-0000-4000-8000-000000000002';
const G1 = 'aaaaaaaa-0000-4000-8000-000000000001'; const G2 = 'aaaaaaaa-0000-4000-8000-000000000002'; const GB = 'bbbbbbbb-0000-4000-8000-000000000001';
const FEE = 123_456_789; const RATE_BP = 11_111; const FIRST_YEAR = 98_765_432;
const token = (sub = ANN) => `Bearer ${jwt.sign({ sub, cohort_id: 'coh-1', role: 'participant' }, env.jwtSecret)}`;

/** Every key that is the fee or derived from it, anywhere in a body, plus any number equal to the stored fee or rate. */
const FEE_KEY = /fee|invoice|first_?year|rate_?bp|agreed|agreement/i;
function feeLeaks(body: unknown, path = '$'): string[] {
  if (typeof body === 'number') return body === FEE || body === RATE_BP || body === FIRST_YEAR ? [path] : [];
  if (typeof body === 'string') return [String(FEE), String(RATE_BP), String(FIRST_YEAR)].some((v) => body.includes(v)) ? [path] : [];
  if (Array.isArray(body)) return body.flatMap((v, i) => feeLeaks(v, `${path}[${i}]`));
  if (body && typeof body === 'object') return Object.entries(body).flatMap(([k, v]) => [...(FEE_KEY.test(k) ? [`${path}.${k}`] : []), ...feeLeaks(v, `${path}.${k}`)]);
  return [];
}
const expectNoFee = (body: unknown) => expect(feeLeaks(body)).toEqual([]);

let n = 0;
const offer = (group: string, over: Partial<Row> = {}): Row => ({ id: `cccccccc-0000-4000-8000-${String(++n).padStart(12, '0')}`, offer_group_id: group, version: 1,
  superseded_at: null, client_key: `k-${n}`, enrollment_id: ANN, interview_id: 'iv-1', client_id: 'cl-1', company: 'Acme', role: 'Data Analyst', pay_basis: 'yearly',
  salary_cents: '10500000', hourly_rate_cents: null, hours_per_week: null, first_year_cents: String(FIRST_YEAR), fee_rate_bp: RATE_BP, fee_cents: String(FEE),
  start_date: '2026-12-07', respond_by: new Date('2026-12-01T23:00:00Z'), fee_agreed_at: new Date(), agreed_by: 'pat@acme.example', agreement_text_version: 'f7-fee-2026-11',
  status: 'sent', decided_at: null, created_by: 'pat', created_at: new Date(), room_url: SENTINEL_PROVIDER_URL, interview: { room_url: SENTINEL_PROVIDER_URL }, ...over });

let shared: express.Express | null = null;
beforeAll(async () => {
  const router = (await import('../careerPrepOfferRoutes')).default;
  shared = express(); shared.use(express.json()); shared.use(router);
}, 60_000);
const app = (): express.Express => { if (!shared) throw new Error('the router did not load'); return shared; };
const URL = '/api/portal/career-prep/offers';
const answer = (g: string, decision: string, body: unknown = { version: 1 }, sub = ANN) => request(app()).post(`${URL}/${g}/${decision}`).set('Authorization', token(sub)).send(body as object);

beforeEach(() => {
  mockEnabled.mockReset().mockResolvedValue(true); mockSend.mockReset();
  mockDb.fail = false; mockDb.invoices = []; mockDb.listedFor = [];
  mockDb.offers = [offer(G1), offer(G2, { company: 'Beta', pay_basis: 'hourly', salary_cents: null, hourly_rate_cents: 5000, hours_per_week: '37.5', start_date: null, respond_by: null }),
    offer(GB, { enrollment_id: BOB, company: 'Bob Corp' })];
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('the deep scans themselves', () => {
  it('feeLeaks finds a planted fee key, a fee value and a nested invoice', () => {
    expect(feeLeaks({ a: [{ feeCents: 1 }], b: { x: FEE }, c: { invoiceStatus: 'x' }, d: `${RATE_BP}` })).toEqual(['$.a[0].feeCents', '$.b.x', '$.c.invoiceStatus', '$.d']);
    expect(feeLeaks({ salaryCents: 10500000, hourlyRateCents: 5000, payBasis: 'yearly' })).toEqual([]);
  });
});

describe('GET /api/portal/career-prep/offers', () => {
  it('401 without a session, 404 with Career Prep off, 400 for any parameter; nothing is read', async () => {
    expect((await request(app()).get(URL)).status).toBe(401);
    mockEnabled.mockResolvedValue(false);
    expect((await request(app()).get(URL).set('Authorization', token())).status).toBe(404);
    mockEnabled.mockResolvedValue(true);
    expect((await request(app()).get(`${URL}?enrollmentId=${BOB}`).set('Authorization', token())).status).toBe(400);
    expect(mockDb.listedFor).toEqual([]);
  });

  it('the caller\'s own offers with the pay, never a fee, a fee-derived field or the room link', async () => {
    const res = await request(app()).get(URL).set('Authorization', token());
    expect(res.status).toBe(200);
    expect(mockDb.listedFor).toEqual([ANN]);
    expect(res.body.offers.map((o: { company: string }) => o.company)).toEqual(['Acme', 'Beta']);
    expect(res.body.offers[0]).toEqual({ id: mockDb.offers[0].id, groupId: G1, version: 1, company: 'Acme', role: 'Data Analyst', payBasis: 'yearly', salaryCents: 10_500_000,
      hourlyRateCents: null, hoursPerWeek: null, startDate: '2026-12-07', respondBy: '2026-12-01T23:00:00.000Z', status: 'sent' });
    expect(res.body.offers[1]).toMatchObject({ payBasis: 'hourly', hourlyRateCents: 5000, hoursPerWeek: 37.5, salaryCents: null, startDate: null, respondBy: null });
    expectNoFee(res.body);
    expectNoRoomUrl(res.body);
  });

  it('empty is an empty list; a database failure is an honest 500', async () => {
    expect((await request(app()).get(URL).set('Authorization', token('99999999-0000-4000-8000-000000000009'))).body).toEqual({ offers: [] });
    mockDb.fail = true;
    const res = await request(app()).get(URL).set('Authorization', token());
    expect([res.status, res.body.error]).toEqual([500, 'Could not load your offers. Try again in a moment.']);
  });
});

describe('POST /api/portal/career-prep/offers/:groupId/:decision', () => {
  it('401 without a session, 404 with Career Prep off; 400 for a bad id, decision or body; nothing changes', async () => {
    expect((await request(app()).post(`${URL}/${G1}/accept`).send({ version: 1 })).status).toBe(401);
    mockEnabled.mockResolvedValue(false);
    expect((await answer(G1, 'accept')).status).toBe(404);
    mockEnabled.mockResolvedValue(true);
    for (const [g, d, b] of [['not-a-uuid', 'accept', { version: 1 }], [G1, 'withdraw', { version: 1 }], [G1, 'accept', {}], [G1, 'accept', { version: '1' }],
      [G1, 'accept', { version: 0 }], [G1, 'accept', { version: 1, status: 'accepted' }], [G1, 'accept', { version: 1, feeCents: 1 }]] as const) {
      const res = await answer(g, d, b);
      expect([g, d, res.status]).toEqual([g, d, 400]);
    }
    expect(mockDb.offers[0].status).toBe('sent');
    expect(mockDb.invoices).toEqual([]);
  });

  it('accept: 200, the offer is accepted, ONE invoice record, and the answer carries no fee or room link', async () => {
    const res = await answer(G1, 'accept');
    expect([res.status, res.body.offer.status, res.body.replay]).toEqual([200, 'accepted', false]);
    expect(mockDb.invoices).toEqual([mockDb.offers[0].id]);
    expectNoFee(res.body);
    expectNoRoomUrl(res.body);
  });

  it('accept twice (a retry), and twice at the same moment: 200 every time, exactly one invoice record', async () => {
    const [a, b] = await Promise.all([answer(G1, 'accept'), answer(G1, 'accept')]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.body.replay, b.body.replay].sort()).toEqual([false, true]);
    const c = await answer(G1, 'accept');
    expect([c.status, c.body.replay, c.body.offer.status]).toEqual([200, true, 'accepted']);
    expect(mockDb.invoices).toEqual([mockDb.offers[0].id]);
  });

  it('another learner\'s offer is 404 for every decision, and it does not move', async () => {
    for (const d of ['accept', 'decline', 'talk-first']) expect((await answer(GB, d)).status).toBe(404);
    expect((await answer('dddddddd-0000-4000-8000-000000000001', 'accept')).status).toBe(404);
    expect(mockDb.offers[2].status).toBe('sent');
    expect(mockDb.invoices).toEqual([]);
  });

  it('talk first, then accept: no invoice for talking, one for the acceptance; decline makes none', async () => {
    const t = await answer(G1, 'talk-first');
    expect([t.status, t.body.offer.status]).toEqual([200, 'talk_first']);
    expect(mockDb.invoices).toEqual([]);
    expect((await answer(G1, 'accept')).body.offer.status).toBe('accepted');
    const d = await answer(G2, 'decline');
    expect([d.status, d.body.offer.status]).toEqual([200, 'declined']);
    expect(mockDb.invoices).toEqual([mockDb.offers[0].id]);
  });

  it('a stale version answers honestly: 409 stale with the CURRENT version (no fee), and nothing changes', async () => {
    mockDb.offers[0].superseded_at = new Date();
    mockDb.offers.push(offer(G1, { version: 2, salary_cents: '11000000' }));
    const res = await answer(G1, 'accept', { version: 1 });
    expect([res.status, res.body.reason, res.body.error]).toEqual([409, 'stale', 'The employer updated this offer after you opened it. Read the new details before you answer.']);
    expect([res.body.offer.version, res.body.offer.salaryCents, res.body.offer.status]).toEqual([2, 11_000_000, 'sent']);
    expectNoFee(res.body);
    expectNoRoomUrl(res.body);
    expect(mockDb.invoices).toEqual([]);
    expect((await answer(G1, 'accept', { version: 2 })).status).toBe(200);
  });

  it('a final offer never moves: decline after accept and accept after a withdrawal are 409 final', async () => {
    await answer(G1, 'accept');
    const res = await answer(G1, 'decline');
    expect([res.status, res.body.reason, res.body.offer.status]).toEqual([409, 'final', 'accepted']);
    mockDb.offers[1].status = 'withdrawn';
    const w = await answer(G2, 'accept');
    expect([w.status, w.body.reason, w.body.offer.status]).toEqual([409, 'final', 'withdrawn']);
    expect(mockDb.invoices).toEqual([mockDb.offers[0].id]);
  });

  it('dark: answering never sends an email; a database failure is a 500 that changed nothing', async () => {
    await answer(G1, 'accept'); await answer(G2, 'talk-first');
    expect(mockSend).not.toHaveBeenCalled();
    mockDb.fail = true;
    const res = await answer(GB, 'accept', { version: 1 }, BOB);
    expect([res.status, res.body.error]).toEqual([500, 'Could not save your answer. Nothing changed. Try again in a moment.']);
    expect(mockDb.offers[2].status).toBe('sent');
  });
});
