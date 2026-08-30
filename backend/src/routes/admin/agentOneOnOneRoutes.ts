import { Router } from 'express';
import { requireAgentManagerOrAdmin } from '../../middlewares/agentManagerAuthMiddleware';
import { handleListOneOnOnes, handleCreateOneOnOne, handleCompleteOneOnOne } from '../../controllers/agentOneOnOneController';

// AI Workforce Management, Checkpoint D — a manager's structured 1:1
// check-in record with their agent. Same auth gate as everything else in
// this mission: a platform super_admin, or an admin whose own org_member
// record is upstream of this specific agent.
const router = Router();

router.get('/api/admin/agents/:id/one-on-ones', requireAgentManagerOrAdmin(), handleListOneOnOnes);
router.post('/api/admin/agents/:id/one-on-ones', requireAgentManagerOrAdmin(), handleCreateOneOnOne);
router.post('/api/admin/agents/:id/one-on-ones/:oneOnOneId/complete', requireAgentManagerOrAdmin(), handleCompleteOneOnOne);

export default router;
