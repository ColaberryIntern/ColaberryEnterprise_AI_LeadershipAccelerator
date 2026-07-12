/** AI Workforce Operating System (Phase 5) — admin routes. /api/admin/workforce. */
import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleRoster, handleOffice, handleBriefing, handleDailyMeeting, handleMeetings,
  handleListTasks, handleCreateTask, handleUpdateTask, handleMessages, handleReview, handleAnalytics,
} from '../../controllers/workforceController';

const router = Router();

router.get('/api/admin/workforce/roster', requireAdmin, handleRoster);
router.get('/api/admin/workforce/briefing', requireAdmin, handleBriefing);
router.post('/api/admin/workforce/meeting/daily', requireAdmin, handleDailyMeeting);
router.get('/api/admin/workforce/meetings', requireAdmin, handleMeetings);
router.get('/api/admin/workforce/tasks', requireAdmin, handleListTasks);
router.post('/api/admin/workforce/tasks', requireAdmin, handleCreateTask);
router.put('/api/admin/workforce/tasks/:id', requireAdmin, handleUpdateTask);
router.get('/api/admin/workforce/messages', requireAdmin, handleMessages);
router.get('/api/admin/workforce/analytics', requireAdmin, handleAnalytics);
router.get('/api/admin/workforce/employee/:slug/review', requireAdmin, handleReview);
router.get('/api/admin/workforce/employee/:slug', requireAdmin, handleOffice);

export default router;
