import { Router } from 'express';
import { requireAgentManagerOrAdmin } from '../../middlewares/agentManagerAuthMiddleware';
import { handleListDirectives, handleCreateDirective, handleRevokeDirective } from '../../controllers/managerDirectiveController';

// AI Workforce Management, Checkpoint C — standing instructions from a real
// human manager to an agent, injected into its runtime context
// (agentSystemPrompt.ts), never written into AiAgent.system_prompt. Same
// auth gate as the detail page and the charter: a platform super_admin, or
// an admin whose own org_member record is upstream of this specific agent.
const router = Router();

router.get('/api/admin/agents/:id/directives', requireAgentManagerOrAdmin(), handleListDirectives);
router.post('/api/admin/agents/:id/directives', requireAgentManagerOrAdmin(), handleCreateDirective);
router.post('/api/admin/agents/:id/directives/:directiveId/revoke', requireAgentManagerOrAdmin(), handleRevokeDirective);

export default router;
