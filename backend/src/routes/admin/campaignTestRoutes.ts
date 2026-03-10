import { Router } from 'express';
import {
  handleRunCampaignTest,
  handleGetTestRuns,
  handleGetTestRunDetail,
  handleGetQASummary,
} from '../../controllers/campaignTestController';

const router = Router();

// Campaign QA dashboard summary
router.get('/testing/summary', handleGetQASummary);

// Run full campaign test
router.post('/testing/campaigns/:id/run', handleRunCampaignTest);

// List test runs for a campaign
router.get('/testing/campaigns/:id/runs', handleGetTestRuns);

// Get single test run detail with steps
router.get('/testing/runs/:runId', handleGetTestRunDetail);

export default router;
