// Unmocked I/O inside a route test slows the 401 path (see broadcastRoutes.test.ts); mocked so
// this suite tests routing and nothing else.
jest.mock('../../middlewares/authFailureLog', () => ({
  logAuthFailure: jest.fn(),
  describeCaller: () => ({ forwarded_for: null, user_agent: null }),
}));

// The presence service is mocked so these tests cover routing, gating and validation only. The
// factory delegates to outer `mock*` fns so every isolateModules registry shares them.
const mockTouch = jest.fn();
const mockGetPresence = jest.fn();
jest.mock('../../services/campus/campusPresenceService', () => ({
  touchCampusArea: (...a: unknown[]) => mockTouch(...a),
  getCampusPresence: (...a: unknown[]) => mockGetPresence(...a),
}));
const mockGetDesks = jest.fn();
jest.mock('../../services/campus/campusStaffDesks', () => ({ getStaffDesks: (...a: unknown[]) => mockGetDesks(...a) }));
const mockWave = jest.fn();
jest.mock('../../services/campus/campusWave', () => ({ waveAt: (...a: unknown[]) => mockWave(...a) }));
// C7: the tour route loads the audience rule and the handoff writer; mocked here (campusTourRoute.test covers them) so each
// isolated router stays cheap to load.
jest.mock('../../services/campus/campusAudience', () => ({ campusAudienceFor: jest.fn() }));
jest.mock('../../services/campus/campusTourHandoff', () => ({ requestTourHandoff: jest.fn() }));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
// Type-only, and load-bearing: the req.participant augmentation lives in participantAuth.ts.
import type { ParticipantPayload } from '../../middlewares/participantAuth';

// config/env is not imported at the top: it reads CAMPUS_* at eval time and they vary per test.
const SECRET = ['campus', 'router', 'secret'].join('-');
process.env.JWT_SECRET = SECRET;
const URL = '/api/portal/campus/flags';

function token(extra: Partial<ParticipantPayload> = {}): string {
  return jwt.sign({ sub: 'enr-1', email: 'learner@example.com', cohort_id: 'coh-1', role: 'participant', ...extra }, SECRET);
}

type CampusEnv = { CAMPUS_ENABLED?: string; CAMPUS_ENROLLMENT_IDS?: string; CAMPUS_COHORT_IDS?: string };
const KEYS = ['CAMPUS_ENABLED', 'CAMPUS_ENROLLMENT_IDS', 'CAMPUS_COHORT_IDS'] as const;

/** A fresh module registry per app so config/env re-reads the campus variables. */
function buildApp(vars: CampusEnv = {}): express.Express {
  const prev: Record<string, string | undefined> = {};
  for (const k of KEYS) { prev[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  let router: express.Router = express.Router();
  jest.isolateModules(() => { router = require('../campusRoutes').default as express.Router; });
  for (const k of KEYS) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; }
  const app = express();
  app.use(express.json());
  app.use(router);
  return app;
}

describe('GET /api/portal/campus/flags', () => {
  // The first isolateModules() require pays the cold load of config/env and the auth chain
  // (measured over 5 s on a cold Windows checkout). Paid here, so no test's own budget absorbs it.
  beforeAll(() => { buildApp(); }, 120_000);

  it('401s without a token and never reveals the flag', async () => {
    const res = await request(buildApp({ CAMPUS_ENABLED: 'all' })).get(URL);
    expect(res.status).toBe(401);
    expect(res.body.campus).toBeUndefined();
  });

  it('401s a token signed with the wrong secret', async () => {
    const bad = jwt.sign({ sub: 'enr-1', cohort_id: 'coh-1', role: 'participant' }, 'not-the-secret');
    const res = await request(buildApp({ CAMPUS_ENABLED: 'all' })).get(URL).set('Authorization', `Bearer ${bad}`);
    expect(res.status).toBe(401);
  });

  it('answers {campus:false} with the flag unset (the production default)', async () => {
    const res = await request(buildApp()).get(URL).set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ campus: false });
  });

  it('answers true for an allowlisted enrollment and false for another learner', async () => {
    const app = buildApp({ CAMPUS_ENABLED: 'allowlist', CAMPUS_ENROLLMENT_IDS: 'enr-1' });
    expect((await request(app).get(URL).set('Authorization', `Bearer ${token()}`)).body).toEqual({ campus: true });
    expect((await request(app).get(URL).set('Authorization', `Bearer ${token({ sub: 'enr-2' })}`)).body).toEqual({ campus: false });
  });

  it('answers true for an allowlisted cohort', async () => {
    const app = buildApp({ CAMPUS_ENABLED: 'allowlist', CAMPUS_COHORT_IDS: 'coh-1' });
    expect((await request(app).get(URL).set('Authorization', `Bearer ${token({ sub: 'enr-9' })}`)).body).toEqual({ campus: true });
  });

  it('answers true for everyone in "all" mode', async () => {
    const res = await request(buildApp({ CAMPUS_ENABLED: 'all' })).get(URL).set('Authorization', `Bearer ${token({ sub: 'enr-77', cohort_id: 'coh-77' })}`);
    expect(res.body).toEqual({ campus: true });
  });

  it('lets a read-only "view as member" token read it, so an admin sees what the learner sees', async () => {
    const app = buildApp({ CAMPUS_ENABLED: 'allowlist', CAMPUS_ENROLLMENT_IDS: 'enr-1' });
    const res = await request(app).get(URL).set('Authorization', `Bearer ${token({ read_only: true, impersonated_by: 'admin-1' })}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ campus: true });
  });

  it('refuses writes: the route is GET only', async () => {
    const res = await request(buildApp({ CAMPUS_ENABLED: 'all' })).post(URL).set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/portal/campus/here (C4)', () => {
  const HERE = '/api/portal/campus/here';
  beforeEach(() => { mockTouch.mockReset(); mockTouch.mockResolvedValue(undefined); });

  it('401s without a token', async () => {
    expect((await request(buildApp({ CAMPUS_ENABLED: 'all' })).post(HERE).send({ area: 'library' })).status).toBe(401);
    expect(mockTouch).not.toHaveBeenCalled();
  });

  it('not in the pilot: 204 and nothing written', async () => {
    const res = await request(buildApp()).post(HERE).set('Authorization', `Bearer ${token()}`).send({ area: 'library' });
    expect(res.status).toBe(204);
    expect(mockTouch).not.toHaveBeenCalled();
  });

  it('unknown area: 400 UnknownCampusArea and nothing written', async () => {
    const res = await request(buildApp({ CAMPUS_ENABLED: 'all' })).post(HERE).set('Authorization', `Bearer ${token()}`).send({ area: 'dungeon' });
    expect(res.status).toBe(400);
    expect(res.body.error_class).toBe('UnknownCampusArea');
    expect(mockTouch).not.toHaveBeenCalled();
  });

  it('malformed or extra body fields: 400 and nothing written (the body cannot name an enrollment)', async () => {
    const app = buildApp({ CAMPUS_ENABLED: 'all' });
    expect((await request(app).post(HERE).set('Authorization', `Bearer ${token()}`).send({})).status).toBe(400);
    expect((await request(app).post(HERE).set('Authorization', `Bearer ${token()}`).send({ area: 'library', enrollment_id: 'someone-else' })).status).toBe(400);
    expect(mockTouch).not.toHaveBeenCalled();
  });

  it('valid area in the pilot: records it for the TOKEN enrollment only', async () => {
    const res = await request(buildApp({ CAMPUS_ENABLED: 'allowlist', CAMPUS_ENROLLMENT_IDS: 'enr-1' })).post(HERE).set('Authorization', `Bearer ${token()}`).send({ area: 'library' });
    expect(res.status).toBe(204);
    expect(mockTouch).toHaveBeenCalledWith('enr-1', 'library');
  });

  it('a read-only "view as" token cannot write', async () => {
    const res = await request(buildApp({ CAMPUS_ENABLED: 'all' })).post(HERE).set('Authorization', `Bearer ${token({ read_only: true, impersonated_by: 'admin-1' })}`).send({ area: 'library' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(mockTouch).not.toHaveBeenCalled();
  });

  it('a storage failure answers 500 CampusPresenceUnavailable', async () => {
    mockTouch.mockRejectedValue(new Error('db down'));
    const res = await request(buildApp({ CAMPUS_ENABLED: 'all' })).post(HERE).set('Authorization', `Bearer ${token()}`).send({ area: 'library' });
    expect(res.status).toBe(500);
    expect(res.body.error_class).toBe('CampusPresenceUnavailable');
  });
});

describe('GET /api/portal/campus/presence (C4)', () => {
  const PRES = '/api/portal/campus/presence';
  const sample = { areas: { library: { count: 3, people: [{ enrollment_id: 'enr-2', display_name: 'Mia', avatar_url: null, can_message: true }, { anonymous: true }] } } };
  beforeEach(() => { mockGetPresence.mockReset(); mockGetPresence.mockResolvedValue(sample); });

  it('401s without a token', async () => {
    expect((await request(buildApp({ CAMPUS_ENABLED: 'all' })).get(PRES)).status).toBe(401);
    expect(mockGetPresence).not.toHaveBeenCalled();
  });

  it('not in the pilot: 403 CampusNotEnabled and no lookup', async () => {
    const res = await request(buildApp()).get(PRES).set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(403);
    expect(res.body.error_class).toBe('CampusNotEnabled');
    expect(mockGetPresence).not.toHaveBeenCalled();
  });

  it('in the pilot: returns the presence for this viewer and cohort, shape validated', async () => {
    const res = await request(buildApp({ CAMPUS_ENABLED: 'all' })).get(PRES).set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(sample);
    expect(mockGetPresence).toHaveBeenCalledWith('enr-1', 'coh-1');
  });

  it('a read-only "view as" token may read (an admin sees the learner\'s view)', async () => {
    const res = await request(buildApp({ CAMPUS_ENABLED: 'all' })).get(PRES).set('Authorization', `Bearer ${token({ read_only: true, impersonated_by: 'admin-1' })}`);
    expect(res.status).toBe(200);
  });

  it('a service failure answers 500 CampusPresenceUnavailable (never an empty campus)', async () => {
    mockGetPresence.mockRejectedValue(new Error('pg_type race'));
    const res = await request(buildApp({ CAMPUS_ENABLED: 'all' })).get(PRES).set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(500);
    expect(res.body.error_class).toBe('CampusPresenceUnavailable');
  });

  it('a response that breaks the contract fails loud outside production', async () => {
    mockGetPresence.mockResolvedValue({ areas: { library: { count: 1, people: [{ enrollment_id: 'x', display_name: 'X', avatar_url: null, can_message: true, role: 'student' }] } } });
    const res = await request(buildApp({ CAMPUS_ENABLED: 'all' })).get(PRES).set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(500);
  });
});

describe('GET /api/portal/campus/staff-desks (C5)', () => {
  const DESKS = '/api/portal/campus/staff-desks';
  const reese = { id: 'reese', name: 'Reese', title: 'Mentor desk', building: 'commons', ai: true, on_duty: true, enrollment_id: 'r-1', opens: null, prompts: ['Q1', 'Q2', 'Q3'] };
  beforeEach(() => { mockGetDesks.mockReset(); mockGetDesks.mockResolvedValue({ audience: 'member', desks: [reese] }); });

  it('401s without a token', async () => {
    expect((await request(buildApp({ CAMPUS_ENABLED: 'all' })).get(DESKS)).status).toBe(401);
  });
  it('403 CampusNotEnabled outside the pilot, and the service is never asked', async () => {
    const res = await request(buildApp({})).get(DESKS).set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(403);
    expect(res.body.error_class).toBe('CampusNotEnabled');
    expect(mockGetDesks).not.toHaveBeenCalled();
  });
  it('in the pilot: the desks for THIS enrollment (from the token), without the audience', async () => {
    const res = await request(buildApp({ CAMPUS_ENABLED: 'all' })).get(DESKS).set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ desks: [reese] });
    expect(mockGetDesks).toHaveBeenCalledWith('enr-1');
  });
  it('a service failure answers 500 CampusStaffDesksUnavailable', async () => {
    mockGetDesks.mockRejectedValue(new TypeError('db down'));
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await request(buildApp({ CAMPUS_ENABLED: 'all' })).get(DESKS).set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(500);
    expect(res.body.error_class).toBe('CampusStaffDesksUnavailable');
    err.mockRestore();
  });
  it('a desk that breaks the contract fails loud outside production', async () => {
    mockGetDesks.mockResolvedValue({ audience: 'member', desks: [{ ...reese, avatar: 'x.png' }] });
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await request(buildApp({ CAMPUS_ENABLED: 'all' })).get(DESKS).set('Authorization', `Bearer ${token()}`)).status).toBe(500);
    err.mockRestore();
  });
});

describe('POST /api/portal/campus/wave (C5)', () => {
  const WAVE = '/api/portal/campus/wave';
  const TO = '6f1c2a5e-8b1d-4c3e-9a7f-1b2c3d4e5f60';
  beforeEach(() => { mockWave.mockReset(); mockWave.mockResolvedValue({ sent: true, reason: 'sent', roomId: 'room-1' }); });
  const post = (vars: CampusEnv, body: unknown, tok = token()) => request(buildApp(vars)).post(WAVE).set('Authorization', `Bearer ${tok}`).send(body as object);

  it('401s without a token', async () => {
    expect((await request(buildApp({ CAMPUS_ENABLED: 'all' })).post(WAVE).send({ to: TO })).status).toBe(401);
  });
  it('a read-only "view as" token cannot wave', async () => {
    const res = await post({ CAMPUS_ENABLED: 'all' }, { to: TO }, token({ read_only: true, impersonated_by: 'admin-1' }));
    expect(res.status).toBe(403);
    expect(mockWave).not.toHaveBeenCalled();
  });
  it('403 CampusNotEnabled outside the pilot; nothing sent', async () => {
    const res = await post({}, { to: TO });
    expect(res.status).toBe(403);
    expect(res.body.error_class).toBe('CampusNotEnabled');
    expect(mockWave).not.toHaveBeenCalled();
  });
  it.each([[{}], [{ to: 'not-a-uuid' }], [{ to: TO, from: TO }]])('400 for a malformed body %j', async (body) => {
    const res = await post({ CAMPUS_ENABLED: 'all' }, body);
    expect(res.status).toBe(400);
    expect(mockWave).not.toHaveBeenCalled();
  });
  it('in the pilot: waves as the token enrollment and cohort', async () => {
    const res = await post({ CAMPUS_ENABLED: 'all' }, { to: TO });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sent: true, reason: 'sent', roomId: 'room-1' });
    expect(mockWave).toHaveBeenCalledWith('enr-1', 'coh-1', TO);
  });
  it('already waved: 200 with sent false', async () => {
    mockWave.mockResolvedValue({ sent: false, reason: 'already_waved', roomId: 'room-1' });
    expect((await post({ CAMPUS_ENABLED: 'all' }, { to: TO })).body).toMatchObject({ sent: false, reason: 'already_waved' });
  });
  it('the DM rule refusal keeps its usual text as 400 DmNotAllowed', async () => {
    const e = new Error('You can only message people in your cohort'); e.name = 'DmError';
    mockWave.mockRejectedValue(e);
    const res = await post({ CAMPUS_ENABLED: 'all' }, { to: TO });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'You can only message people in your cohort', error_class: 'DmNotAllowed' });
  });
  it('waving at AI staff: 400 with its own error class', async () => {
    const e = Object.assign(new Error('AI staff answer questions'), { name: 'WaveError', error_class: 'WaveToAiStaff' });
    mockWave.mockRejectedValue(e);
    expect((await post({ CAMPUS_ENABLED: 'all' }, { to: TO })).body.error_class).toBe('WaveToAiStaff');
  });
  it('an unexpected failure: 500 CampusWaveUnavailable', async () => {
    mockWave.mockRejectedValue(new TypeError('db down'));
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await post({ CAMPUS_ENABLED: 'all' }, { to: TO });
    expect(res.status).toBe(500);
    expect(res.body.error_class).toBe('CampusWaveUnavailable');
    err.mockRestore();
  });
});
