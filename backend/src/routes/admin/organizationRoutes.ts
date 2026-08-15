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
 * Ordering note: `/organizations/stats` is declared BEFORE `/organizations/:id`,
 * or Express matches "stats" as an id and the stats call 404s.
 */
const router = Router();

router.get('/organizations', requireAdmin, handleAdminListOrganizations);
router.get('/organizations/stats', requireAdmin, handleAdminGetOrganizationStats);
router.get('/organizations/:id', requireAdmin, handleAdminGetOrganization);
router.patch('/organizations/:id/status', requireAdmin, handleAdminSetOrganizationStatus);
router.post('/organizations/:id/cohorts', requireAdmin, handleAdminAddCohort);
router.delete('/organizations/:id/cohorts/:cohortId', requireAdmin, handleAdminRemoveCohort);

export default router;
