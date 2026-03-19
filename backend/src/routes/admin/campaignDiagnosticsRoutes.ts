import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleGlobalAudit,
  handleCampaignAudit,
  handleRampReset,
  handleQueueRebuild,
  handleSchedulerVerify,
  handleSafeActivate,
  handleFullRecovery,
  handleLiveTest,
  handleWatchdogStatus,
} from '../../controllers/campaignDiagnosticsController';

const router = Router();

// Phase 1: Global audit of all campaigns
router.get('/api/admin/campaigns/audit/all', requireAdmin, handleGlobalAudit);

// Phase 1-3: Full audit for a single campaign
router.get('/api/admin/campaigns/:id/audit', requireAdmin, handleCampaignAudit);

// Phase 4: Ramp-up engine reset
router.post('/api/admin/campaigns/:id/recovery/ramp-reset', requireAdmin, handleRampReset);

// Phase 5: Queue rebuild
router.post('/api/admin/campaigns/:id/recovery/queue-rebuild', requireAdmin, handleQueueRebuild);

// Phase 6: Scheduler verify & resume
router.post('/api/admin/scheduler/verify-and-resume', requireAdmin, handleSchedulerVerify);

// Phase 7: Safe activate (multiple campaigns)
router.post('/api/admin/campaigns/recovery/safe-activate', requireAdmin, handleSafeActivate);

// Phase 4-7: Full recovery for a single campaign
router.post('/api/admin/campaigns/:id/recovery/full', requireAdmin, handleFullRecovery);

// Phase 8: Live test (verify messages sent in last 5 min)
router.post('/api/admin/campaigns/:id/recovery/live-test', requireAdmin, handleLiveTest);

// Phase 9-10: Watchdog status
router.get('/api/admin/watchdog/status', requireAdmin, handleWatchdogStatus);

export default router;
