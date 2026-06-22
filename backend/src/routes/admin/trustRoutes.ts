/**
 * Trust Command Center routes (/admin/trust). Read-only, admin-gated.
 * Backs docs/trust-audit/dashboard-design.md (Phase 10 of the TBI compliance audit).
 */
import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleGetOverview,
  handleGetActivity,
  handleGetGovernance,
  handleGetObservability,
  handleGetDimension,
  handleGetActions,
  handleGetCostBreakdown,
  handleGetValue,
} from '../../controllers/trustController';

const router = Router();

router.get('/api/admin/trust/overview', requireAdmin, handleGetOverview);
router.get('/api/admin/trust/activity', requireAdmin, handleGetActivity);
router.get('/api/admin/trust/governance', requireAdmin, handleGetGovernance);
router.get('/api/admin/trust/observability', requireAdmin, handleGetObservability);
router.get('/api/admin/trust/actions', requireAdmin, handleGetActions);
router.get('/api/admin/trust/cost-breakdown', requireAdmin, handleGetCostBreakdown);
router.get('/api/admin/trust/value', requireAdmin, handleGetValue);
router.get('/api/admin/trust/dimension/:key', requireAdmin, handleGetDimension);

export default router;
