/**
 * Agent Safety Alert Service
 *
 * Monitors agent behavior and triggers alerts when thresholds are exceeded:
 * - >20 proposals/hour
 * - >50 writes/hour
 * - >30s execution duration
 *
 * Alerts are logged to AiSystemEvent via logAiEvent.
 */

import { Op } from 'sequelize';
import AgentWriteAudit from '../models/AgentWriteAudit';
import ProposedAgentAction from '../models/ProposedAgentAction';
import { logAiEvent } from './aiEventService';

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

const ALERT_THRESHOLDS = {
  max_proposals_per_hour: 20,
  max_writes_per_hour: 50,
  max_execution_duration_ms: 30000,
};

export type AlertSeverity = 'warning' | 'critical';
export type AlertType = 'excessive_proposals' | 'excessive_writes' | 'slow_execution';

export interface SafetyAlert {
  agent_name: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  message: string;
  current_value: number;
  threshold: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Alert Evaluation
// ---------------------------------------------------------------------------

/**
 * Check an agent's recent activity against safety thresholds after execution.
 * Call this from the orchestrator after each agent run.
 */
export async function evaluateAgentSafety(
  agentName: string,
  executionDurationMs: number,
): Promise<SafetyAlert[]> {
  const alerts: SafetyAlert[] = [];
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  // Check execution duration
  if (executionDurationMs > ALERT_THRESHOLDS.max_execution_duration_ms) {
    const alert: SafetyAlert = {
      agent_name: agentName,
      alert_type: 'slow_execution',
      severity: executionDurationMs > 60000 ? 'critical' : 'warning',
      message: `Agent took ${(executionDurationMs / 1000).toFixed(1)}s (threshold: ${ALERT_THRESHOLDS.max_execution_duration_ms / 1000}s)`,
      current_value: executionDurationMs,
      threshold: ALERT_THRESHOLDS.max_execution_duration_ms,
      timestamp: new Date().toISOString(),
    };
    alerts.push(alert);
  }

  // Check writes per hour
  const writesLastHour = await AgentWriteAudit.count({
    where: {
      agent_name: agentName,
      was_allowed: true,
      created_at: { [Op.gte]: oneHourAgo },
    },
  });

  if (writesLastHour > ALERT_THRESHOLDS.max_writes_per_hour) {
    const alert: SafetyAlert = {
      agent_name: agentName,
      alert_type: 'excessive_writes',
      severity: writesLastHour > ALERT_THRESHOLDS.max_writes_per_hour * 2 ? 'critical' : 'warning',
      message: `Agent performed ${writesLastHour} writes in the last hour (threshold: ${ALERT_THRESHOLDS.max_writes_per_hour})`,
      current_value: writesLastHour,
      threshold: ALERT_THRESHOLDS.max_writes_per_hour,
      timestamp: new Date().toISOString(),
    };
    alerts.push(alert);
  }

  // Check proposals per hour
  const proposalsLastHour = await ProposedAgentAction.count({
    where: {
      agent_name: agentName,
      created_at: { [Op.gte]: oneHourAgo },
    },
  });

  if (proposalsLastHour > ALERT_THRESHOLDS.max_proposals_per_hour) {
    const alert: SafetyAlert = {
      agent_name: agentName,
      alert_type: 'excessive_proposals',
      severity: proposalsLastHour > ALERT_THRESHOLDS.max_proposals_per_hour * 2 ? 'critical' : 'warning',
      message: `Agent created ${proposalsLastHour} proposals in the last hour (threshold: ${ALERT_THRESHOLDS.max_proposals_per_hour})`,
      current_value: proposalsLastHour,
      threshold: ALERT_THRESHOLDS.max_proposals_per_hour,
      timestamp: new Date().toISOString(),
    };
    alerts.push(alert);
  }

  // Log all alerts to AiSystemEvent
  for (const alert of alerts) {
    await logAiEvent('AgentSafetyAlertService', `safety_alert_${alert.alert_type}`, 'agent', undefined, {
      agent_name: alert.agent_name,
      severity: alert.severity,
      message: alert.message,
      current_value: alert.current_value,
      threshold: alert.threshold,
    }).catch(() => {});

    console.warn(`[SafetyAlert] ${alert.severity.toUpperCase()}: ${alert.agent_name} — ${alert.message}`);
  }

  return alerts;
}

/**
 * Run a full safety sweep across all agents.
 * Returns all active alerts sorted by severity.
 */
export async function runSafetySweep(): Promise<SafetyAlert[]> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const allAlerts: SafetyAlert[] = [];

  // Find agents that have been active in the last hour
  const recentAgents = await AgentWriteAudit.findAll({
    attributes: ['agent_name'],
    where: { created_at: { [Op.gte]: oneHourAgo } },
    group: ['agent_name'],
  });

  for (const row of recentAgents) {
    const alerts = await evaluateAgentSafety((row as any).agent_name, 0);
    allAlerts.push(...alerts);
  }

  // Sort: critical first, then warning
  allAlerts.sort((a, b) => {
    if (a.severity === 'critical' && b.severity !== 'critical') return -1;
    if (a.severity !== 'critical' && b.severity === 'critical') return 1;
    return 0;
  });

  return allAlerts;
}
