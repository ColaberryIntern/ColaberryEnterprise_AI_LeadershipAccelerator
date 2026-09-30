import { Router } from 'express';
import { requireAgentManagerOrAdmin } from '../../middlewares/agentManagerAuthMiddleware';
import { handleGetConversation, handleSendManagerMessage } from '../../controllers/agentManagerConversationController';

// AI Workforce Management, Checkpoint C — Direct Agent Communication, first
// slice: a manager's continuous conversation with their agent. Same auth
// gate as everything else in this mission: a platform super_admin, or an
// admin whose own org_member record is upstream of this specific agent.
const router = Router();

router.get('/api/admin/agents/:id/conversation', requireAgentManagerOrAdmin(), handleGetConversation);
router.post('/api/admin/agents/:id/conversation/messages', requireAgentManagerOrAdmin(), handleSendManagerMessage);

export default router;
