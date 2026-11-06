import { Router } from 'express';
import { requireAgentManagerOrDomainBuilder } from '../../middlewares/agentManagerAuthMiddleware';
import { handleGetAgentExplainability } from '../../controllers/agentExplainabilityController';

// AI Workforce Management, Checkpoint F — "Ask Agent About This."
// Read-only: no new tables, reuses ai_events + ProposedAgentAction.
// Same auth gate as everything else in this mission.
const router = Router();

router.get('/api/admin/agents/:id/explainability', requireAgentManagerOrDomainBuilder(), handleGetAgentExplainability);

export default router;
