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
} from '../../controllers/trustController';

const router = Router();

router.get('/api/admin/trust/overview', requireAdmin, handleGetOverview);
router.get('/api/admin/trust/activity', requireAdmin, handleGetActivity);
router.get('/api/admin/trust/governance', requireAdmin, handleGetGovernance);
router.get('/api/admin/trust/observability', requireAdmin, handleGetObservability);

export default router;
