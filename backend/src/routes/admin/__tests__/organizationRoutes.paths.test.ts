import organizationRoutes from '../organizationRoutes';

jest.mock('../../../controllers/adminOrgController', () => ({
  handleAdminListOrganizations: jest.fn(),
  handleAdminGetOrganizationStats: jest.fn(),
  handleAdminGetOrganization: jest.fn(),
  handleAdminSetOrganizationStatus: jest.fn(),
  handleAdminAddCohort: jest.fn(),
  handleAdminRemoveCohort: jest.fn(),
}));

jest.mock('../../../middlewares/authMiddleware', () => ({
  requireAdmin: jest.fn(),
  requireSalesOrAdmin: jest.fn(),
}));

/**
 * Guards the mount path of the admin business-account API.
 *
 * WHY THIS EXISTS. These routes originally declared bare paths (`/organizations`)
 * while `adminRoutes` mounts its children with `router.use(child)` and NO prefix
 * — every sibling file declares the full `/api/admin/...` path. The API was
 * therefore served at `/organizations`, and the admin page calling
 * `/api/admin/organizations` got nothing back.
 *
 * The reason it shipped is the important part: **a 401 does not prove a route
 * exists.** An unauthenticated request to `/api/admin/organizations` returns 401
 * whether or not the route is mounted, because anything under `/api/` reaches
 * adminRoutes and is rejected by the first `requireAdmin` guard it encounters
 * (documented above the adminRoutes mount in server.ts). A smoke test that reads
 * 401 as "mounted and guarded" is reading a false positive. Only an
 * authenticated request — or this test — tells the two apart.
 */

/** The paths Express actually registered, read off the router stack. */
function registeredPaths(): string[] {
  const stack = (organizationRoutes as unknown as {
    stack: { route?: { path: string } }[];
  }).stack;
  return stack.map((layer) => layer.route?.path).filter((p): p is string => Boolean(p));
}

describe('admin organization routes — mount path', () => {
  it('registers at least one route', () => {
    expect(registeredPaths().length).toBeGreaterThan(0);
  });

  it('declares every path under /api/admin, matching every sibling route file', () => {
    const wrong = registeredPaths().filter((p) => !p.startsWith('/api/admin/'));
    expect(wrong).toEqual([]);
  });

  it('serves the exact URLs the admin client calls', () => {
    // These strings are duplicated from frontend/src/services/adminOrgApi.ts on
    // purpose: if either side moves, this fails rather than 404ing in a browser.
    const paths = registeredPaths();
    expect(paths).toContain('/api/admin/organizations');
    expect(paths).toContain('/api/admin/organizations/stats');
    expect(paths).toContain('/api/admin/organizations/:id');
    expect(paths).toContain('/api/admin/organizations/:id/status');
    expect(paths).toContain('/api/admin/organizations/:id/cohorts');
    expect(paths).toContain('/api/admin/organizations/:id/cohorts/:cohortId');
  });

  it('declares /stats before /:id, or Express matches "stats" as an id', () => {
    const paths = registeredPaths();
    expect(paths.indexOf('/api/admin/organizations/stats')).toBeLessThan(
      paths.indexOf('/api/admin/organizations/:id'),
    );
  });
});
