/** AI Workforce Operating System (Phase 5) — admin routes. /api/admin/workforce. */
import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleRoster, handleOffice, handleBriefing, handleDailyMeeting, handleMeetings,
  handleListTasks, handleCreateTask, handleUpdateTask, handleMessages, handleReview, handleAnalytics,
  handleListLiveAgents, handleListLiveAgentActivity, handleOrgChart,
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

// Reese Phase 4 (Workforce integration) — real, DB-backed AiAgent rows built via the
// agentBlueprint pattern (see liveAgentsService.ts), distinct from the static AI_ORG
// director roster the routes above are keyed to.
router.get('/api/admin/workforce/live-agents', requireAdmin, handleListLiveAgents);
router.get('/api/admin/workforce/live-agents/activity', requireAdmin, handleListLiveAgentActivity);

// Org-chart hierarchy build (2026-08-19) — real Human Employees -> AI
// Leadership -> AI Staff tree, replacing the static AI_ORG roster's "who's in
// this org" answer with the real one. See services/workforce/orgChartService.ts.
router.get('/api/admin/workforce/org-chart', requireAdmin, handleOrgChart);

export default router;
