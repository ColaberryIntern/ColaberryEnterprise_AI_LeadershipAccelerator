import { Router } from 'express';
import { requireAgentManagerOrAdmin } from '../../middlewares/agentManagerAuthMiddleware';
import { handleGetRoleCharter, handleUpsertRoleCharter } from '../../controllers/agentRoleCharterController';

// AI Workforce Management, Checkpoint B — an agent's business-facing job
// description (docs/architecture/ai-workforce-management/TARGET_ARCHITECTURE.md).
// Separate router from agentDetailRoutes.ts (which is read-only by its own
// stated design) since this one has a real write path. Same auth gate as
// the detail page: a platform super_admin, or an admin whose own org_member
// record is upstream of this specific agent.
const router = Router();

router.get('/api/admin/agents/:id/charter', requireAgentManagerOrAdmin(), handleGetRoleCharter);
router.put('/api/admin/agents/:id/charter', requireAgentManagerOrAdmin(), handleUpsertRoleCharter);

export default router;
