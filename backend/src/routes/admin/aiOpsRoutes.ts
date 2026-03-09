import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleGetOverview,
  handleGetAgents,
  handleUpdateAgent,
  handleRunAgent,
  handleGetActivity,
  handleGetHealth,
  handleTriggerScan,
  handleTriggerCampaignScan,
  handleGetErrors,
  handleResolveError,
  handleGetEvents,
  handleRestartCampaign,
  handleGetAgentRegistry,
  handleGetAgentDetail,
  handleControlAgent,
  handleGetExecutionTrace,
  handleGetActivityDetail,
  handleGetErrorDetail,
  handleGetCampaignTimeline,
} from '../../controllers/aiOpsController';

const router = Router();

// Overview
router.get('/api/admin/ai-ops/overview', requireAdmin, handleGetOverview);

// Agents
router.get('/api/admin/ai-ops/agents', requireAdmin, handleGetAgents);
router.patch('/api/admin/ai-ops/agents/:id', requireAdmin, handleUpdateAgent);
router.post('/api/admin/ai-ops/agents/:id/run', requireAdmin, handleRunAgent);

// Activity Log
router.get('/api/admin/ai-ops/activity', requireAdmin, handleGetActivity);

// Health
router.get('/api/admin/ai-ops/health', requireAdmin, handleGetHealth);
router.post('/api/admin/ai-ops/health/scan', requireAdmin, handleTriggerScan);
router.post('/api/admin/ai-ops/health/:campaignId/scan', requireAdmin, handleTriggerCampaignScan);

// Errors
router.get('/api/admin/ai-ops/errors', requireAdmin, handleGetErrors);
router.patch('/api/admin/ai-ops/errors/:id/resolve', requireAdmin, handleResolveError);

// Events
router.get('/api/admin/ai-ops/events', requireAdmin, handleGetEvents);

// Campaign Actions
router.post('/api/admin/ai-ops/campaigns/:id/restart', requireAdmin, handleRestartCampaign);

// --- Agent Registry (Observability) ---
router.get('/api/admin/ai-ops/registry', requireAdmin, handleGetAgentRegistry);
router.get('/api/admin/ai-ops/registry/:id', requireAdmin, handleGetAgentDetail);
router.post('/api/admin/ai-ops/registry/:id/control', requireAdmin, handleControlAgent);

// --- Drill-Down Details ---
router.get('/api/admin/ai-ops/activity/:id', requireAdmin, handleGetActivityDetail);
router.get('/api/admin/ai-ops/trace/:traceId', requireAdmin, handleGetExecutionTrace);
router.get('/api/admin/ai-ops/errors/:id', requireAdmin, handleGetErrorDetail);
router.get('/api/admin/ai-ops/campaigns/:id/timeline', requireAdmin, handleGetCampaignTimeline);

export default router;
