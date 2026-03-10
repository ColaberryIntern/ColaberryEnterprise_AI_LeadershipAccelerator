import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleRunCampaignTest,
  handleGetTestRuns,
  handleGetTestRunDetail,
  handleGetQASummary,
} from '../../controllers/campaignTestController';

const router = Router();

// Campaign QA dashboard summary
router.get('/api/admin/testing/summary', requireAdmin, handleGetQASummary);

// Run full campaign test
router.post('/api/admin/testing/campaigns/:id/run', requireAdmin, handleRunCampaignTest);

// List test runs for a campaign
router.get('/api/admin/testing/campaigns/:id/runs', requireAdmin, handleGetTestRuns);

// Get single test run detail with steps
router.get('/api/admin/testing/runs/:runId', requireAdmin, handleGetTestRunDetail);

export default router;
