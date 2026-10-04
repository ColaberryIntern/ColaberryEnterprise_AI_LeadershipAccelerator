/** Reese manager-growth mission, Phase 3 (T09/T10) — read-only effective-
 * access resolver + Admin Tools page routes. */
import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { handleListTools, handleGetAgentEffectiveAccess } from '../../controllers/agentEffectiveAccessController';

const router = Router();

router.get('/api/admin/tools', requireAdmin, handleListTools);
router.get('/api/admin/agents/:id/effective-access', requireAdmin, handleGetAgentEffectiveAccess);

export default router;
