import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleGetOverview,
  handleGetAgents,
  handleGetAlerts,
  handleGetConfig,
  handleUpdateAgentToggle,
  handleUpdateConfig,
} from '../../controllers/governanceController';

const router = Router();

router.get('/api/admin/governance/overview', requireAdmin, handleGetOverview);
router.get('/api/admin/governance/agents', requireAdmin, handleGetAgents);
router.get('/api/admin/governance/alerts', requireAdmin, handleGetAlerts);
router.get('/api/admin/governance/config', requireAdmin, handleGetConfig);
router.patch('/api/admin/governance/agents/:id', requireAdmin, handleUpdateAgentToggle);
router.patch('/api/admin/governance/config', requireAdmin, handleUpdateConfig);

export default router;
