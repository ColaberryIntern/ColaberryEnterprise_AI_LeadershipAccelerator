import { Router } from 'express';
import { requireAgentManagerOrAdmin } from '../../middlewares/agentManagerAuthMiddleware';
import { handleGetManagerInbox, handleApproveManagerInboxItem, handleRejectManagerInboxItem, handleGetManagerInboxItemInspector } from '../../controllers/managerInboxController';

// AI Workforce Management, Checkpoint C — a per-agent, manager-scoped view
// over the real, already-live ProposedAgentAction pending queue (see
// managerInboxService.ts's header comment for why this reuses that model
// rather than a new table). Same auth gate as the detail page, charter, and
// directives: a platform super_admin, or an admin whose own org_member
// record is upstream of this specific agent.
//
// AI Agent Dashboard redesign, Checkpoint B (2026-09-02) — approve/reject
// added, same auth gate, plus the service-layer ownership check documented
// in managerInboxController.ts.
const router = Router();

router.get('/api/admin/agents/:id/inbox', requireAgentManagerOrAdmin(), handleGetManagerInbox);
router.post('/api/admin/agents/:id/inbox/:proposalId/approve', requireAgentManagerOrAdmin(), handleApproveManagerInboxItem);
router.post('/api/admin/agents/:id/inbox/:proposalId/reject', requireAgentManagerOrAdmin(), handleRejectManagerInboxItem);
// Dashboard redesign, Slice 2c (2026-09-20) — the decision inspector's 3
// real facts, fetched on demand only (never on the list above).
router.get('/api/admin/agents/:id/inbox/:proposalId/inspector', requireAgentManagerOrAdmin(), handleGetManagerInboxItemInspector);

export default router;
