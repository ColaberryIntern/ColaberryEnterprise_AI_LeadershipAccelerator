import { Router } from 'express';
import { requireAgentManagerOrAdmin } from '../../middlewares/agentManagerAuthMiddleware';
import { handleSetReeseBehaviourSwitch } from '../../controllers/reeseBehaviourSwitchController';

// Reese Product Phase 1 follow-up (2026-09-18) — Ali, live: "who's in charge
// of turning on and off behaviors. It should be admins and manager." Same
// auth gate as the charter routes: a platform super_admin, or an admin whose
// own org_member is upstream of Reese specifically (her real manager, Ali,
// as of R6) — not any generic admin account, which is what the older
// AI Workforce Reset routes (resetAgents/reactivateAgent) still use.
const router = Router();

router.patch('/api/admin/agents/:id/behaviours/:key', requireAgentManagerOrAdmin(), handleSetReeseBehaviourSwitch);

export default router;
