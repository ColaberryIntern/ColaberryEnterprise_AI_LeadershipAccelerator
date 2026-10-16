// Unmocked I/O inside a route test slows the 401 path (see broadcastRoutes.test.ts); mocked so
// this suite tests routing and nothing else.
jest.mock('../../middlewares/authFailureLog', () => ({
  logAuthFailure: jest.fn(),
  describeCaller: () => ({ forwarded_for: null, user_agent: null }),
}));

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
