/**
 * T023 area 3 — every Case Study admin route is behind `requireAdmin` AND the
 * management section gate.
 *
 * WHY BOTH, AND WHY PROVED SEPARATELY. `requireAdmin` only asks "is this a valid
 * token whose role is admin". Bridge-minted staff tokens are minted WITH role
 * `admin` precisely so they pass it, so `requireAdmin` alone caps nobody: a
 * support login would sail through every Case Study route. `mgmtSectionGate` is
 * what actually scopes them, and it is DENY-BY-DEFAULT for scoped roles — a
 * prefix missing from its `PATH_SECTION` table means legacy admin works, the
 * feature looks fine, and every scoped management login 403s.
 *
 * The suite therefore proves three separate things and does not let any one of
 * them stand in for another:
 *   1. the guard is on every route, by function IDENTITY not by name;
 *   2. an unauthenticated request to each concrete path is refused, through the
 *      REAL mount order (`adminRoutes` → `caseStudyAdminRoutes`);
 *   3. the section mapping resolves for every path shape the routes can produce,
 *      and a scoped role that lacks `program` is actually refused.
 *
 * A 401 DOES NOT PROVE A ROUTE EXISTS in this codebase — everything under
 * `/api/` falls into `adminRoutes` and meets somebody's `requireAdmin`. That is
 * why (1) reads the router stack rather than inferring mounting from a status
 * code.
 */
/*
 * WHAT IS MOCKED AND WHY. The two middlewares under test — `authMiddleware` and
 * `mgmtSectionGate` — are NEVER mocked; mocking either would make this suite
 * assert on itself. What is mocked is `config/env` (so the signing secret is
 * known), the Case Study services (so importing the router does not drag in the
 * 1000-line Sequelize model graph and reach for a database) and `aiEventService`
 * (fire-and-forget auth telemetry that would otherwise touch a model).
 */
jest.mock('../../config/env', () => ({ env: { jwtSecret: 'test-secret', nodeEnv: 'test' } }));
jest.mock('../../services/aiEventService', () => ({ emitAiEvent: jest.fn().mockResolvedValue(undefined) }));

const svc = (): Record<string, unknown> => ({});
jest.mock('../../services/caseStudy/caseStudyRepoCollection', () => ({
  CASE_STUDY_REPO_ROLES: ['primary', 'frontend', 'backend', 'agents', 'data', 'infra', 'docs', 'evals', 'demo', 'other'],
  attachRepository: jest.fn(async () => svc()), listRepositories: jest.fn(async () => svc()),
  removeRepository: jest.fn(async () => svc()), setRepositoryRole: jest.fn(async () => svc()),
  isCaseStudyRepoError: () => false,
}));
jest.mock('../../services/caseStudy/caseStudyAdminService', () => ({
  listCaseStudies: jest.fn(async () => svc()), getCaseStudy: jest.fn(async () => svc()),
  createCaseStudyFromProject: jest.fn(async () => svc()), createCaseStudyFromRepoCollection: jest.fn(async () => svc()),
  updateCaseStudy: jest.fn(async () => svc()), archiveCaseStudy: jest.fn(async () => svc()),
  isCaseStudyAdminError: () => false,
}));
jest.mock('../../services/caseStudy/caseStudyAdminReview', () => ({
  applyHumanOverride: jest.fn(async () => svc()), approveSnapshot: jest.fn(async () => svc()),
  listSyncRuns: jest.fn(async () => svc()), previewSurfaceProjection: jest.fn(async () => svc()),
}));
jest.mock('../../services/caseStudy/caseStudySyncService', () => ({
  syncCaseStudy: jest.fn(async () => svc()), isCaseStudySyncError: () => false,
}));
jest.mock('../../services/caseStudy/caseStudyPublicationService', () => ({
  publishCaseStudy: jest.fn(async () => svc()), unpublishCaseStudy: jest.fn(async () => svc()),
  isCaseStudyPublicationError: () => false,
}));
jest.mock('../../services/caseStudy/caseStudyProjectSource', () => ({ isCaseStudyProjectSourceError: () => false }));
jest.mock('../../services/caseStudy/caseStudyEvidenceSource', () => ({ isCaseStudyEvidenceSourceError: () => false }));

/* eslint-disable import/first */
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { mgmtSectionGate, pathToSection } from '../../middlewares/mgmtSectionGate';
import caseStudyAdminRoutes from '../admin/caseStudyAdminRoutes';
/* eslint-enable import/first */

const JWT_SECRET = 'test-secret';

/* ------------------------------------------------------- router inspection --- */

interface DeclaredRoute {
  readonly method: string;
  readonly path: string;
  readonly handlerNames: string[];
  readonly guarded: boolean;
}

/** Read the routes the router actually declares, with their handler chain. */
function declaredRoutes(): DeclaredRoute[] {
  const stack = (caseStudyAdminRoutes as unknown as {
    stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: unknown; name?: string }> } }>;
  }).stack;
  const out: DeclaredRoute[] = [];
  for (const layer of stack) {
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods)) {
      out.push({
        method: method.toUpperCase(),
        path: layer.route.path,
        handlerNames: layer.route.stack.map((h) => (h.name || '(anonymous)')),
        // Identity comparison. A middleware merely NAMED `requireAdmin` would
        // pass a name check and guard nothing.
        guarded: layer.route.stack.some((h) => h.handle === requireAdmin),
      });
    }
  }
  return out;
}

const ROUTES = declaredRoutes();

/** Substitute real-looking ids so a path can be requested. */
const concrete = (path: string): string => path
  .replace(':repositoryId', '11111111-1111-4111-8111-111111111111')
  .replace(':snapshotId', '22222222-2222-4222-8222-222222222222')
  .replace(':id', '33333333-3333-4333-8333-333333333333');

/* --------------------------------------------------------------- the app --- */

/**
 * The REAL mount order, reconstructed: the section gate first (as
 * `adminRoutes` does at line 101), then the Case Study sub-router. Mounting the
 * sub-router alone would test a shape that does not exist in production.
 */
function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  const admin = express.Router();
  admin.use(mgmtSectionGate);
  admin.use(caseStudyAdminRoutes);
  app.use(admin);
  // Stand-in for every sibling sub-router mounted after this one. If a Case
  // Study route ever leaked through, this would answer instead of a 401/403 and
  // the assertions below would notice.
  app.use((_req, res) => { res.status(404).json({ error: 'fell through' }); });
  return app;
}

const app = buildApp();

const token = (payload: Record<string, unknown>): string =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: '10m' });

// A real address does not belong in a fixture: the Test Plan's Checkpoint D
// rule is that no test may carry a hardcoded personal identifier, and the value
// is never asserted on — only signed into a bearer token.
const LEGACY_ADMIN = token({ sub: 'a1', email: 'admin@example.test', role: 'admin' });
const MGMT_CURRICULUM = token({ sub: 'e1', email: 'c@colaberry.com', role: 'admin', mgmt_role: 'curriculum' });
const MGMT_SUPPORT = token({ sub: 'e2', email: 's@colaberry.com', role: 'admin', mgmt_role: 'support' });
const MGMT_REVENUE = token({ sub: 'e3', email: 'r@colaberry.com', role: 'admin', mgmt_role: 'revenue' });
const NON_ADMIN = token({ sub: 'u1', email: 'student@example.com', role: 'student' });

const send = (r: express.Express, method: string, path: string, bearer?: string) => {
  const agent = request(r) as unknown as Record<string, (p: string) => request.Test>;
  const test = agent[method.toLowerCase()](path);
  return bearer ? test.set('Authorization', `Bearer ${bearer}`) : test;
};

/* ------------------------------------------------------------------ tests --- */

describe('T023 area 3.1 — the guard is on every route, by identity', () => {
  it('the router declares routes at all (the inspection is not reading an empty stack)', () => {
    expect(ROUTES.length).toBeGreaterThanOrEqual(17);
  });

  it('every declared route carries the real requireAdmin function', () => {
    const unguarded = ROUTES.filter((r) => !r.guarded)
      .map((r) => `${r.method} ${r.path} [${r.handlerNames.join(' → ')}]`);
    expect(unguarded).toEqual([]);
  });

  it('every declared path is under /api/admin/case-studies', () => {
    const stray = ROUTES.filter((r) => !r.path.startsWith('/api/admin/case-studies'));
    expect(stray.map((r) => `${r.method} ${r.path}`)).toEqual([]);
  });

  it('the router installs NO unscoped router-level middleware', () => {
    // `router.use(requireAdmin)` on a prefix-less sub-router guards every LATER
    // sibling's paths too. That is the documented outage shape in this repo.
    const stack = (caseStudyAdminRoutes as unknown as { stack: Array<{ route?: unknown }> }).stack;
    const middlewareLayers = stack.filter((l) => !l.route);
    expect(middlewareLayers).toHaveLength(0);
  });

  it('the guard check can fail (negative control)', () => {
    const fake = express.Router();
    fake.get('/api/admin/case-studies/fake', (_req, res) => { res.json({}); });
    const layer = (fake as unknown as { stack: Array<{ route: { stack: Array<{ handle: unknown }> } }> }).stack[0];
    expect(layer.route.stack.some((h) => h.handle === requireAdmin)).toBe(false);
  });
});

describe('T023 area 3.2 — every route refuses an unauthenticated caller', () => {
  it.each(ROUTES.map((r) => [r.method, r.path] as const))(
    '%s %s → 401 without a token', async (method, path) => {
      const res = await send(app, method, concrete(path));
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Authentication required' });
    },
  );

  it.each(ROUTES.map((r) => [r.method, r.path] as const))(
    '%s %s → 403 for a valid non-admin token', async (method, path) => {
      const res = await send(app, method, concrete(path), NON_ADMIN);
      expect(res.status).toBe(403);
    },
  );

  it('a forged token signed with the wrong secret is refused', async () => {
    const forged = jwt.sign({ sub: 'x', email: 'x@x', role: 'admin' }, 'not-the-secret');
    const res = await send(app, 'GET', '/api/admin/case-studies', forged);
    expect(res.status).toBe(401);
  });

  it('an expired admin token is refused', async () => {
    const expired = jwt.sign({ sub: 'x', email: 'x@x', role: 'admin' }, JWT_SECRET, { expiresIn: -60 });
    const res = await send(app, 'GET', '/api/admin/case-studies', expired);
    expect(res.status).toBe(401);
  });

  it('the "alg: none" unsigned-token attack is refused', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ sub: 'x', email: 'x@x', role: 'admin' })).toString('base64url');
    const res = await send(app, 'GET', '/api/admin/case-studies', `${header}.${body}.`);
    expect(res.status).toBe(401);
  });

  it('a token in a lower-cased scheme (bearer) is still refused, not accepted by accident', async () => {
    const res = await request(app).get('/api/admin/case-studies').set('Authorization', `bearer ${NON_ADMIN}`);
    expect([401, 403]).toContain(res.status);
  });
});

describe('T023 area 3.3 — the section gate maps every Case Study path', () => {
  it.each(ROUTES.map((r) => [r.method, r.path] as const))(
    '%s %s resolves to the program section', (_method, path) => {
      expect(pathToSection(concrete(path))).toBe('program');
    },
  );

  it('the mapping does NOT over-capture a neighbouring prefix', () => {
    // The gate matches on a segment boundary. These must not be captured.
    expect(pathToSection('/api/admin/case-studies-export')).toBeNull();
    expect(pathToSection('/api/admin/case-studiesX')).toBeNull();
    expect(pathToSection('/api/admin/case-study')).toBeNull();
  });

  it('a scoped role WITHOUT the program section is refused by the gate, not by luck', async () => {
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
      const res = await send(app, method, '/api/admin/case-studies', MGMT_SUPPORT);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('You do not have access to this section.');
    }
    const revenue = await send(app, 'GET', '/api/admin/case-studies', MGMT_REVENUE);
    expect(revenue.status).toBe(403);
  });

  it('a scoped role WITH the program section clears the gate and reaches the handler', async () => {
    // Reaching the handler is proved by the response NOT being a 401/403: the
    // route runs, validation runs, and whatever comes back is a route answer.
    const res = await send(app, 'GET', '/api/admin/case-studies?limit=notanumber', MGMT_CURRICULUM);
    expect(res.status).toBe(400);            // Zod rejected the query — the handler ran
    expect(res.body.error_class).toBe('ValidationError');
  });

  it('a legacy admin (no mgmt_role) passes the gate untouched', async () => {
    const res = await send(app, 'GET', '/api/admin/case-studies?limit=notanumber', LEGACY_ADMIN);
    expect(res.status).toBe(400);
    expect(res.body.error_class).toBe('ValidationError');
  });

  it('DEFEAT ATTEMPT — path shapes that could dodge the prefix match', async () => {
    const dodges = [
      '/api/admin/case-studies/',                       // trailing slash
      '/api/admin//case-studies',                       // doubled separator
      '/api/admin/CASE-STUDIES',                        // case change
      '/api/admin/case-studies/%2e%2e/projects',        // encoded traversal
      '/api/admin/case-studies/../settings',            // literal traversal
    ];
    const results: string[] = [];
    for (const p of dodges) {
      const res = await send(app, 'GET', p, MGMT_SUPPORT);
      results.push(`${p} → ${res.status} ${JSON.stringify(res.body)}`);
      // The requirement: a scoped role that lacks `program` must never receive a
      // 200 from any of these. 403 (gate), 401 (auth) and 404 (no such route)
      // are all acceptable refusals; 200 is not.
      expect(res.status).not.toBe(200);
    }
    // eslint-disable-next-line no-console
    console.log(['', '=== T023 area 3 defeat attempt: prefix dodges (support role) ===',
      ...results.map((r) => `  ${r}`), '=== end ===', ''].join('\n'));
  });

  it('MEASUREMENT — the declared route inventory', () => {
    // eslint-disable-next-line no-console
    console.log(['', `=== T023 area 3: ${ROUTES.length} declared Case Study admin routes ===`,
      ...ROUTES.map((r) => `  ${r.guarded ? 'requireAdmin' : 'UNGUARDED   '}  ${r.method.padEnd(6)} ${r.path}`),
      '=== end inventory ===', ''].join('\n'));
    expect(ROUTES.every((r) => r.guarded)).toBe(true);
  });
});
