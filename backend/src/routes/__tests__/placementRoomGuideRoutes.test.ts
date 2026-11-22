jest.mock('../../middlewares/authFailureLog', () => ({ logAuthFailure: jest.fn(), describeCaller: () => ({ forwarded_for: null, user_agent: null }) }));
jest.mock('../../services/caseStudy/caseStudySurfaceProfiles', () => ({ getCaseStudySurfaceProfile: () => ({ publicBaseUrl: 'https://hire.refactored.ai' }) }));
import { makeGuideDb, guideIv, START, END_MS } from '../../services/placement/__tests__/helpers/fakeGuideDb';
import { expectNoRoomUrl, SENTINEL_PROVIDER_URL } from '../../services/placement/__tests__/helpers/noRoomUrl';

const mockDb = { current: makeGuideDb() };
// The route module loads the app's models (the real, unconnected Sequelize); only its I/O is the stand-in.
jest.mock('../../config/database', () => {
  const real = jest.requireActual('../../config/database');
  real.sequelize.query = (...a: unknown[]) => (mockDb.current.query as (...x: unknown[]) => unknown)(...a);
  real.sequelize.transaction = (fn: (t: unknown) => Promise<unknown>) => mockDb.current.transaction(fn as never);
  return real;
});

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { roomPageUrl } from '../../services/placement/roomLink';
import { MAX_NOTE_CHARS, MAX_NOTES } from '../../services/placement/roomGuide';

/**
 * CP9.1 (kit F5): the employer room's guide and private notes through the REAL router and the REAL roomGuide service;
 * the database a stand-in that applies only what each statement says (fakeGuideDb). Only the signed room link opens
 * them; no answer carries the meeting provider's link.
 */
const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '33333333-3333-4333-8333-333333333333';
const END = new Date(END_MS);
const K1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
let clock = new Date(START.getTime() - 60 * 60_000);
const link = (id = ID, end = END) => { const u = new URL(roomPageUrl(id, end)); return `e=${u.searchParams.get('e')}&t=${u.searchParams.get('t')}`; };
const GUIDE = (id = ID) => `/api/public/room/${id}/guide`;
const NOTES = (id = ID) => `/api/public/room/${id}/notes`;

let shared: express.Express | null = null;
beforeAll(async () => {
  const { createRoomGuideRouter } = await import('../placementRoomGuideRoutes');
  shared = express();
  shared.use(createRoomGuideRouter({ now: () => clock }));
  shared.use(express.json({ limit: '5mb' })); // what server.ts mounts after this router
}, 60_000);
const app = () => { if (!shared) throw new Error('the router did not load'); return shared; };

beforeEach(() => {
  mockDb.current = makeGuideDb();
  mockDb.current.fake.iv.push(guideIv({ room_url: SENTINEL_PROVIDER_URL } as never), guideIv({ id: OTHER, enrollment_id: 'enr-bob' }));
  mockDb.current.fake.prep.push({ placement_interview_id: ID, enrollment_id: 'enr-ann', questions: ['Walk me through a pipeline you built.'] });
  clock = new Date(START.getTime() - 60 * 60_000);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('the signed link comes first', () => {
  it('401 with no link, a bad signature, or a link signed for another interview; nothing read', async () => {
    expect((await request(app()).get(GUIDE())).status).toBe(401);
    expect((await request(app()).get(`${GUIDE()}?e=${END_MS}&t=${'A'.repeat(43)}`)).status).toBe(401);
    expect((await request(app()).get(`${GUIDE()}?${link(OTHER)}`)).status).toBe(401);
    expect((await request(app()).post(`${NOTES()}?${link(OTHER)}`).send({ key: K1, body: 'x' })).status).toBe(401);
    expect(mockDb.current.fake.sql).toHaveLength(0);
  });
  it('a candidate session is not a key: without the signed link it is 401', async () => {
    const auth = `Bearer ${jwt.sign({ sub: 'enr-ann', cohort_id: 'coh-1', role: 'participant' }, env.jwtSecret)}`;
    expect((await request(app()).get(GUIDE()).set('Authorization', auth)).status).toBe(401);
  });
  it('the link at end + 1 h 59 min opens; at end + 2 h 01 min it has expired', async () => {
    clock = new Date(END_MS + 119 * 60_000);
    expect((await request(app()).get(`${GUIDE()}?${link()}`)).status).toBe(200);
    clock = new Date(END_MS + 121 * 60_000);
    const r = await request(app()).get(`${GUIDE()}?${link()}`);
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: 'This link has expired.', reason: 'expired' });
  });
});

describe('GET guide', () => {
  it('200 with the questions, company, role and notes; never cached; no provider link anywhere', async () => {
    const r = await request(app()).get(`${GUIDE()}?${link()}`);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body).toEqual({ guide: { company: 'Acme', role: 'Data Analyst', questions: ['Walk me through a pipeline you built.'], notes: [] } });
    expectNoRoomUrl(r.body);
  });
  it('400 for a bad id; 410 moved and not booked; 404 unknown', async () => {
    expect((await request(app()).get(`/api/public/room/nope/guide?${link('nope')}`)).status).toBe(400);
    mockDb.current.fake.iv[0].starts_at = new Date(START.getTime() + 86_400_000);
    expect((await request(app()).get(`${GUIDE()}?${link()}`)).body.reason).toBe('moved');
    mockDb.current.fake.iv[0].starts_at = START;
    mockDb.current.fake.iv[0].state = 'cancelled';
    expect((await request(app()).get(`${GUIDE()}?${link()}`)).status).toBe(410);
    const gone = '44444444-4444-4444-8444-444444444444';
    expect((await request(app()).get(`${GUIDE(gone)}?${link(gone)}`)).status).toBe(404);
  });
  it('500 with a plain message when the database fails', async () => {
    mockDb.current.query = async () => { throw Object.assign(new Error('down'), { name: 'SequelizeConnectionError' }); };
    const r = await request(app()).get(`${GUIDE()}?${link()}`);
    expect(r.status).toBe(500);
    expect(r.body.error).toMatch(/Could not load the interview guide/);
  });
});

describe('POST notes', () => {
  it('201 the new note, then 200 replay for the same key (a double click stores one); no provider link', async () => {
    const a = await request(app()).post(`${NOTES()}?${link()}`).send({ key: K1, body: '  Clear on trade-offs.  ' });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ replay: false, note: { body: 'Clear on trade-offs.' } });
    const b = await request(app()).post(`${NOTES()}?${link()}`).send({ key: K1, body: 'Clear on trade-offs.' });
    expect(b.status).toBe(200);
    expect(b.body.replay).toBe(true);
    expect(b.body.guide.notes).toHaveLength(1);
    expect(mockDb.current.fake.notes).toHaveLength(1);
    expectNoRoomUrl(a.body); expectNoRoomUrl(b.body);
  });
  it('400 for a missing key, a key that is not a uuid, an empty or blank body, a body over the limit, or an extra field', async () => {
    for (const body of [{ body: 'x' }, { key: 'k1', body: 'x' }, { key: K1, body: '' }, { key: K1, body: '   ' }, { key: K1, body: 'x'.repeat(MAX_NOTE_CHARS + 1) },
      { key: K1, body: 'x', who: 'me' }, { key: K1, body: 5 }]) {
      expect((await request(app()).post(`${NOTES()}?${link()}`).send(body)).status).toBe(400);
    }
    expect((await request(app()).post(`${NOTES()}?${link()}`).set('Content-Type', 'application/json').send('{"key":')).status).toBe(400);
    expect(mockDb.current.fake.notes).toHaveLength(0);
  });
  it('413 for a body over 16kb, answered by the route\'s own parser before anything is read', async () => {
    const r = await request(app()).post(`${NOTES()}?${link()}`).send({ key: K1, body: 'x'.repeat(20_000) });
    expect(r.status).toBe(413);
    expect(mockDb.current.fake.sql).toHaveLength(0);
  });
  it('409 when the interview already holds the most notes it can', async () => {
    for (let i = 0; i < MAX_NOTES; i += 1) mockDb.current.fake.notes.push({ id: 900 + i, interview_id: ID, client_key: `k${i}`, body: 'n', created_at: new Date() });
    const r = await request(app()).post(`${NOTES()}?${link()}`).send({ key: K1, body: 'one more' });
    expect(r.status).toBe(409);
    expect(r.body.reason).toBe('full');
  });
  it('a moved link writes nothing (410)', async () => {
    mockDb.current.fake.iv[0].minutes = 60;
    expect((await request(app()).post(`${NOTES()}?${link()}`).send({ key: K1, body: 'x' })).status).toBe(410);
    expect(mockDb.current.fake.notes).toHaveLength(0);
  });
});

describe('limits per LINK, never per IP', () => {
  it('the 31st save in 15 minutes on one link is 429; another link is unaffected', async () => {
    for (let i = 0; i < 30; i += 1) await request(app()).post(`${NOTES(OTHER)}?${link(OTHER)}`).send({ key: K1, body: 'x' });
    expect((await request(app()).post(`${NOTES(OTHER)}?${link(OTHER)}`).send({ key: K1, body: 'x' })).status).toBe(429);
    expect((await request(app()).post(`${NOTES()}?${link()}`).send({ key: K1, body: 'x' })).status).toBe(201);
  });
});
