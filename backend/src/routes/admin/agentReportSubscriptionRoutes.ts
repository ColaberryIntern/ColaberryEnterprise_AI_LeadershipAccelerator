import { Router } from 'express';
import { requireAgentManagerOrAdmin } from '../../middlewares/agentManagerAuthMiddleware';
import {
  handleListReportSubscriptions,
  handleCreateReportSubscription,
  handleUpdateReportSubscription,
  handleListReportRuns,
} from '../../controllers/agentReportSubscriptionController';

// AI Workforce Management, Checkpoint D — a manager's standing request to
// receive a recurring email report about an agent. Same auth gate as
// everything else in this mission: a platform super_admin, or an admin
// whose own org_member record is upstream of this specific agent.
const router = Router();

router.get('/api/admin/agents/:id/report-subscriptions', requireAgentManagerOrAdmin(), handleListReportSubscriptions);
router.post('/api/admin/agents/:id/report-subscriptions', requireAgentManagerOrAdmin(), handleCreateReportSubscription);
router.patch(
  '/api/admin/agents/:id/report-subscriptions/:subscriptionId',
  requireAgentManagerOrAdmin(),
  handleUpdateReportSubscription
);
router.get('/api/admin/agents/:id/report-runs', requireAgentManagerOrAdmin(), handleListReportRuns);

export default router;
