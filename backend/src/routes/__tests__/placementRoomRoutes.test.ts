jest.mock('../../middlewares/authFailureLog', () => ({ logAuthFailure: jest.fn(), describeCaller: () => ({ forwarded_for: null, user_agent: null }) }));
const mockEnabled = jest.fn();
jest.mock('../../services/careerPrep/careerPrepFlag', () => ({ careerPrepEnabled: (...a: unknown[]) => mockEnabled(...a) }));
jest.mock('../../services/campus/campusPilot', () => ({ campusOnFor: () => true }));
jest.mock('../../services/caseStudy/caseStudySurfaceProfiles', () => ({ getCaseStudySurfaceProfile: () => ({ publicBaseUrl: 'https://hire.refactored.ai' }) }));
import { makeRoomDb, ivRow } from '../../services/placement/__tests__/helpers/fakeRoomDb';
import { SENTINEL_PROVIDER_URL } from '../../services/placement/__tests__/helpers/noRoomUrl';

const mockDb = { current: makeRoomDb() };
// The route module loads the app's models (the real, unconnected Sequelize); only its I/O is the stand-in.
jest.mock('../../config/database', () => {
  const real = jest.requireActual('../../config/database');
  real.sequelize.query = (...a: unknown[]) => (mockDb.current.query as (...x: unknown[]) => unknown)(...a);
  real.sequelize.transaction = (fn: (t: unknown) => Promise<unknown>) => mockDb.current.transaction(fn as never);
  return real;
});
const mockSets: string[] = [];
jest.mock('../../services/placement/roomProvider', () => ({ roomProvider: {
  canSetRecording: async () => ({ ok: true, missing: [], reason: 'ok' }),
  setRecording: async (m: string, mode: string) => { mockSets.push(`${m}:${mode}`); },
  recording: async () => (mockSets.length ? 'on' : 'off'),
} }));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { roomPageUrl } from '../../services/placement/roomLink';

/**
 * CP9.1 (kit F5): the four room routes through the REAL routers and the REAL roomService, the database a stand-in that
 * applies only what each statement says (fakeRoomDb). The meeting provider is a stand-in (its own suites cover it).
 * These are the ONLY routes that may return the provider's join link, and only once the caller has decided.
 */
const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '33333333-3333-4333-8333-333333333333';
const START = new Date('2026-11-23T15:00:00Z');
const END = new Date(START.getTime() + 30 * 60_000);
let clock = new Date(START.getTime() - 5 * 60_000);
const token = (sub = 'enr-ann') => `Bearer ${jwt.sign({ sub, cohort_id: 'coh-1', role: 'participant' }, env.jwtSecret)}`;
const link = (id = ID, end = END) => { const u = new URL(roomPageUrl(id, end)); return `e=${u.searchParams.get('e')}&t=${u.searchParams.get('t')}`; };

let shared: express.Express | null = null;
beforeAll(async () => {
  const { createRoomRouters } = await import('../placementRoomRoutes');
  const r = createRoomRouters({ now: () => clock });
  shared = express();
  shared.use(express.json());
  shared.use(r.candidate, r.employer);
}, 60_000);
const app = () => { if (!shared) throw new Error('the routers did not load'); return shared; };

beforeEach(() => {
  mockDb.current = makeRoomDb();
  mockDb.current.fake.iv.push(ivRow(), ivRow({ id: OTHER, enrollment_id: 'enr-bob', room_provider_id: 'zm-3', readback_meeting_id: 'zm-3' }));
  mockSets.length = 0;
  mockEnabled.mockReset().mockResolvedValue(true);
  clock = new Date(START.getTime() - 5 * 60_000);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const CAND = `/api/portal/career-prep/room/${ID}`;
const EMP = `/api/public/room/${ID}`;

describe('candidate room', () => {
  it('401 without a session; 404 when Career Prep is off for them', async () => {
    expect((await request(app()).get(CAND)).status).toBe(401);
    mockEnabled.mockResolvedValue(false);
    expect((await request(app()).get(CAND).set('Authorization', token())).status).toBe(404);
  });
  it('400 for a bad id, a query parameter or a bad decision', async () => {
    expect((await request(app()).get('/api/portal/career-prep/room/nope').set('Authorization', token())).status).toBe(400);
    expect((await request(app()).get(`${CAND}?x=1`).set('Authorization', token())).status).toBe(400);
    expect((await request(app()).post(`${CAND}/consent`).set('Authorization', token()).send({ decision: 'maybe' })).status).toBe(400);
    expect((await request(app()).post(`${CAND}/consent`).set('Authorization', token()).send({ decision: 'consent', extra: 1 })).status).toBe(400);
    expect(mockDb.current.fake.consents).toHaveLength(0);
  });
  it("404 for another learner's interview (and nothing recorded for it)", async () => {
    expect((await request(app()).get(`/api/portal/career-prep/room/${OTHER}`).set('Authorization', token())).status).toBe(404);
    expect((await request(app()).post(`/api/portal/career-prep/room/${OTHER}/consent`).set('Authorization', token()).send({ decision: 'consent' })).status).toBe(404);
    expect(mockDb.current.fake.consents).toHaveLength(0);
  });
  it('403 "opens 10 minutes before" at 11 minutes before, with the opening time', async () => {
    clock = new Date(START.getTime() - 11 * 60_000);
    const res = await request(app()).get(CAND).set('Authorization', token());
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'The room opens 10 minutes before the interview.', opensAt: '2026-11-23T14:50:00.000Z' });
  });
  it('before deciding: the room, no link anywhere in the body; after consenting: the link', async () => {
    const before = await request(app()).get(CAND).set('Authorization', token());
    expect(before.status).toBe(200);
    expect(before.headers['cache-control']).toBe('no-store');
    expect(before.body.room).toMatchObject({ you: 'candidate', yourDecision: null, consent: { label: 'RECORDING 0 OF 2 CONSENTED' }, join: { status: 'decide_first', url: null } });
    expect(JSON.stringify(before.body)).not.toContain(SENTINEL_PROVIDER_URL);
    const after = await request(app()).post(`${CAND}/consent`).set('Authorization', token()).send({ decision: 'consent' });
    expect(after.body.room).toMatchObject({ yourDecision: 'consent', consent: { label: 'RECORDING 1 OF 2 CONSENTED' }, join: { status: 'ready', url: SENTINEL_PROVIDER_URL } });
  });
  it('410 once the interview has ended (end + 2 h)', async () => {
    clock = new Date(END.getTime() + 2 * 3_600_000 + 60_000);
    expect((await request(app()).get(CAND).set('Authorization', token())).body).toMatchObject({ reason: 'ended' });
  });
});

describe('employer room (the signed link)', () => {
  it('401 for a bad signature, a missing one, or a link signed for another interview; nothing else is touched', async () => {
    const bad = await request(app()).get(`${EMP}?e=${END.getTime()}&t=${'A'.repeat(43)}`);
    expect([bad.status, bad.body]).toEqual([401, { error: 'This room link is not valid.', reason: 'invalid' }]);
    expect((await request(app()).get(EMP)).status).toBe(401);
    expect((await request(app()).get(`${EMP}?${link(OTHER)}`)).status).toBe(401);
    expect((await request(app()).post(`${EMP}/consent?${link(OTHER)}`).send({ decision: 'consent' })).status).toBe(401);
    expect(mockDb.current.fake.sql).toHaveLength(0);
  });
  it('the link works until end + 2 h: 200 at end + 1 h 59 min, 401 "this link has expired" at end + 2 h 01 min', async () => {
    clock = new Date(END.getTime() + 119 * 60_000);
    expect((await request(app()).get(`${EMP}?${link()}`)).status).toBe(200);
    clock = new Date(END.getTime() + 121 * 60_000);
    const res = await request(app()).get(`${EMP}?${link()}`);
    expect([res.status, res.body]).toEqual([401, { error: 'This link has expired.', reason: 'expired' }]);
  });
  it('a link for an earlier booking of a rescheduled interview is 410 moved, never the new meeting', async () => {
    mockDb.current.fake.iv[0].starts_at = new Date(START.getTime() + 3_600_000);
    const res = await request(app()).post(`${EMP}/consent?${link()}`).send({ decision: 'consent' });
    expect([res.status, res.body.reason]).toEqual([410, 'moved']);
    expect(JSON.stringify(res.body)).not.toContain(SENTINEL_PROVIDER_URL);
  });
  it('both parties consent over HTTP: recording ON once, both see 2 of 2 and the link', async () => {
    await request(app()).post(`${CAND}/consent`).set('Authorization', token()).send({ decision: 'consent' });
    const res = await request(app()).post(`${EMP}/consent?${link()}`).send({ decision: 'consent' });
    expect(res.status).toBe(200);
    expect(mockSets).toEqual(['zm-1:cloud']);
    expect(res.body.room).toMatchObject({ you: 'employer', recording: { status: 'on' }, consent: { label: 'RECORDING 2 OF 2 CONSENTED' }, join: { status: 'ready', url: SENTINEL_PROVIDER_URL } });
  });
  it('limits per link (never per edge IP): the 61st read in a minute is 429, another link still answers', async () => {
    mockDb.current.fake.iv[1].enrollment_id = 'enr-ann';
    for (let i = 0; i < 60; i += 1) await request(app()).get(`${EMP}?${link()}`);
    expect((await request(app()).get(`${EMP}?${link()}`)).status).toBe(429);
    expect((await request(app()).get(`/api/public/room/${OTHER}?${link(OTHER)}`)).status).toBe(200);
  });
});
