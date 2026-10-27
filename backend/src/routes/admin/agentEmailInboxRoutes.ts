import { Router } from 'express';
import { requireAgentManagerOrAdmin } from '../../middlewares/agentManagerAuthMiddleware';
import {
  handleGetAgentEmailInbox,
  handleApproveAgentEmailDraft,
  handleDiscardAgentEmailDraft,
} from '../../controllers/agentEmailInboxController';

/**
 * An agent's email, on her own dashboard (Ali, 2026-10-26).
 *
 * Same auth gate as the rest of the agent detail page - `requireAgentManagerOrAdmin` - because
 * this is the same audience looking at the same agent, and inventing a second gate for one more
 * tab is how two surfaces on one page end up disagreeing about who may see it.
 *
 * SIBLING OF, NOT A REPLACEMENT FOR, `/api/admin/agents/:id/inbox`. That one is the DECISION inbox
 * (pending `ProposedAgentAction` rows and the Decision Journal). This is correspondence. The paths
 * are deliberately distinct - `/email` vs `/inbox` - so neither reads as the other.
 *
 * Approval here does NOT send; see the controller and `agentEmailInboxService`.
 */
const router = Router();

router.get(
  '/api/admin/agents/:id/email',
  requireAgentManagerOrAdmin(),
  handleGetAgentEmailInbox,
);
router.post(
  '/api/admin/agents/:id/email/:draftId/approve',
  requireAgentManagerOrAdmin(),
  handleApproveAgentEmailDraft,
);
router.post(
  '/api/admin/agents/:id/email/:draftId/discard',
  requireAgentManagerOrAdmin(),
  handleDiscardAgentEmailDraft,
);

export default router;
