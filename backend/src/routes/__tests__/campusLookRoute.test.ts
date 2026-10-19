// C9: GET/PUT /api/portal/campus/look - routing, gating, validation and the response contract. The look service is mocked;
// campusLookService.test covers points, the upsert and the cache.
jest.mock('../../middlewares/authFailureLog', () => ({ logAuthFailure: jest.fn(), describeCaller: () => ({ forwarded_for: null, user_agent: null }) }));
type Look = { points: number; rung_name: string; catalog: unknown[]; equipped: Record<string, string> };
const LOOK: Look = { points: 400, rung_name: 'AI Enabled I', catalog: [{ id: 'cap', name: 'Cohort cap', slot: 'head', threshold: 150, unlocked: true }], equipped: { head: 'cap' } };
let mockGet: () => Promise<Look> = () => Promise.resolve(LOOK);
let mockSet: (id: string, eq: Record<string, string | null>) => Promise<Look> = () => Promise.resolve(LOOK);
const mockSetCalls: Array<[string, unknown]> = [];
jest.mock('../../services/campus/campusLookService', () => ({
  getLook: () => mockGet(),
  setLook: (id: string, eq: Record<string, string | null>) => { mockSetCalls.push([id, eq]); return mockSet(id, eq); },
  looksFor: async () => new Map(),
}));
jest.mock('../../services/campus/campusAudience', () => ({ campusAudienceFor: jest.fn() }));
jest.mock('../../services/campus/campusTourHandoff', () => ({ requestTourHandoff: jest.fn() }));
jest.mock('../../services/campus/campusPresenceService', () => ({ touchCampusArea: jest.fn(), getCampusPresence: jest.fn() }));
jest.mock('../../services/campus/campusStaffDesks', () => ({ getStaffDesks: jest.fn() }));
jest.mock('../../services/campus/campusWave', () => ({ waveAt: jest.fn() }));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { ParticipantPayload } from '../../middlewares/participantAuth';

const SECRET = ['campus', 'look', 'secret'].join('-');
process.env.JWT_SECRET = SECRET;
const URL = '/api/portal/campus/look';
const token = (extra: Partial<ParticipantPayload> = {}) => jwt.sign({ sub: 'enr-9', email: 'l@example.com', cohort_id: 'coh-1', role: 'participant', ...extra }, SECRET);

function buildApp(campus = 'all'): express.Express {
  const prev = process.env.CAMPUS_ENABLED;
  process.env.CAMPUS_ENABLED = campus;
  let router: express.Router = express.Router();
  jest.isolateModules(() => { router = require('../campusRoutes').default as express.Router; });
  if (prev === undefined) delete process.env.CAMPUS_ENABLED; else process.env.CAMPUS_ENABLED = prev;
  const app = express();
  app.use(express.json());
  app.use(router);
  return app;
}
const gearError = (cls: string) => Object.assign(new Error('Shades is earned at 400 points'), { name: 'GearError', error_class: cls });

beforeAll(() => { buildApp(); }, 120_000);
beforeEach(() => { mockGet = () => Promise.resolve(LOOK); mockSet = () => Promise.resolve(LOOK); mockSetCalls.length = 0; });
let errSpy: jest.SpyInstance;
beforeEach(() => { errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => errSpy.mockRestore());

const put = (app: express.Express, body: unknown, t = token()) => request(app).put(URL).set('Authorization', `Bearer ${t}`).send(body as object);

describe('GET /api/portal/campus/look', () => {
  it('returns the validated look for the token enrollment', async () => {
    const res = await request(buildApp()).get(URL).set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(LOOK);
  });
  it('403 when the campus is off', async () => {
    const res = await request(buildApp('off')).get(URL).set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(403);
    expect(res.body.error_class).toBe('CampusNotEnabled');
  });
  it('500 when the points or look read fails', async () => {
    mockGet = () => Promise.reject(Object.assign(new Error('db down'), { name: 'SequelizeConnectionError' }));
    const res = await request(buildApp()).get(URL).set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(500);
    expect(res.body.error_class).toBe('CampusLookUnavailable');
  });
  it('401 without a token', async () => {
    expect((await request(buildApp()).get(URL)).status).toBe(401);
  });
});

describe('PUT /api/portal/campus/look', () => {
  it('saves the complete set for the TOKEN enrollment and returns the look', async () => {
    const res = await put(buildApp(), { equipped: { head: 'cap', face: null } });
    expect(res.status).toBe(200);
    expect(mockSetCalls).toEqual([['enr-9', { head: 'cap', face: null }]]);
  });

  it('the same PUT twice answers the same (the service upserts one row)', async () => {
    const app = buildApp();
    const a = await put(app, { equipped: { head: 'cap' } });
    const b = await put(app, { equipped: { head: 'cap' } });
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.body).toEqual(b.body);
  });

  it.each([
    ['no body', undefined],
    ['no equipped', {}],
    ['an unknown slot key', { equipped: { hat: 'cap' } }],
    ['an extra top-level key', { equipped: {}, enrollment_id: 'someone-else' }],
    ['an over-long item id', { equipped: { head: 'x'.repeat(41) } }],
    ['a non-string item', { equipped: { head: 7 } }],
  ])('400 for %s, nothing saved', async (_n, body) => {
    const res = await put(buildApp(), body);
    expect(res.status).toBe(400);
    expect(mockSetCalls).toEqual([]);
  });

  it.each(['GearLocked', 'GearWrongSlot', 'GearUnknown'])('400 %s from the server-side check', async (cls) => {
    mockSet = () => Promise.reject(gearError(cls));
    const res = await put(buildApp(), { equipped: { face: 'shades' } });
    expect(res.status).toBe(400);
    expect(res.body.error_class).toBe(cls);
  });

  it('500 when the write fails, logged', async () => {
    mockSet = () => Promise.reject(new Error('write failed'));
    const res = await put(buildApp(), { equipped: { head: 'cap' } });
    expect(res.status).toBe(500);
    expect(res.body.error_class).toBe('CampusLookUnavailable');
    expect(JSON.parse(String(errSpy.mock.calls[0][0])).event).toBe('campus_look_save_failed');
  });

  it('403 when the campus is off, nothing saved', async () => {
    const res = await put(buildApp('off'), { equipped: { head: 'cap' } });
    expect(res.status).toBe(403);
    expect(mockSetCalls).toEqual([]);
  });

  it('403 for a read-only "view as" token, nothing saved', async () => {
    const res = await put(buildApp(), { equipped: { head: 'cap' } }, token({ read_only: true, impersonated_by: 'admin-1' }));
    expect(res.status).toBe(403);
    expect(mockSetCalls).toEqual([]);
  });

  it('two concurrent PUTs both answer; the service is called once each (last writer wins in the upsert)', async () => {
    const app = buildApp();
    const [a, b] = await Promise.all([put(app, { equipped: { head: 'cap' } }), put(app, { equipped: {} })]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(mockSetCalls).toHaveLength(2);
  });
});

describe('the presence contract refuses a ride', () => {
  it('a person entry with gear.ride fails the response schema', () => {
    let schema: { safeParse: (v: unknown) => { success: boolean } } | undefined;
    jest.isolateModules(() => { schema = require('../campusRoutes').CampusPresenceResponse; });
    const ok = { areas: { library: { count: 1, people: [{ enrollment_id: 'a', display_name: 'A', avatar_url: null, can_message: true, rung_name: 'AI Aware I', gear: { head: 'cap' } }] } } };
    const ride = { areas: { library: { count: 1, people: [{ enrollment_id: 'a', display_name: 'A', avatar_url: null, can_message: true, gear: { head: 'cap', ride: 'cruiser' } }] } } };
    expect(schema!.safeParse(ok).success).toBe(true);
    expect(schema!.safeParse(ride).success).toBe(false);
  });
});
