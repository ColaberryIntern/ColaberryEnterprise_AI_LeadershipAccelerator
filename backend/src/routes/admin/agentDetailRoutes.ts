import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { getAgentDetailStats } from '../../controllers/agentDetailController';

// Agent Detail — read-only, requireAdmin-gated, same pattern as workLedgerRoutes.ts.
// :id is an AiAgent.id (works for any agent, not hardcoded to Reese).
const router = Router();

router.get('/api/admin/agents/:id', requireAdmin, getAgentDetailStats);

export default router;
