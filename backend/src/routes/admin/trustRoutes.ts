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
  handleGetRetention,
  handleEnforceRetention,
  handleGetAgentRoster,
  handleGetRegistryHealth,
  handleGetAgentDetail,
  handleRunAgent,
} from '../../controllers/trustController';

const router = Router();

router.get('/api/admin/trust/overview', requireAdmin, handleGetOverview);
router.get('/api/admin/trust/activity', requireAdmin, handleGetActivity);
router.get('/api/admin/trust/governance', requireAdmin, handleGetGovernance);
router.get('/api/admin/trust/observability', requireAdmin, handleGetObservability);
router.get('/api/admin/trust/actions', requireAdmin, handleGetActions);
router.get('/api/admin/trust/cost-breakdown', requireAdmin, handleGetCostBreakdown);
router.get('/api/admin/trust/value', requireAdmin, handleGetValue);
router.get('/api/admin/trust/retention', requireAdmin, handleGetRetention);
router.post('/api/admin/trust/retention/enforce', requireAdmin, handleEnforceRetention);
router.get('/api/admin/trust/dimension/:key', requireAdmin, handleGetDimension);
router.get('/api/admin/trust/agents', requireAdmin, handleGetAgentRoster);
router.get('/api/admin/trust/registry-health', requireAdmin, handleGetRegistryHealth);
router.get('/api/admin/trust/agents/:slug', requireAdmin, handleGetAgentDetail);
router.post('/api/admin/trust/agents/:slug/run', requireAdmin, handleRunAgent);

export default router;
