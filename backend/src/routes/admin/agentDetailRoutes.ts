import { Router } from 'express';
import { requireAgentManagerOrAdmin } from '../../middlewares/agentManagerAuthMiddleware';
import { getAgentDetailStats } from '../../controllers/agentDetailController';

// Agent Detail — read-only, gated by requireAgentManagerOrAdmin: a platform
// super_admin, or an admin whose own org_member record is upstream of this
// specific agent in the reports-to chain. :id is an AiAgent.id (works for any
// agent, not hardcoded to Reese).
//
// 2026-08-27 (AI Workforce Management, Checkpoint B): previously flat
// requireAdmin. Ali's explicit call after reviewing real production coverage
// (docs/architecture/ai-workforce-management/MANAGER_AUTHORIZATION_MAP.md):
// narrowing to real managers is intended, not a regression. Confirmed via a
// production read-only query that only 3 org_members (Ali, Kes, Taiwo) are
// ever a human root of any agent's reports_to chain today — admins outside
// that chain (e.g. Ram, Sohail, Saitejesh) lose access to agent detail pages
// as of this change, by design.
const router = Router();

router.get('/api/admin/agents/:id', requireAgentManagerOrAdmin(), getAgentDetailStats);

export default router;
