/** Reese manager-growth mission, Phase 3 (T09/T10) — read-only effective-
 * access resolver + Admin Tools page routes. */
import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleListTools,
  handleGetAgentEffectiveAccess,
  handleGetAgentToolGovernance,
} from '../../controllers/agentEffectiveAccessController';

const router = Router();

router.get('/api/admin/tools', requireAdmin, handleListTools);
router.get('/api/admin/agents/:id/effective-access', requireAdmin, handleGetAgentEffectiveAccess);
// The Tools section on the agent dashboard (2026-11-11). Read-only: who granted each tool and
// which capability it serves, which is the half `effective-access` deliberately does not answer.
router.get('/api/admin/agents/:id/tool-governance', requireAdmin, handleGetAgentToolGovernance);

export default router;
