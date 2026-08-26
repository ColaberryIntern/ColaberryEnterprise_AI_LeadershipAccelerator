/**
 * Story Studio router — the authorization proof that did not exist.
 *
 * THE HOLE THIS CLOSES IS IN THE DEFENCE, NOT IN THE CODE.
 *
 * Every route in `caseStudyStudioRoutes.ts` really does carry `requireAdmin`,
 * and did before this file was written. What was missing is anything that would
 * NOTICE if one stopped. Checkpoint D's audit measured the gap precisely:
 *
 *   · `caseStudyAdminGuardProof.test.ts:70` imports `caseStudyAdminRoutes` and
 *     only that. It never loads this router, so its per-route identity check —
 *     the strongest assertion in the feature — covers 17 routes and not these.
 *   · `caseStudyAdminRoutes.paths.test.ts`, `caseStudyAdminRoutes.access.test.ts`
 *     and `caseStudySurfaceLabGate.test.ts` are scoped to the sibling router too.
 *   · `caseStudyStoryStudio.test.ts` is the one suite that reads this file, and
 *     it reads it as SOURCE TEXT to assert what the Studio may not do. It never
 *     mentions `requireAdmin`.
 *   · The CI backstop, `scripts/lint-route-auth.js:31-34`, is
 *     `src.includes('requireAdmin')` at FILE granularity. One surviving
 *     occurrence anywhere in a 421-line file satisfies it.
 *
 * Consequence, verified by mutation before this file was written: delete
 * `requireAdmin` from fifteen of the sixteen routes and the lint passes, the
 * type-check passes, and the whole backend suite stays green. The property
 * "every Story Studio route is guarded" was true, unproven and undefended —
 * which is the condition CLAUDE.md's Definition of Done calls incomplete, and
 * the Test Plan calls "a test that has never been seen red".
 *
 * The check is BY FUNCTION IDENTITY (`h.handle === requireAdmin`), never by
 * name, for the reason the sibling states: a middleware merely named
 * `requireAdmin` would pass a name check and guard nothing.
 */

/* eslint-disable import/first */
// `databaseUrl` is present because the router's import chain reaches
// `caseStudyAdminStore` -> `models` -> `config/database`, which CONSTRUCTS a
// Sequelize instance at module load. It never connects: nothing in this suite
// reaches a handler body.
jest.mock('../../../config/env', () => ({
  env: {
    jwtSecret: 'test-secret',
    nodeEnv: 'test',
    databaseUrl: 'postgres://mock:mock@localhost:5432/mock',
  },
}));

// The service layer is mocked so importing the router cannot reach a database.
// None of these are ever called: `requireAdmin` is the first handler on every
// route, so an unauthorized request is refused before the handler body runs —
// which is itself one of the things asserted below.
jest.mock('../../../services/caseStudy/caseStudyStoryline', () => ({
  clearStoryline: jest.fn(), getStoryline: jest.fn(), saveStoryline: jest.fn(),
}));
jest.mock('../../../services/caseStudy/caseStudyRepoProof', () => ({ proveRepository: jest.fn() }));
jest.mock('../../../services/caseStudy/caseStudyStoryDraftGenerator', () => ({ generateStoryDraft: jest.fn() }));
jest.mock('../../../services/caseStudy/caseStudyAiDraftStore', () => ({
  listDrafts: jest.fn(), promoteDraft: jest.fn(), proposeDrafts: jest.fn(), rejectDraft: jest.fn(),
}));
jest.mock('../../../services/caseStudy/caseStudyArtifactPromotion', () => ({
  listArtifacts: jest.fn(), setArtifactStatus: jest.fn(),
}));
jest.mock('../../../services/caseStudy/caseStudyChartService', () => ({
  listCharts: jest.fn(), resolveChart: jest.fn(), saveChart: jest.fn(), setChartApproval: jest.fn(),
}));
jest.mock('../../../services/caseStudy/caseStudyQuoteService', () => ({
  createQuote: jest.fn(), listQuotes: jest.fn(), setQuoteApproval: jest.fn(),
}));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { requireAdmin } from '../../../middlewares/authMiddleware';
import caseStudyStudioRoutes from '../caseStudyStudioRoutes';
/* eslint-enable import/first */

const JWT_SECRET = 'test-secret';

/**
 * The number of routes this router declared when the proof was written. It is a
 * FLOOR, not an equality: adding a Studio route must not fail this suite, but
 * the per-route assertions below must never be able to pass by running over an
 * empty or truncated stack. Without it, a router that failed to register
 * anything would satisfy every `filter(...).toEqual([])` assertion vacuously.
 */
const DECLARED_ROUTE_FLOOR = 16;

interface DeclaredRoute {
  readonly method: string;
  readonly path: string;
  readonly handlerNames: string[];
  readonly guarded: boolean;
}

function declaredRoutes(): DeclaredRoute[] {
  const stack = (caseStudyStudioRoutes as unknown as {
    stack: Array<{
      route?: {
        path: string;
        methods: Record<string, boolean>;
        stack: Array<{ handle: unknown; name?: string }>;
      };
    }>;
  }).stack;
  const out: DeclaredRoute[] = [];
  for (const layer of stack) {
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods)) {
      out.push({
        method: method.toUpperCase(),
        path: layer.route.path,
        handlerNames: layer.route.stack.map((h) => (h.name || '(anonymous)')),
        guarded: layer.route.stack.some((h) => h.handle === requireAdmin),
      });
    }
  }
  return out;
}

const ROUTES = declaredRoutes();

/** Real-looking ids so every declared path can actually be requested. */
const concrete = (path: string): string => path
  .replace(':draftId', '11111111-1111-4111-8111-111111111111')
  .replace(':artifactId', '22222222-2222-4222-8222-222222222222')
  .replace(':chartId', '33333333-3333-4333-8333-333333333333')
  .replace(':quoteId', '44444444-4444-4444-8444-444444444444')
  .replace(':id', '55555555-5555-4555-8555-555555555555');

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(caseStudyStudioRoutes);
  // Stand-in for the sibling routers mounted after this one. If a Studio route
  // ever leaked through unguarded, this would answer instead of a 401/403 and
  // the assertions below would notice the difference.
  app.use((_req, res) => { res.status(404).json({ error: 'fell through' }); });
  return app;
}

const app = buildApp();

const token = (payload: Record<string, unknown>): string =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: '10m' });

// No real address belongs in a fixture: the Test Plan's Checkpoint D rule is
// that no test may assert a hardcoded personal identifier.
const NON_ADMIN = token({ sub: 'u1', email: 'student@example.test', role: 'student' });

const send = (r: express.Express, method: string, path: string, bearer?: string) => {
  const agent = request(r) as unknown as Record<string, (p: string) => request.Test>;
  const test = agent[method.toLowerCase()](path);
  return bearer ? test.set('Authorization', `Bearer ${bearer}`) : test;
};

/* ------------------------------------------------------------------ tests --- */

describe('Story Studio router — the guard is on every route, by identity', () => {
  it('declares routes at all (the inspection is not reading an empty stack)', () => {
    expect(ROUTES.length).toBeGreaterThanOrEqual(DECLARED_ROUTE_FLOOR);
  });

  it('every declared route carries the real requireAdmin function', () => {
    const unguarded = ROUTES.filter((r) => !r.guarded)
      .map((r) => `${r.method} ${r.path} [${r.handlerNames.join(' -> ')}]`);
    expect(unguarded).toEqual([]);
  });

  it('requireAdmin is the FIRST handler, so no body runs before the guard', () => {
    // Stricter than "is present somewhere in the chain". A validator placed
    // ahead of the guard would parse an unauthenticated caller's payload, and a
    // Studio payload can carry quote text and consent timestamps.
    const late = ROUTES.filter((r) => r.handlerNames[0] !== 'requireAdmin')
      .map((r) => `${r.method} ${r.path} [${r.handlerNames.join(' -> ')}]`);
    expect(late).toEqual([]);
  });

  it('every declared path is under /api/admin/case-studies', () => {
    const stray = ROUTES.filter((r) => !r.path.startsWith('/api/admin/case-studies'));
    expect(stray.map((r) => `${r.method} ${r.path}`)).toEqual([]);
  });

  it('the router installs NO unscoped router-level middleware', () => {
    // `router.use(requireAdmin)` on a prefix-less sub-router guards every LATER
    // sibling's paths too. That is the documented outage shape in this repo, and
    // this router's own header says it avoids it deliberately.
    const stack = (caseStudyStudioRoutes as unknown as { stack: Array<{ route?: unknown }> }).stack;
    expect(stack.filter((l) => !l.route)).toHaveLength(0);
  });

  it('the guard check can fail (negative control)', () => {
    // Without this, every assertion above could be passing because the predicate
    // is incapable of returning false.
    const fake = express.Router();
    fake.get('/api/admin/case-studies/fake', (_req, res) => { res.json({}); });
    const layer = (fake as unknown as {
      stack: Array<{ route: { stack: Array<{ handle: unknown }> } }>;
    }).stack[0];
    expect(layer.route.stack.some((h) => h.handle === requireAdmin)).toBe(false);
  });
});

describe('Story Studio router — every route refuses an unauthorized caller', () => {
  it.each(ROUTES.map((r) => [r.method, r.path] as const))(
    '%s %s -> 401 without a token', async (method, path) => {
      const res = await send(app, method, concrete(path));
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Authentication required' });
    },
  );

  it.each(ROUTES.map((r) => [r.method, r.path] as const))(
    '%s %s -> 403 for a valid non-admin token', async (method, path) => {
      const res = await send(app, method, concrete(path), NON_ADMIN);
      // Asserted as an exact code, not `not.toBe(200)`. A 404 from the
      // fall-through handler would satisfy a `not.toBe` and would mean the
      // route had silently stopped existing.
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Admin access required' });
    },
  );

  it('a forged token signed with the wrong secret is refused', async () => {
    const forged = jwt.sign({ sub: 'x', email: 'x@x.test', role: 'admin' }, 'not-the-secret');
    const res = await send(app, 'GET', concrete('/api/admin/case-studies/:id/quotes'), forged);
    expect(res.status).toBe(401);
  });

  it('an expired admin token is refused', async () => {
    const expired = jwt.sign({ sub: 'x', email: 'x@x.test', role: 'admin' }, JWT_SECRET, { expiresIn: -60 });
    const res = await send(app, 'GET', concrete('/api/admin/case-studies/:id/quotes'), expired);
    expect(res.status).toBe(401);
  });

  it('the "alg: none" unsigned-token attack is refused', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ sub: 'x', role: 'admin' })).toString('base64url');
    const res = await send(app, 'GET', concrete('/api/admin/case-studies/:id/quotes'), `${header}.${body}.`);
    expect(res.status).toBe(401);
  });

  /**
   * `requireAdmin` checks `role` and nothing else — it never requires `sub` or
   * `email`. A token with a role but no identity therefore PASSES the guard, and
   * the actor written into provenance used to fall back to the literal `'admin'`.
   * The route now refuses instead of inventing a name.
   */
  it('an admin token carrying NO identity cannot promote an AI draft', async () => {
    const anonymousAdmin = token({ role: 'admin' });
    const res = await send(
      app, 'POST',
      concrete('/api/admin/case-studies/:id/story-drafts/:draftId/promote'),
      anonymousAdmin,
    );

    // Past requireAdmin (not 401/403), refused at the accountability boundary.
    expect(res.status).toBe(400);
    expect(res.body.error_class).toBe('ValidationError');
    expect(res.body.field).toBe('actor');
    // The promotion never happened.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const { promoteDraft } = require('../../../services/caseStudy/caseStudyAiDraftStore');
    expect(promoteDraft).not.toHaveBeenCalled();
  });

  it('an admin token WITH an identity gets past the actor boundary', async () => {
    // Non-vacuity: the refusal above is about the missing identity, not about
    // the route being broken for everyone.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const { promoteDraft } = require('../../../services/caseStudy/caseStudyAiDraftStore');
    promoteDraft.mockResolvedValue({ outcome: 'promoted', draft: {}, snapshotVersion: 2 });

    const namedAdmin = token({ sub: 'a1', email: 'admin@example.test', role: 'admin' });
    const res = await send(
      app, 'POST',
      concrete('/api/admin/case-studies/:id/story-drafts/:draftId/promote'),
      namedAdmin,
    );

    expect(res.status).toBe(200);
    expect(promoteDraft).toHaveBeenCalledWith(
      expect.objectContaining({ actor: 'admin@example.test' }),
    );
  });

  it('the two routes that write publishable truth are covered by the sweep above', () => {
    // Named explicitly because these are the ones whose failure mode is not an
    // information leak but a false public claim: promotion writes into snapshot
    // content via applyHumanOverride, and quote creation records a
    // consent-bearing attributed quotation. If either is ever moved to another
    // router, this assertion fails and the move has to be deliberate.
    const paths = ROUTES.map((r) => `${r.method} ${r.path}`);
    expect(paths).toContain('POST /api/admin/case-studies/:id/story-drafts/:draftId/promote');
    expect(paths).toContain('POST /api/admin/case-studies/:id/quotes');
  });
});
