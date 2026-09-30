import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  getWorkLedgerHealthStats,
  getGovernanceShadowStats,
  getAgentTrustStats,
  getCostToProofStats,
  getRelatedWorkClusterStats,
  getOutcomeMeasurementsStats,
  getExecutiveNarrative,
} from '../../controllers/workLedgerHealthController';

const router = Router();

router.get('/api/admin/dashboard/work-ledger-health', requireAdmin, getWorkLedgerHealthStats);
// ProofDesk Governance — Milestone 4 (shadow mode). Read-only, requireAdmin-gated
// like every other route in this file.
router.get('/api/admin/dashboard/governance-shadow', requireAdmin, getGovernanceShadowStats);

// ProofDesk Outcomes & Learning — Milestone 5. Same read-only, requireAdmin-gated
// pattern as every route above.
router.get('/api/admin/dashboard/agent-trust', requireAdmin, getAgentTrustStats);
router.get('/api/admin/dashboard/cost-to-proof', requireAdmin, getCostToProofStats);
router.get('/api/admin/dashboard/related-work-clusters', requireAdmin, getRelatedWorkClusterStats);
router.get('/api/admin/dashboard/outcome-measurements', requireAdmin, getOutcomeMeasurementsStats);
router.get('/api/admin/dashboard/executive-narrative', requireAdmin, getExecutiveNarrative);

export default router;
