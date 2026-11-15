/**
 * aiOpsRoutes — the AI Ops surface. READING it and ACTING on it are now different grants.
 *
 * ## Why this file gained a second guard
 *
 * Quincy Ninying's L1 run ended on a request for read access to these surfaces that nobody could
 * grant, because all 33 routes here carried `requireAdmin` and `/api/admin/ai-ops` was UNMAPPED
 * in `mgmtSectionGate`'s `PATH_SECTION` — so the only identities that reached them were legacy
 * admins, `owner`, and the near-full `admin` role.
 *
 * Classifying the prefix is what lets a scoped identity read it. On its own that would have been
 * a serious mistake, and the reason is worth stating because it is not obvious from either file:
 *
 *   1. `mgmtSectionGate` maps a PATH to a section. It cannot tell `GET /ai-ops/overview` from
 *      `POST /ai-ops/emergency-stop`, because they share a prefix.
 *   2. `requireAdmin` does not help. `mintMgmtAdminToken` mints `role: 'admin'` for every
 *      management role, so a mentor passes it. It establishes "an admin-portal identity", not
 *      "a full administrator".
 *
 * So classifying the prefix alone would have handed any holder of the section the emergency
 * stop, the kill switch, safe mode, war room, and agent run / restart / control. `requireFullAdmin`
 * is the guard that separates the two, and it is on EVERY non-GET route in this file.
 *
 * ## The verb split is the read/act split, and that is checked rather than assumed
 *
 * All 19 GETs here are reads; all 14 non-GETs are actions, including the four on the
 * `/api/admin/system` and `/api/admin/launch` prefixes. `aiOpsRoutes.readWriteSplit.test.ts`
 * asserts structurally that every non-GET carries `requireFullAdmin`, so a control route added
 * later without it fails a test instead of inheriting a read grant.
 *
 * The four non-ai-ops prefixes in this file (`/api/admin/system`, `/api/admin/launch`,
 * `/api/admin/system-health`) are deliberately still UNMAPPED, so they remain deny-by-default for
 * every scoped role. They carry the guard anyway: the day one of them is classified, the kill
 * switch must not open as a side effect of somebody adding a row to a table in another file.
 */

import { Router } from 'express';
import { requireAdmin, requireFullAdmin } from '../../middlewares/authMiddleware';
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
router.patch('/api/admin/ai-ops/agents/:id', requireAdmin, requireFullAdmin, handleUpdateAgent);
router.post('/api/admin/ai-ops/agents/:id/run', requireAdmin, requireFullAdmin, handleRunAgent);

// Activity Log
router.get('/api/admin/ai-ops/activity', requireAdmin, handleGetActivity);

// Health
router.get('/api/admin/ai-ops/health', requireAdmin, handleGetHealth);
router.post('/api/admin/ai-ops/health/scan', requireAdmin, requireFullAdmin, handleTriggerScan);
router.post('/api/admin/ai-ops/health/:campaignId/scan', requireAdmin, requireFullAdmin, handleTriggerCampaignScan);

// Errors
router.get('/api/admin/ai-ops/errors', requireAdmin, handleGetErrors);
router.patch('/api/admin/ai-ops/errors/:id/resolve', requireAdmin, requireFullAdmin, handleResolveError);

// Events
router.get('/api/admin/ai-ops/events', requireAdmin, handleGetEvents);

// Campaign Actions
router.post('/api/admin/ai-ops/campaigns/:id/restart', requireAdmin, requireFullAdmin, handleRestartCampaign);

// --- Agent Registry (Observability) ---
router.get('/api/admin/ai-ops/registry', requireAdmin, handleGetAgentRegistry);
router.get('/api/admin/ai-ops/registry/:id', requireAdmin, handleGetAgentDetail);
router.post('/api/admin/ai-ops/registry/:id/control', requireAdmin, requireFullAdmin, handleControlAgent);

// --- Drill-Down Details ---
router.get('/api/admin/ai-ops/activity/:id', requireAdmin, handleGetActivityDetail);
router.get('/api/admin/ai-ops/trace/:traceId', requireAdmin, handleGetExecutionTrace);
router.get('/api/admin/ai-ops/errors/:id', requireAdmin, handleGetErrorDetail);
router.get('/api/admin/ai-ops/campaigns/:id/timeline', requireAdmin, handleGetCampaignTimeline);

// --- Agent Discovery & Health Scores ---
router.post('/api/admin/ai-ops/discover', requireAdmin, requireFullAdmin, handleDiscoverAgents);
router.get('/api/admin/ai-ops/health/agents', requireAdmin, handleGetAgentHealthScores);

// --- Emergency Controls ---

/**
 * POST /api/admin/ai-ops/emergency-stop
 * Immediately disable ALL agents. Requires { reason: string }.
 */
router.post('/api/admin/ai-ops/emergency-stop', requireAdmin, requireFullAdmin, async (req, res) => {
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
router.post('/api/admin/ai-ops/emergency-resume', requireAdmin, requireFullAdmin, async (req, res) => {
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
router.post('/api/admin/system/kill-switch', requireAdmin, requireFullAdmin, async (req, res) => {
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
router.post('/api/admin/launch/war-room', requireAdmin, requireFullAdmin, async (req, res) => {
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
router.post('/api/admin/launch/mark-start', requireAdmin, requireFullAdmin, async (_req, res) => {
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
router.post('/api/admin/system/safe-mode', requireAdmin, requireFullAdmin, async (req, res) => {
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
