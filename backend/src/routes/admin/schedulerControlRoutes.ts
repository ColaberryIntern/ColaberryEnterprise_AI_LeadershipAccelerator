import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handlePauseScheduler,
  handleResumeScheduler,
  handleGetSchedulerStatus,
  handleGetLaunchReadiness,
} from '../../controllers/adminSchedulerController';

const router = Router();

router.post('/api/admin/scheduler/pause', requireAdmin, handlePauseScheduler);
router.post('/api/admin/scheduler/resume', requireAdmin, handleResumeScheduler);
router.get('/api/admin/scheduler/status', requireAdmin, handleGetSchedulerStatus);
router.get('/api/admin/campaigns/:id/launch-readiness', requireAdmin, handleGetLaunchReadiness);

export default router;
