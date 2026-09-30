import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleAdminListOrganizations,
  handleAdminGetOrganizationStats,
  handleAdminGetOrganization,
  handleAdminSetOrganizationStatus,
  handleAdminAddCohort,
  handleAdminRemoveCohort,
} from '../../controllers/adminOrgController';

/**
 * Admin business-account routes — the staff-side view of `organizations`.
 *
 * This surface did not exist before. Every `/api/portal/org/*` route is
 * participant-scoped (`requireOrgManager` resolves the org from the requesting
 * person's own enrollment), so no admin could read or act on a business account
 * through any route in the app.
 *
 * `requireAdmin` on every route, not `requireSalesOrAdmin`: the `sales` role is
 * deliberately scoped to the leads section, and these endpoints expose a
 * company's full member roster and can suspend an account.
 *
 * PATH PREFIX: these declare the FULL path including `/api/admin`, because
 * `adminRoutes` mounts its children with `router.use(child)` and no prefix --
 * every sibling file (leadRoutes, cohortRoutes, ...) does the same. Declaring a
 * bare `/organizations` here mounted the API at the wrong URL entirely, and the
 * mistake was invisible to a smoke test: an UNauthenticated request to
 * `/api/admin/organizations` still returns 401, because anything under `/api/`
 * reaches adminRoutes and is rejected by the first requireAdmin guard it meets
 * (see the comment above the adminRoutes mount in server.ts). A 401 therefore
 * proves nothing about whether the route exists -- only an authenticated request
 * distinguishes "mounted" from "404". `organizationRoutes.paths.test.ts` now
 * asserts the prefix directly.
 *
 * Ordering note: `/organizations/stats` is declared BEFORE `/organizations/:id`,
 * or Express matches "stats" as an id and the stats call 404s.
 */
const router = Router();

router.get('/api/admin/organizations', requireAdmin, handleAdminListOrganizations);
router.get('/api/admin/organizations/stats', requireAdmin, handleAdminGetOrganizationStats);
router.get('/api/admin/organizations/:id', requireAdmin, handleAdminGetOrganization);
router.patch('/api/admin/organizations/:id/status', requireAdmin, handleAdminSetOrganizationStatus);
router.post('/api/admin/organizations/:id/cohorts', requireAdmin, handleAdminAddCohort);
router.delete('/api/admin/organizations/:id/cohorts/:cohortId', requireAdmin, handleAdminRemoveCohort);

export default router;
