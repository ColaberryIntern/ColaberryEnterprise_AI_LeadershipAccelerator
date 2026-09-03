import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

jest.mock('../../../config/env', () => ({
  env: { jwtSecret: 'test-secret', nodeEnv: 'test' },
}));

/**
 * Mocked for a specific reason, not by habit.
 *
 * `requireAdmin`'s 401 path calls `logAuthFailure`, which does a DYNAMIC
 * `import('../services/aiEventService')` — an async module load that pulls in
 * the model layer the first time a 401 occurs in the process. Unmocked, the
 * first wrong-secret assertion in this file took 875ms and failed once out of
 * five runs; with it, five runs of 86 tests are clean and that request is ~20ms.
 *
 * A flaky assertion in an AUTH test is worth chasing to its cause rather than
 * re-running until it passes. The sibling `caseStudyAdminRoutes.access.test.ts`
 * mocks the same module for the same reason.
 */
jest.mock('../../../services/aiEventService', () => ({
  emitAiEvent: jest.fn().mockResolvedValue(undefined),
}));

const overview = {
  getSummary: jest.fn(),
  getDistribution: jest.fn(),
  getLearners: jest.fn(),
};
const decisions = {
  getDecisions: jest.fn(),
  getShadow: jest.fn(),
  getContentHealth: jest.fn(),
};
const learner = {
  getLearnerProfile: jest.fn(),
  getLearnerSignals: jest.fn(),
  getLearnerScores: jest.fn(),
  getLearnerDecisions: jest.fn(),
  getEligibility: jest.fn(),
};
const why = { getExplorerWhyByDecision: jest.fn() };

jest.mock('../../../services/explorerGrowth/explorerOverviewService', () => overview);
jest.mock('../../../services/explorerGrowth/explorerDecisionsService', () => decisions);
jest.mock('../../../services/explorerGrowth/explorerLearnerService', () => learner);
jest.mock('../../../services/explorerGrowth/explorerWhyService', () => why);

import explorerGrowthRoutes from '../explorerGrowthRoutes';

/**
 * The Command Center's twelve read routes.
 *
 * The guard is REAL. `requireAdmin` is not mocked and neither is the router —
 * only the services behind them — so a 401 here is the actual middleware
 * refusing an actual request. Mocking the guard would leave this file asserting
 * that a mock returns what it was told to.
 *
 * §27 lists fourteen GETs; twelve are in scope. `/forecast` and `/experiments`
 * are EPIC 12's and are asserted ABSENT rather than silently skipped.
 */

const BASE = '/api/admin/explorer-growth';
const ID = '3f7c1e90-2b4a-4d55-9a1e-6c8b0d2f4a71';
const BAD = 'not-a-uuid';

const token = (role = 'admin') =>
  jwt.sign({ sub: 'staff-1', email: 'staff@colaberry.com', role }, 'test-secret');

function app() {
  const a = express();
  a.use(explorerGrowthRoutes);
  return a;
}

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token()}`);

/**
 * Every in-scope route.
 *
 * `badInput` is null only for `/summary`, which takes no input and therefore
 * cannot answer 400 — the hedge is deliberate rather than an oversight.
 * `notFound` names WHICH lookup 404s, because a learner id and a decision id are
 * different identifiers against different tables.
 */
const ROUTES: {
  name: string;
  path: string;
  badInput: string | null;
  notFound: 'learner' | 'decision' | null;
}[] = [
  { name: 'summary', path: `${BASE}/summary`, badInput: null, notFound: null },
  { name: 'distribution', path: `${BASE}/distribution`, badInput: `${BASE}/distribution?days=0`, notFound: null },
  { name: 'learners', path: `${BASE}/learners`, badInput: `${BASE}/learners?limit=500`, notFound: null },
  { name: 'learner', path: `${BASE}/learners/${ID}`, badInput: `${BASE}/learners/${BAD}`, notFound: 'learner' },
  { name: 'signals', path: `${BASE}/learners/${ID}/signals`, badInput: `${BASE}/learners/${BAD}/signals`, notFound: 'learner' },
  { name: 'learner decisions', path: `${BASE}/learners/${ID}/decisions`, badInput: `${BASE}/learners/${BAD}/decisions`, notFound: 'learner' },
  { name: 'scores', path: `${BASE}/learners/${ID}/scores`, badInput: `${BASE}/learners/${BAD}/scores`, notFound: 'learner' },
  { name: 'decisions', path: `${BASE}/decisions`, badInput: `${BASE}/decisions?executed=maybe`, notFound: null },
  { name: 'why', path: `${BASE}/decisions/${ID}`, badInput: `${BASE}/decisions/${BAD}`, notFound: 'decision' },
  { name: 'shadow', path: `${BASE}/shadow`, badInput: `${BASE}/shadow?date=2026-02-30`, notFound: null },
  { name: 'content', path: `${BASE}/content`, badInput: `${BASE}/content?limit=0`, notFound: null },
  { name: 'eligibility', path: `${BASE}/eligibility/${ID}`, badInput: `${BASE}/eligibility/${BAD}`, notFound: 'learner' },
];

/** Every service returns something, so a 200 means the route reached its service. */
function serveAll() {
  overview.getSummary.mockResolvedValue({ total: 153 });
  overview.getDistribution.mockResolvedValue({ today: [], trend: [], overlays: [] });
  overview.getLearners.mockResolvedValue({ rows: [], total: 0, limit: 50, offset: 0 });
  decisions.getDecisions.mockResolvedValue({ rows: [], total: 0, limit: 50, offset: 0 });
  decisions.getShadow.mockResolvedValue({ rows: [], total: 0, limit: 50, offset: 0 });
  decisions.getContentHealth.mockResolvedValue({ total: 646 });
  learner.getLearnerProfile.mockResolvedValue({ enrollment_id: ID });
  learner.getLearnerSignals.mockResolvedValue({ enrollment_id: ID, series: [] });
  learner.getLearnerScores.mockResolvedValue({ enrollment_id: ID, series: [] });
  learner.getLearnerDecisions.mockResolvedValue({ rows: [], total: 0, limit: 50, offset: 0 });
  learner.getEligibility.mockResolvedValue({ enrollment_id: ID });
  why.getExplorerWhyByDecision.mockResolvedValue({ found: true, enrollment_id: ID });
}

beforeEach(() => {
  jest.clearAllMocks();
  serveAll();
});

describe('the route table is the twelve in scope', () => {
  it('has exactly twelve entries', () => {
    // Pinned to a number so adding a route without a test fails a count
    // assertion rather than passing silently. §27 lists 14; two are EPIC 12's.
    expect(ROUTES).toHaveLength(12);
  });
});

describe('401 unauthenticated — all twelve, no representative sample', () => {
  it.each(ROUTES)('$name refuses an unauthenticated request', async ({ path }) => {
    const res = await request(app()).get(path);
    expect(res.status).toBe(401);
  });

  it.each(ROUTES)('$name refuses a token signed with the wrong secret', async ({ path }) => {
    const forged = jwt.sign({ sub: 'x', email: 'x@y.z', role: 'admin' }, 'wrong-secret');
    const res = await request(app()).get(path).set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it.each(ROUTES)('$name refuses a non-admin role with 403', async ({ path }) => {
    const res = await request(app()).get(path).set('Authorization', `Bearer ${token('student')}`);
    expect(res.status).toBe(403);
  });

  it('reaches no service when unauthenticated', async () => {
    await request(app()).get(`${BASE}/summary`);
    expect(overview.getSummary).not.toHaveBeenCalled();
  });
});

describe('200 authorised', () => {
  it.each(ROUTES)('$name answers 200 for an admin', async ({ path }) => {
    const res = await auth(request(app()).get(path));
    expect(res.status).toBe(200);
  });
});

describe('400 on malformed input', () => {
  const withInput = ROUTES.filter((r) => r.badInput !== null);

  it('covers eleven of the twelve — /summary takes no input', () => {
    expect(withInput).toHaveLength(11);
    expect(ROUTES.find((r) => r.badInput === null)!.name).toBe('summary');
  });

  it.each(withInput)('$name rejects malformed input', async ({ badInput }) => {
    const res = await auth(request(app()).get(badInput!));
    expect(res.status).toBe(400);
  });

  it('never reaches the service on a 400', async () => {
    // The whole point of validating first: a malformed id that reaches a query
    // becomes `WHERE enrollment_id = 'garbage'`, returns nothing, and gets
    // reported as 404 — "no such learner" rather than "that is not an id".
    await auth(request(app()).get(`${BASE}/learners/${BAD}`));
    expect(learner.getLearnerProfile).not.toHaveBeenCalled();
  });

  it('names the offending field', async () => {
    const res = await auth(request(app()).get(`${BASE}/learners?limit=500`));
    expect(res.body.details?.[0]?.path).toBe('limit');
  });
});

describe('404 — qualified by which identifier the route takes', () => {
  const learnerRoutes = ROUTES.filter((r) => r.notFound === 'learner');
  const decisionRoutes = ROUTES.filter((r) => r.notFound === 'decision');
  const noIdRoutes = ROUTES.filter((r) => r.notFound === null);

  it('splits five learner-id, one decision-id, six with no id', () => {
    expect(learnerRoutes).toHaveLength(5);
    expect(decisionRoutes).toHaveLength(1);
    expect(noIdRoutes).toHaveLength(6);
    expect(learnerRoutes.length + decisionRoutes.length + noIdRoutes.length).toBe(12);
  });

  it.each(learnerRoutes)('$name 404s on an unknown learner', async ({ path }) => {
    learner.getLearnerProfile.mockResolvedValue(null);
    learner.getLearnerSignals.mockResolvedValue(null);
    learner.getLearnerScores.mockResolvedValue(null);
    learner.getLearnerDecisions.mockResolvedValue(null);
    learner.getEligibility.mockResolvedValue(null);
    const res = await auth(request(app()).get(path));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('No such learner');
  });

  it('the Why route 404s on an unknown DECISION, not an unknown learner', async () => {
    why.getExplorerWhyByDecision.mockResolvedValue(null);
    const res = await auth(request(app()).get(`${BASE}/decisions/${ID}`));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('No such decision');
  });

  it.each(noIdRoutes)('$name has no 404 to give and answers 200', async ({ path }) => {
    // A collection route with no matches returns an empty page, not 404.
    const res = await auth(request(app()).get(path));
    expect(res.status).toBe(200);
  });
});

describe('EPIC 12 routes are absent, not stubbed', () => {
  it.each(['/forecast', '/experiments'])('%s is not registered', async (p) => {
    // Asserted rather than skipped, so they cannot appear without a deliberate
    // change. An endpoint that returns nothing is worse than no endpoint.
    const res = await auth(request(app()).get(`${BASE}${p}`));
    expect(res.status).toBe(404);
    expect(res.body.error).toBeUndefined(); // Express's 404, not a handler's
  });
});

describe('READ-ONLY — the router registers no mutating verb', () => {
  const stack = (explorerGrowthRoutes as unknown as { stack: { route?: { methods: Record<string, boolean> } }[] })
    .stack;

  it.each(['post', 'put', 'patch', 'delete'])('registers no %s route', (verb) => {
    const found = stack.filter((l) => l.route?.methods?.[verb]);
    expect(found).toHaveLength(0);
  });

  it('registers exactly twelve GETs', () => {
    const gets = stack.filter((l) => l.route?.methods?.get);
    expect(gets).toHaveLength(12);
  });

  it('rejects a POST to a real path', async () => {
    const res = await auth(request(app()).post(`${BASE}/summary`) as unknown as request.Test);
    expect(res.status).toBe(404);
  });
});

describe('a rejected service answers 500 — it does not hang, and it does not kill the process', () => {
  /** Every route's service call, so the failure path is proven per route, not once. */
  const REJECTORS: Record<string, jest.Mock> = {
    summary: overview.getSummary,
    distribution: overview.getDistribution,
    learners: overview.getLearners,
    learner: learner.getLearnerProfile,
    signals: learner.getLearnerSignals,
    'learner decisions': learner.getLearnerDecisions,
    scores: learner.getLearnerScores,
    decisions: decisions.getDecisions,
    why: why.getExplorerWhyByDecision,
    shadow: decisions.getShadow,
    content: decisions.getContentHealth,
    eligibility: learner.getEligibility,
  };

  it('covers all twelve routes', () => {
    expect(Object.keys(REJECTORS)).toHaveLength(12);
  });

  it.each(ROUTES)('$name answers 500 when its service rejects', async ({ name, path }) => {
    // Express 4 does NOT catch a rejected promise from an async handler. Without
    // the controller's try/catch this request sends no response at all and the
    // rejection escapes to the process — where production runs with Node's
    // default `--unhandled-rejections=throw` and no listener, so the whole
    // backend container dies and restarts. A DB blip on an admin page nobody is
    // watching becomes a total outage.
    REJECTORS[name].mockRejectedValue(new Error('DB down'));
    const res = await auth(request(app()).get(path));
    expect(res.status).toBe(500);
  });

  it('classifies the error rather than returning a bare message', async () => {
    overview.getSummary.mockRejectedValue(new Error('connect ETIMEDOUT'));
    const res = await auth(request(app()).get(`${BASE}/summary`));
    expect(res.body.error_class).toBeDefined();
    expect(typeof res.body.error_class).toBe('string');
  });

  it('does not leak the payload or the learner email into the response', async () => {
    // The error body must carry a class and a generic message, never the row
    // that failed — these payloads carry `email_normalized`.
    learner.getLearnerProfile.mockRejectedValue(new Error('boom learner@example.com'));
    const res = await auth(request(app()).get(`${BASE}/learners/${ID}`));
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('learner@example.com');
  });

  it('a 500 on one route leaves the others answering', async () => {
    // Proves the failure is scoped to the request. If the rejection escaped, the
    // process would be gone and this second call could not succeed.
    overview.getSummary.mockRejectedValue(new Error('DB down'));
    const bad = await auth(request(app()).get(`${BASE}/summary`));
    const good = await auth(request(app()).get(`${BASE}/content`));
    expect(bad.status).toBe(500);
    expect(good.status).toBe(200);
  });
});

describe('the guard is path-scoped, not applied to every later route', () => {
  it('does not 401 a sibling public path mounted after it', async () => {
    // A bare `router.use(requireAdmin)` applies to everything registered after
    // this router. That has caused two production outages here, most recently
    // calendar booking 401ing for logged-out visitors.
    const a = express();
    a.use(explorerGrowthRoutes);
    a.get('/api/public/anything', (_req, res) => res.json({ ok: true }));
    const res = await request(a).get('/api/public/anything');
    expect(res.status).toBe(200);
  });
});
