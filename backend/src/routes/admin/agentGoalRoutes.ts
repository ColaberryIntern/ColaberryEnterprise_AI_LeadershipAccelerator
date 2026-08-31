import { Router } from 'express';
import { requireAgentManagerOrAdmin } from '../../middlewares/agentManagerAuthMiddleware';
import { handleListGoals, handleCreateGoal, handleArchiveGoal } from '../../controllers/agentGoalController';

// AI Workforce Management, Checkpoint D — a manager-set target for a real,
// computable metric on an agent. Same auth gate as everything else in this
// mission: a platform super_admin, or an admin whose own org_member record
// is upstream of this specific agent.
const router = Router();

router.get('/api/admin/agents/:id/goals', requireAgentManagerOrAdmin(), handleListGoals);
router.post('/api/admin/agents/:id/goals', requireAgentManagerOrAdmin(), handleCreateGoal);
router.post('/api/admin/agents/:id/goals/:goalId/archive', requireAgentManagerOrAdmin(), handleArchiveGoal);

export default router;
