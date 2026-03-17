/**
 * Launch Safety Controls
 *
 * Provides three safety mechanisms for production launch:
 *
 * 1. Agent Storm Protection — rate-limits agent executions per minute
 * 2. Global Kill Switch — pauses all campaigns + disables outbound agents
 * 3. War Room Mode — temporary high-frequency monitoring after launch
 *
 * All controls are optional and non-destructive.
 */

import AiAgent from '../models/AiAgent';
import { logAiEvent } from './aiEventService';
import { getSetting, setSetting } from './settingsService';

// ─── 1. Agent Storm Protection ──────────────────────────────────────────────

const MAX_AGENT_EXECUTIONS_PER_MINUTE = 50;

interface ThrottleState {
  executions: number;
  windowStart: number;
  queued: (() => void)[];
  drainTimer: ReturnType<typeof setTimeout> | null;
}

const _throttle: ThrottleState = {
  executions: 0,
  windowStart: Date.now(),
  queued: [],
  drainTimer: null,
};

function resetWindowIfExpired(): void {
  const now = Date.now();
  if (now - _throttle.windowStart >= 60_000) {
    _throttle.executions = 0;
    _throttle.windowStart = now;
  }
}

function drainQueue(): void {
  resetWindowIfExpired();
  while (_throttle.queued.length > 0 && _throttle.executions < MAX_AGENT_EXECUTIONS_PER_MINUTE) {
    const next = _throttle.queued.shift();
    if (next) {
      _throttle.executions++;
      next();
    }
  }
  if (_throttle.queued.length > 0 && !_throttle.drainTimer) {
    const msUntilReset = 60_000 - (Date.now() - _throttle.windowStart);
    _throttle.drainTimer = setTimeout(() => {
      _throttle.drainTimer = null;
      drainQueue();
    }, Math.max(msUntilReset, 1000));
  }
}

/**
 * Wrap an agent runner with storm protection.
 * If the per-minute limit is exceeded, execution is queued and delayed.
 * Returns the original runner's result.
 */
export function throttledExecution<T>(runner: () => Promise<T>): Promise<T> {
  resetWindowIfExpired();

  if (_throttle.executions < MAX_AGENT_EXECUTIONS_PER_MINUTE) {
    _throttle.executions++;
    return runner();
  }

  // Rate limit exceeded — queue
  return new Promise<T>((resolve, reject) => {
    _throttle.queued.push(() => {
      runner().then(resolve).catch(reject);
    });

    logAiEvent('LaunchSafety', 'AGENT_RATE_LIMIT_TRIGGERED', 'ai_agents', undefined, {
      executions_this_minute: _throttle.executions,
      queued: _throttle.queued.length,
      limit: MAX_AGENT_EXECUTIONS_PER_MINUTE,
    }).catch(() => {});

    console.warn(`[LaunchSafety] Agent rate limit triggered (${_throttle.executions}/${MAX_AGENT_EXECUTIONS_PER_MINUTE}). Queued: ${_throttle.queued.length}`);

    drainQueue();
  });
}

/** Get current throttle metrics (for telemetry). */
export function getThrottleMetrics(): {
  executions_this_minute: number;
  queued: number;
  limit: number;
  window_start: string;
} {
  resetWindowIfExpired();
  return {
    executions_this_minute: _throttle.executions,
    queued: _throttle.queued.length,
    limit: MAX_AGENT_EXECUTIONS_PER_MINUTE,
    window_start: new Date(_throttle.windowStart).toISOString(),
  };
}

// ─── 2. Global Kill Switch ──────────────────────────────────────────────────

const KILL_SWITCH_KEY = 'system_kill_switch';

// Outbound messaging agent categories that should be disabled on kill switch
const OUTBOUND_AGENT_CATEGORIES = [
  'email', 'sms', 'voice', 'outbound', 'messaging',
  'admissions_email', 'admissions_sms', 'admissions_voice',
];

/**
 * Check if the global kill switch is active.
 */
export async function isKillSwitchActive(): Promise<boolean> {
  try {
    const val = await getSetting(KILL_SWITCH_KEY);
    return val === true || val === 'true';
  } catch {
    return false;
  }
}

/**
 * Activate the global kill switch.
 * - Pauses all active campaigns
 * - Disables outbound messaging agents
 * - Logs CRITICAL_SYSTEM_EVENT
 */
export async function activateKillSwitch(reason: string, activatedBy: string): Promise<{
  campaigns_paused: number;
  agents_disabled: number;
}> {
  await setSetting(KILL_SWITCH_KEY, true);

  // Pause all active campaigns
  const [, pauseResult] = await AiAgent.sequelize!.query(`
    UPDATE campaigns SET status = 'paused', updated_at = NOW()
    WHERE status = 'active'
  `) as any;
  const campaignsPaused = pauseResult?.rowCount || 0;

  // Disable outbound messaging agents
  const [, agentResult] = await AiAgent.sequelize!.query(`
    UPDATE ai_agents SET enabled = false, updated_at = NOW()
    WHERE category = ANY(:categories) AND enabled = true
  `, {
    replacements: { categories: OUTBOUND_AGENT_CATEGORIES },
  }) as any;
  const agentsDisabled = agentResult?.rowCount || 0;

  await logAiEvent('LaunchSafety', 'CRITICAL_SYSTEM_EVENT', 'system', undefined, {
    action: 'kill_switch_activated',
    reason,
    activated_by: activatedBy,
    campaigns_paused: campaignsPaused,
    agents_disabled: agentsDisabled,
  }).catch(() => {});

  console.error(`[KILL SWITCH] ACTIVATED by ${activatedBy}: ${reason}. Paused ${campaignsPaused} campaigns, disabled ${agentsDisabled} agents.`);

  return { campaigns_paused: campaignsPaused, agents_disabled: agentsDisabled };
}

/**
 * Deactivate the global kill switch.
 * Does NOT automatically re-enable campaigns or agents — that requires manual action.
 */
export async function deactivateKillSwitch(deactivatedBy: string): Promise<void> {
  await setSetting(KILL_SWITCH_KEY, false);

  await logAiEvent('LaunchSafety', 'KILL_SWITCH_DEACTIVATED', 'system', undefined, {
    deactivated_by: deactivatedBy,
  }).catch(() => {});

  console.log(`[KILL SWITCH] Deactivated by ${deactivatedBy}. Campaigns and agents must be manually re-enabled.`);
}

// ─── 3. War Room Mode ───────────────────────────────────────────────────────

const WAR_ROOM_DURATION_MS = 10 * 60 * 1000; // 10 minutes

interface WarRoomState {
  active: boolean;
  started_at: number | null;
  auto_disable_timer: ReturnType<typeof setTimeout> | null;
  intervals: ReturnType<typeof setInterval>[];
}

const _warRoom: WarRoomState = {
  active: false,
  started_at: null,
  auto_disable_timer: null,
  intervals: [],
};

/**
 * Activate War Room Mode.
 * Runs strategic cycle + super agent checks at elevated frequency.
 * Auto-disables after 10 minutes.
 */
export async function activateWarRoom(): Promise<{
  active: boolean;
  duration_ms: number;
  auto_disable_at: string;
}> {
  if (_warRoom.active) {
    return {
      active: true,
      duration_ms: WAR_ROOM_DURATION_MS,
      auto_disable_at: new Date((_warRoom.started_at || Date.now()) + WAR_ROOM_DURATION_MS).toISOString(),
    };
  }

  _warRoom.active = true;
  _warRoom.started_at = Date.now();

  // Strategic cycle every 2 minutes
  const strategicInterval = setInterval(async () => {
    if (!_warRoom.active) return;
    try {
      const { runCoryStrategicCycle } = await import('./cory/coryBrain');
      await runCoryStrategicCycle();
      console.log('[WAR ROOM] Strategic cycle completed');
    } catch (err) {
      console.error('[WAR ROOM] Strategic cycle error:', (err as Error).message);
    }
  }, 2 * 60 * 1000);

  // Super agent health every 2 minutes (staggered 1 min from strategic)
  const superAgentInterval = setInterval(async () => {
    if (!_warRoom.active) return;
    try {
      const { runSuperAgentCycle } = await import('./agents/departments/superAgents/superAgentBase');
      const groups = [
        { group: 'campaign_ops', dept: 'Marketing', name: 'CampaignOpsSuperAgent' },
        { group: 'system_resilience', dept: 'Infrastructure', name: 'SystemResilienceSuperAgent' },
      ];
      for (const g of groups) {
        await runSuperAgentCycle(g.group, g.dept, g.name);
      }
      console.log('[WAR ROOM] Super agent health checks completed');
    } catch (err) {
      console.error('[WAR ROOM] Super agent check error:', (err as Error).message);
    }
  }, 2 * 60 * 1000 + 60_000);

  // Campaign activity monitor every minute (raw SQL to avoid model type issues)
  const campaignInterval = setInterval(async () => {
    if (!_warRoom.active) return;
    try {
      const { sequelize: db } = await import('../config/database');
      const oneMinAgo = new Date(Date.now() - 60_000).toISOString();

      const [rows] = await db.query(`
        SELECT
          (SELECT COUNT(*) FROM scheduled_emails WHERE status = 'sent' AND updated_at >= :since) as sent,
          (SELECT COUNT(*) FROM scheduled_emails WHERE status = 'failed' AND updated_at >= :since) as failed,
          (SELECT COUNT(*) FROM campaigns WHERE status = 'active') as active
      `, { replacements: { since: oneMinAgo }, raw: true }) as any;

      const r = rows?.[0] || {};
      console.log(`[WAR ROOM] Campaigns: ${r.active || 0} active | Last min: ${r.sent || 0} sent, ${r.failed || 0} failed`);
    } catch (err) {
      console.error('[WAR ROOM] Campaign monitor error:', (err as Error).message);
    }
  }, 60_000);

  _warRoom.intervals.push(strategicInterval, superAgentInterval, campaignInterval);

  // Auto-disable after 10 minutes
  _warRoom.auto_disable_timer = setTimeout(() => {
    deactivateWarRoom();
    console.log('[WAR ROOM] Auto-disabled after 10 minutes');
  }, WAR_ROOM_DURATION_MS);

  await logAiEvent('LaunchSafety', 'WAR_ROOM_ACTIVATED', 'system', undefined, {
    duration_ms: WAR_ROOM_DURATION_MS,
    auto_disable_at: new Date(Date.now() + WAR_ROOM_DURATION_MS).toISOString(),
  }).catch(() => {});

  console.log(`[WAR ROOM] Activated. Auto-disables in ${WAR_ROOM_DURATION_MS / 60_000} minutes.`);

  return {
    active: true,
    duration_ms: WAR_ROOM_DURATION_MS,
    auto_disable_at: new Date(Date.now() + WAR_ROOM_DURATION_MS).toISOString(),
  };
}

/**
 * Deactivate War Room Mode.
 */
export function deactivateWarRoom(): void {
  _warRoom.active = false;
  for (const interval of _warRoom.intervals) {
    clearInterval(interval);
  }
  _warRoom.intervals = [];
  if (_warRoom.auto_disable_timer) {
    clearTimeout(_warRoom.auto_disable_timer);
    _warRoom.auto_disable_timer = null;
  }
  _warRoom.started_at = null;
}

/** Get War Room status. */
export function getWarRoomStatus(): {
  active: boolean;
  started_at: string | null;
  remaining_ms: number | null;
} {
  if (!_warRoom.active || !_warRoom.started_at) {
    return { active: false, started_at: null, remaining_ms: null };
  }
  const elapsed = Date.now() - _warRoom.started_at;
  return {
    active: true,
    started_at: new Date(_warRoom.started_at).toISOString(),
    remaining_ms: Math.max(0, WAR_ROOM_DURATION_MS - elapsed),
  };
}
