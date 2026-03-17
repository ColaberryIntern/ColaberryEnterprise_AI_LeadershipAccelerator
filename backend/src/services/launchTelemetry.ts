/**
 * Launch Telemetry Service
 *
 * Lightweight real-time metrics for monitoring the first minutes after launch.
 * Tracks agent executions, campaign sends, lead creation, errors, and Cory insights.
 *
 * Designed to be polled from the admin dashboard via GET /api/admin/launch/telemetry.
 */

import { sequelize } from '../config/database';
import { Op } from 'sequelize';
import AiAgent from '../models/AiAgent';
import IntelligenceDecision from '../models/IntelligenceDecision';
import AgentTask from '../models/AgentTask';
import DepartmentReport from '../models/DepartmentReport';
import { getThrottleMetrics, getWarRoomStatus, isKillSwitchActive } from './launchSafety';

export interface LaunchTelemetry {
  timestamp: string;
  uptime_since: string | null;
  agents: {
    total: number;
    running: number;
    idle: number;
    errored: number;
    disabled: number;
  };
  campaigns: {
    active: number;
    sends_last_5min: number;
    failed_last_5min: number;
    pending: number;
  };
  leads: {
    created_last_5min: number;
    total: number;
  };
  errors: {
    agent_errors_last_5min: number;
    recent_errors: { agent: string; error: string; at: string }[];
  };
  cory: {
    insights_last_hour: number;
    tasks_today: number;
    department_reports_today: number;
  };
  safety: {
    throttle: ReturnType<typeof getThrottleMetrics>;
    war_room: ReturnType<typeof getWarRoomStatus>;
    kill_switch_active: boolean;
  };
}

let _launchTime: string | null = null;

/** Mark the launch start time for uptime tracking. */
export function markLaunchTime(): void {
  _launchTime = new Date().toISOString();
}

/**
 * Collect current launch telemetry.
 * All queries are lightweight (COUNT-based) to minimize DB load.
 */
export async function collectTelemetry(): Promise<LaunchTelemetry> {
  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Agent status breakdown
  const agents = await AiAgent.findAll({
    attributes: ['status', 'enabled'],
    raw: true,
  }) as unknown as { status: string; enabled: boolean }[];

  const agentStats = {
    total: agents.length,
    running: agents.filter(a => a.status === 'running').length,
    idle: agents.filter(a => a.enabled && a.status === 'idle').length,
    errored: agents.filter(a => a.status === 'error').length,
    disabled: agents.filter(a => !a.enabled).length,
  };

  // Campaign sends (from scheduled_emails)
  let sendsLast5min = 0;
  let failedLast5min = 0;
  let pendingActions = 0;
  let activeCampaigns = 0;
  try {
    const [sendRows] = await sequelize.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'sent' AND updated_at >= :since) as sent,
        COUNT(*) FILTER (WHERE status = 'failed' AND updated_at >= :since) as failed,
        COUNT(*) FILTER (WHERE status = 'pending') as pending
      FROM scheduled_emails
    `, { replacements: { since: fiveMinAgo.toISOString() }, raw: true }) as any;
    sendsLast5min = parseInt(sendRows?.[0]?.sent || '0', 10);
    failedLast5min = parseInt(sendRows?.[0]?.failed || '0', 10);
    pendingActions = parseInt(sendRows?.[0]?.pending || '0', 10);

    const [campRows] = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM campaigns WHERE status = 'active'`,
      { raw: true },
    ) as any;
    activeCampaigns = parseInt(campRows?.[0]?.cnt || '0', 10);
  } catch {
    // Tables may not exist in test environment
  }

  // Lead creation
  let leadsLast5min = 0;
  let totalLeads = 0;
  try {
    const [leadRows] = await sequelize.query(`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= :since) as recent,
        COUNT(*) as total
      FROM leads
    `, { replacements: { since: fiveMinAgo.toISOString() }, raw: true }) as any;
    leadsLast5min = parseInt(leadRows?.[0]?.recent || '0', 10);
    totalLeads = parseInt(leadRows?.[0]?.total || '0', 10);
  } catch {
    // leads table may not exist
  }

  // Agent errors (from ai_agent_activity_logs)
  let agentErrorsLast5min = 0;
  let recentErrors: { agent: string; error: string; at: string }[] = [];
  try {
    const [errorRows] = await sequelize.query(`
      SELECT a.agent_name, l.details->>'error' as error, l.created_at
      FROM ai_agent_activity_logs l
      JOIN ai_agents a ON a.id = l.agent_id
      WHERE l.result = 'error' AND l.created_at >= :since
      ORDER BY l.created_at DESC
      LIMIT 10
    `, { replacements: { since: fiveMinAgo.toISOString() }, raw: true }) as any;
    agentErrorsLast5min = errorRows?.length || 0;
    recentErrors = (errorRows || []).map((r: any) => ({
      agent: r.agent_name,
      error: r.error || 'unknown',
      at: r.created_at?.toString() || '',
    }));
  } catch {
    // activity log table may not exist
  }

  // Cory intelligence metrics
  const insightsLastHour = await IntelligenceDecision.count({
    where: { timestamp: { [Op.gte]: oneHourAgo } },
  }).catch(() => 0);

  const tasksToday = await AgentTask.count({
    where: { created_at: { [Op.gte]: oneDayAgo } },
  }).catch(() => 0);

  const deptReportsToday = await DepartmentReport.count({
    where: { created_at: { [Op.gte]: oneDayAgo } },
  }).catch(() => 0);

  // Safety controls
  const killSwitchActive = await isKillSwitchActive();

  return {
    timestamp: now.toISOString(),
    uptime_since: _launchTime,
    agents: agentStats,
    campaigns: {
      active: activeCampaigns,
      sends_last_5min: sendsLast5min,
      failed_last_5min: failedLast5min,
      pending: pendingActions,
    },
    leads: {
      created_last_5min: leadsLast5min,
      total: totalLeads,
    },
    errors: {
      agent_errors_last_5min: agentErrorsLast5min,
      recent_errors: recentErrors,
    },
    cory: {
      insights_last_hour: insightsLastHour,
      tasks_today: tasksToday,
      department_reports_today: deptReportsToday,
    },
    safety: {
      throttle: getThrottleMetrics(),
      war_room: getWarRoomStatus(),
      kill_switch_active: killSwitchActive,
    },
  };
}
