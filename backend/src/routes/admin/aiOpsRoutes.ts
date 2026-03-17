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
  handleDiscoverAgents,
  handleGetAgentHealthScores,
} from '../../controllers/aiOpsController';
import { emergencyStopAllAgents, resumeAgentsAfterStop } from '../../services/agentPermissionService';
import {
  activateKillSwitch,
  deactivateKillSwitch,
  isKillSwitchActive,
  activateWarRoom,
  deactivateWarRoom,
  getWarRoomStatus,
  getThrottleMetrics,
} from '../../services/launchSafety';
import { collectTelemetry, markLaunchTime } from '../../services/launchTelemetry';
import { getSystemHealthMetrics } from '../../services/systemHealthService';
import { enableSafeMode, disableSafeMode, isSafeModeActive } from '../../services/systemControlService';
import { getAutoResponseStatus } from '../../services/systemAutoResponseService';

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

// --- Agent Discovery & Health Scores ---
router.post('/api/admin/ai-ops/discover', requireAdmin, handleDiscoverAgents);
router.get('/api/admin/ai-ops/health/agents', requireAdmin, handleGetAgentHealthScores);

// --- Emergency Controls ---

/**
 * POST /api/admin/ai-ops/emergency-stop
 * Immediately disable ALL agents. Requires { reason: string }.
 */
router.post('/api/admin/ai-ops/emergency-stop', requireAdmin, async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) {
      res.status(400).json({ error: 'reason is required' });
      return;
    }
    const adminEmail = (req as any).admin?.email || 'unknown_admin';
    const count = await emergencyStopAllAgents(reason, adminEmail);
    res.json({ success: true, agents_disabled: count, reason, stopped_by: adminEmail });
  } catch (err: any) {
    console.error('[Emergency Stop] Failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/ai-ops/emergency-resume
 * Re-enable agents after emergency stop. Optional { agent_names: string[] } to selectively resume.
 */
router.post('/api/admin/ai-ops/emergency-resume', requireAdmin, async (req, res) => {
  try {
    const { agent_names } = req.body;
    const count = await resumeAgentsAfterStop(agent_names);
    res.json({ success: true, agents_resumed: count, selective: !!agent_names });
  } catch (err: any) {
    console.error('[Emergency Resume] Failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Launch Safety Controls ---

/** POST /api/admin/system/kill-switch — Activate or deactivate the global kill switch */
router.post('/api/admin/system/kill-switch', requireAdmin, async (req, res) => {
  try {
    const { activate, reason } = req.body;
    const adminEmail = (req as any).admin?.email || 'unknown_admin';

    if (activate) {
      if (!reason) {
        res.status(400).json({ error: 'reason is required to activate kill switch' });
        return;
      }
      const result = await activateKillSwitch(reason, adminEmail);
      res.json({ success: true, active: true, ...result });
    } else {
      await deactivateKillSwitch(adminEmail);
      res.json({ success: true, active: false });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/admin/system/kill-switch — Check kill switch status */
router.get('/api/admin/system/kill-switch', requireAdmin, async (_req, res) => {
  try {
    const active = await isKillSwitchActive();
    res.json({ active });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/admin/launch/war-room — Activate or deactivate war room mode */
router.post('/api/admin/launch/war-room', requireAdmin, async (req, res) => {
  try {
    const { activate } = req.body;
    if (activate === false) {
      deactivateWarRoom();
      res.json({ success: true, active: false });
    } else {
      const result = await activateWarRoom();
      res.json({ success: true, ...result });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/admin/launch/war-room — War room status */
router.get('/api/admin/launch/war-room', requireAdmin, async (_req, res) => {
  try {
    res.json(getWarRoomStatus());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/admin/launch/telemetry — Real-time launch metrics */
router.get('/api/admin/launch/telemetry', requireAdmin, async (_req, res) => {
  try {
    const telemetry = await collectTelemetry();
    res.json(telemetry);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/admin/launch/mark-start — Mark the launch start time for uptime tracking */
router.post('/api/admin/launch/mark-start', requireAdmin, async (_req, res) => {
  markLaunchTime();
  res.json({ success: true, marked_at: new Date().toISOString() });
});

/** GET /api/admin/launch/throttle — Agent execution throttle metrics */
router.get('/api/admin/launch/throttle', requireAdmin, async (_req, res) => {
  res.json(getThrottleMetrics());
});

// --- System Health & Safe Mode ---

/** GET /api/admin/system-health — LLM system health metrics */
router.get('/api/admin/system-health', requireAdmin, async (_req, res) => {
  try {
    const health = await getSystemHealthMetrics();
    res.json({ ...health, auto_response: getAutoResponseStatus() });
  } catch (err: any) {
    console.error('[System Health] Failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/admin/system/safe-mode — Check LLM safe mode status */
router.get('/api/admin/system/safe-mode', requireAdmin, async (_req, res) => {
  try {
    const active = await isSafeModeActive();
    res.json({ safe_mode_active: active });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/admin/system/safe-mode — Toggle LLM safe mode */
router.post('/api/admin/system/safe-mode', requireAdmin, async (req, res) => {
  try {
    const { enabled, reason } = req.body;
    const adminEmail = (req as any).admin?.email || 'unknown_admin';

    if (enabled) {
      await enableSafeMode(reason || 'Manual activation', adminEmail);
      res.json({ success: true, safe_mode_active: true });
    } else {
      await disableSafeMode(adminEmail);
      res.json({ success: true, safe_mode_active: false });
    }
  } catch (err: any) {
    console.error('[Safe Mode] Failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
