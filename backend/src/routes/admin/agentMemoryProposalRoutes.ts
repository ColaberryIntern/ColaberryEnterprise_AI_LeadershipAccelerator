import { Router } from 'express';
import { requireAgentManagerOrAdmin } from '../../middlewares/agentManagerAuthMiddleware';
import {
  handleListMemoryProposals,
  handleProposeMemory,
  handleApproveMemoryProposal,
  handleRejectMemoryProposal,
} from '../../controllers/agentMemoryProposalController';

// AI Workforce Management, Checkpoint E — a proposed fact about an agent,
// pending human review before it can ever reach the agent's runtime
// context. Same auth gate as everything else in this mission: a platform
// super_admin, or an admin whose own org_member record is upstream of this
// specific agent.
const router = Router();

router.get('/api/admin/agents/:id/memory-proposals', requireAgentManagerOrAdmin(), handleListMemoryProposals);
router.post('/api/admin/agents/:id/memory-proposals', requireAgentManagerOrAdmin(), handleProposeMemory);
router.post(
  '/api/admin/agents/:id/memory-proposals/:proposalId/approve',
  requireAgentManagerOrAdmin(),
  handleApproveMemoryProposal
);
router.post(
  '/api/admin/agents/:id/memory-proposals/:proposalId/reject',
  requireAgentManagerOrAdmin(),
  handleRejectMemoryProposal
);

export default router;
