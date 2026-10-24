/**
 * Commercialization Command Center routes (/admin/commercialization). Read-only,
 * admin-gated. Backs C8.1's board design; see commercializationTiles.ts for why each
 * tile reports what it does.
 *
 * The section gate for this prefix is declared in mgmtSectionGate.ts PATH_SECTION as
 * 'revenue'. That gate is deny-by-default for scoped roles, so an unmapped prefix here
 * would 403 a revenue identity with nothing explaining why.
 */
import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleGetCommercializationBoard,
  handleGetHypothesisHealth,
} from '../../controllers/commercializationController';

const router = Router();

router.get('/api/admin/commercialization/board', requireAdmin, handleGetCommercializationBoard);
// C8.6 - hypothesis health, computed from the C8.4 funnel.
router.get('/api/admin/commercialization/hypotheses', requireAdmin, handleGetHypothesisHealth);

export default router;
