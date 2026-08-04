import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { getWorkLedgerHealthStats, getGovernanceShadowStats } from '../../controllers/workLedgerHealthController';

const router = Router();

router.get('/api/admin/dashboard/work-ledger-health', requireAdmin, getWorkLedgerHealthStats);
// ProofDesk Governance — Milestone 4 (shadow mode). Read-only, requireAdmin-gated
// like every other route in this file.
router.get('/api/admin/dashboard/governance-shadow', requireAdmin, getGovernanceShadowStats);

export default router;
