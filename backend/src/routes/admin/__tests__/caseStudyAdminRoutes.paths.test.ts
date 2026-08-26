import { requireAdmin } from '../../../middlewares/authMiddleware';
import caseStudyAdminRoutes from '../caseStudyAdminRoutes';

/**
 * Guards the MOUNT SHAPE of the admin Case Study API (T013 AC1 + AC3).
 *
 * WHY THIS EXISTS, and why a smoke test would not do. **A 401 does not prove a
 * route is mounted.** An unauthenticated request to `/api/admin/case-studies`
 * returns 401 whether or not the route exists, because anything under `/api/`
 * reaches `adminRoutes` and is rejected by the first `requireAdmin` guard it
 * meets (documented above the adminRoutes mount in `server.ts`, and the reason
 * `organizationRoutes.paths.test.ts` was written after the business-account API
 * shipped served at the wrong URL). So this file reads `router.stack` — what
 * Express actually registered — rather than asking the app a question whose
 * answer is the same either way.
 *
 * It also pins the two properties a route file can lose silently:
 *   · every layer is a ROUTE, never a bare `router.use(...)` — an admin
 *     sub-router is mounted with no path scope, so an unscoped `router.use`
 *     guard leaks onto every request that reaches adminRoutes afterwards;
 *   · every route carries `requireAdmin`, checked by FUNCTION IDENTITY against
 *     the mocked export rather than by grepping for a name, which is all
 *     `scripts/lint-route-auth.js` can do (it substring-scans the file for one
 *     of five guard names, so a single guarded route would satisfy it).
 */

jest.mock('../../../middlewares/authMiddleware', () => ({
  requireAdmin: jest.fn(),
  requireAnyAdmin: jest.fn(),
  requireSalesOrAdmin: jest.fn(),
  requireSection: jest.fn(() => jest.fn()),
}));

jest.mock('../../../services/caseStudy/caseStudyRepoCollection', () => ({
  CASE_STUDY_REPO_ROLES: [
    'primary', 'frontend', 'backend', 'agents', 'data', 'infra', 'docs', 'evals', 'demo', 'other',
  ] as const,
  attachRepository: jest.fn(),
  listRepositories: jest.fn(),
  removeRepository: jest.fn(),
  setRepositoryRole: jest.fn(),
  isCaseStudyRepoError: jest.fn(() => false),
}));
jest.mock('../../../services/caseStudy/caseStudyAdminService', () => ({
  listCaseStudies: jest.fn(),
  getCaseStudy: jest.fn(),
  createCaseStudyFromProject: jest.fn(),
  createCaseStudyFromRepoCollection: jest.fn(),
  updateCaseStudy: jest.fn(),
  archiveCaseStudy: jest.fn(),
  isCaseStudyAdminError: jest.fn(() => false),
}));
jest.mock('../../../services/caseStudy/caseStudyAdminReview', () => ({
  applyHumanOverride: jest.fn(),
  approveSnapshot: jest.fn(),
  listSyncRuns: jest.fn(),
  previewSurfaceProjection: jest.fn(),
}));
jest.mock('../../../services/caseStudy/caseStudySyncService', () => ({
  syncCaseStudy: jest.fn(),
  isCaseStudySyncError: jest.fn(() => false),
}));
jest.mock('../../../services/caseStudy/caseStudyPublicationService', () => ({
  publishCaseStudy: jest.fn(),
  unpublishCaseStudy: jest.fn(),
  isCaseStudyPublicationError: jest.fn(() => false),
}));
jest.mock('../../../services/caseStudy/caseStudyProjectSource', () => ({
  isCaseStudyProjectSourceError: jest.fn(() => false),
}));
jest.mock('../../../services/caseStudy/caseStudyEvidenceSource', () => ({
  isCaseStudyEvidenceSourceError: jest.fn(() => false),
}));

/* ─────────────────────────────────────────────────── reading the real stack ── */

interface RouteLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: { handle: unknown; name?: string }[];
  };
  name?: string;
  handle?: unknown;
}

const stack = (): RouteLayer[] =>
  (caseStudyAdminRoutes as unknown as { stack: RouteLayer[] }).stack;

const routeLayers = (): NonNullable<RouteLayer['route']>[] =>
  stack().map((l) => l.route).filter((r): r is NonNullable<RouteLayer['route']> => Boolean(r));

const registeredPaths = (): string[] => routeLayers().map((r) => r.path);

/** `GET /api/admin/case-studies` — method and path, as Express holds them. */
const registered = (): string[] =>
  routeLayers().flatMap((r) => Object.keys(r.methods)
    .filter((m) => r.methods[m])
    .map((m) => `${m.toUpperCase()} ${r.path}`));

/**
 * The full capability list from spec §20, as URLs. Duplicated here on purpose:
 * if either side moves, this fails in CI rather than 404ing in a browser once
 * the admin client is built against it (T015).
 */
const EXPECTED: readonly string[] = [
  'GET /api/admin/case-studies',                                            // list/search
  'POST /api/admin/case-studies/from-project',                              // create from Project
  'POST /api/admin/case-studies/from-repositories',                         // create from repos
  'GET /api/admin/case-studies/:id',                                        // read one
  'PATCH /api/admin/case-studies/:id',                                      // edit human overrides
  'POST /api/admin/case-studies/:id/archive',                               // archive
  'GET /api/admin/case-studies/:id/repositories',                           // read repo sources
  'POST /api/admin/case-studies/:id/repositories',                          // attach repo source
  'PATCH /api/admin/case-studies/:id/repositories/:repositoryId',           // update repo source
  'DELETE /api/admin/case-studies/:id/repositories/:repositoryId',          // remove repo source
  'POST /api/admin/case-studies/:id/sync',                                  // sync
  'GET /api/admin/case-studies/:id/sync-runs',                              // read sync runs
  'POST /api/admin/case-studies/:id/overrides',                             // edit human overrides
  'POST /api/admin/case-studies/:id/snapshots/:snapshotId/approve',         // approve a snapshot
  'GET /api/admin/case-studies/:id/preview',                                // preview projection
  'POST /api/admin/case-studies/:id/publish',                               // publish
  'POST /api/admin/case-studies/:id/unpublish',                             // unpublish
];

describe('admin Case Study routes — mount shape', () => {
  it('registers every route Express should hold', () => {
    expect(registeredPaths().length).toBeGreaterThan(0);
  });

  it('declares every path under /api/admin/case-studies, matching every sibling route file', () => {
    const wrong = registeredPaths().filter((p) => !p.startsWith('/api/admin/case-studies'));
    expect(wrong).toEqual([]);
  });

  it.each(EXPECTED)('serves %s', (entry) => {
    expect(registered()).toContain(entry);
  });

  it('declares nothing beyond the expected surface', () => {
    expect(registered().filter((r) => !EXPECTED.includes(r))).toEqual([]);
  });

  it('declares the static create paths before the /:id path', () => {
    const paths = registeredPaths();
    expect(paths.indexOf('/api/admin/case-studies/from-project'))
      .toBeLessThan(paths.indexOf('/api/admin/case-studies/:id'));
    expect(paths.indexOf('/api/admin/case-studies/from-repositories'))
      .toBeLessThan(paths.indexOf('/api/admin/case-studies/:id'));
  });
});

describe('admin Case Study routes — per-route auth (AC1)', () => {
  it('has NO bare router.use() layer — every layer is a route', () => {
    const bare = stack().filter((layer) => !layer.route);
    // A bare `router.use(guard)` on a prefix-less admin sub-router applies to
    // every later request through adminRoutes, not only to these paths.
    expect(bare.map((l) => l.name ?? 'anonymous')).toEqual([]);
  });

  it('applies requireAdmin to every route, by function identity', () => {
    const unguarded = routeLayers()
      .filter((r) => !r.stack.some((l) => l.handle === requireAdmin))
      .map((r) => r.path);
    expect(unguarded).toEqual([]);
  });

  it('puts the guard BEFORE the handler on every route', () => {
    for (const route of routeLayers()) {
      const guardAt = route.stack.findIndex((l) => l.handle === requireAdmin);
      expect(guardAt).toBe(0);
      expect(route.stack.length).toBeGreaterThan(1); // guard + handler
    }
  });

  it('covers as many guarded routes as spec §20 has capabilities', () => {
    expect(routeLayers().length).toBe(EXPECTED.length);
  });
});
