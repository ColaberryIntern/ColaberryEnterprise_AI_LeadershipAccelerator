import { Router } from 'express';
import { requireAgentManagerOrAdmin } from '../../middlewares/agentManagerAuthMiddleware';
import { handleGetManagerInbox } from '../../controllers/managerInboxController';

// AI Workforce Management, Checkpoint C — a per-agent, manager-scoped view
// over the real, already-live ProposedAgentAction pending queue (see
// managerInboxService.ts's header comment for why this reuses that model
// rather than a new table). Read-only in this first slice. Same auth gate
// as the detail page, charter, and directives: a platform super_admin, or
// an admin whose own org_member record is upstream of this specific agent.
const router = Router();

router.get('/api/admin/agents/:id/inbox', requireAgentManagerOrAdmin(), handleGetManagerInbox);

export default router;
