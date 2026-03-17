/**
 * Shared utilities for department super agents.
 *
 * Each super agent aggregates signals from subordinate agents in its group,
 * detects anomalies, and produces a DepartmentReport.
 */

import AiAgent from '../../../../models/AiAgent';
import DepartmentReport from '../../../../models/DepartmentReport';
import { logAiEvent } from '../../../aiEventService';
import { Op } from 'sequelize';

export interface SubordinateStatus {
  agent_name: string;
  status: string;
  enabled: boolean;
  last_run_at: Date | null;
  error_count: number;
  run_count: number;
  avg_duration_ms: number | null;
  last_error: string | null;
}

export interface SuperAgentResult {
  department: string;
  subordinates: SubordinateStatus[];
  healthy: number;
  errored: number;
  paused: number;
  total: number;
  anomalies: string[];
  recommendations: string[];
}

/**
 * Collect status of all agents in a given agent_group.
 * Returns empty array on DB failure to avoid crashing the super agent cycle.
 */
export async function collectGroupStatus(agentGroup: string): Promise<SubordinateStatus[]> {
  try {
    const agents = await AiAgent.findAll({
      where: { agent_group: agentGroup },
      attributes: ['agent_name', 'status', 'enabled', 'last_run_at', 'error_count', 'run_count', 'avg_duration_ms', 'last_error'],
      order: [['agent_name', 'ASC']],
    });

    return agents.map(a => ({
      agent_name: a.agent_name,
      status: a.status,
      enabled: a.enabled,
      last_run_at: a.last_run_at,
      error_count: a.error_count,
      run_count: a.run_count,
      avg_duration_ms: a.avg_duration_ms,
      last_error: a.last_error,
    }));
  } catch (err) {
    await logAiEvent('SuperAgentBase', 'SUPER_AGENT_ERROR', 'ai_agents', agentGroup, {
      error: (err as Error).message,
      phase: 'collectGroupStatus',
    }).catch(() => {});
    console.error(`[SuperAgent] Failed to collect group status for ${agentGroup}:`, (err as Error).message);
    return [];
  }
}

/**
 * Detect anomalies in subordinate agent statuses.
 */
export function detectAnomalies(subordinates: SubordinateStatus[]): string[] {
  const anomalies: string[] = [];
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  for (const sub of subordinates) {
    if (sub.status === 'error') {
      anomalies.push(`${sub.agent_name} is in error state (${sub.error_count} errors)`);
    }
    if (sub.enabled && sub.last_run_at && sub.last_run_at < oneHourAgo && sub.run_count > 0) {
      anomalies.push(`${sub.agent_name} has not run in over 1 hour`);
    }
    // Detect failures earlier for new agents with low run volume
    if (sub.error_count >= 5) {
      anomalies.push(`${sub.agent_name} has ${sub.error_count} errors`);
    } else if (sub.run_count >= 5 && sub.error_count > 0) {
      const errorRate = sub.error_count / sub.run_count;
      if (errorRate > 0.3) {
        anomalies.push(`${sub.agent_name} has ${(errorRate * 100).toFixed(0)}% error rate`);
      }
    }
    if (sub.avg_duration_ms && sub.avg_duration_ms > 30000) {
      anomalies.push(`${sub.agent_name} avg duration ${(sub.avg_duration_ms / 1000).toFixed(1)}s exceeds 30s threshold`);
    }
  }

  return anomalies;
}

/**
 * Generate recommendations based on detected anomalies.
 */
export function generateRecommendations(anomalies: string[], subordinates: SubordinateStatus[]): string[] {
  const recommendations: string[] = [];

  const erroredAgents = subordinates.filter(s => s.status === 'error');
  if (erroredAgents.length > 0) {
    recommendations.push(`Investigate and restart ${erroredAgents.length} errored agent(s): ${erroredAgents.map(a => a.agent_name).join(', ')}`);
  }

  const disabledAgents = subordinates.filter(s => !s.enabled);
  if (disabledAgents.length > subordinates.length * 0.5 && subordinates.length > 2) {
    recommendations.push(`Over 50% of department agents are disabled — review if intentional`);
  }

  if (anomalies.length === 0) {
    recommendations.push('All agents operating within normal parameters');
  }

  return recommendations;
}

/**
 * Run a standard super agent cycle: collect, analyze, persist report.
 */
export async function runSuperAgentCycle(
  agentGroup: string,
  department: string,
  superAgentName: string,
): Promise<SuperAgentResult> {
  const subordinates = await collectGroupStatus(agentGroup);

  const healthy = subordinates.filter(s => s.enabled && (s.status === 'idle' || s.status === 'running')).length;
  const errored = subordinates.filter(s => s.status === 'error').length;
  const paused = subordinates.filter(s => s.status === 'paused' || !s.enabled).length;

  const anomalies = detectAnomalies(subordinates);
  const recommendations = generateRecommendations(anomalies, subordinates);

  const summary = `${department}: ${healthy}/${subordinates.length} healthy, ${errored} errored, ${paused} paused. ${anomalies.length} anomalies detected.`;

  // Persist department report
  await DepartmentReport.create({
    department,
    report_type: anomalies.length > 0 ? 'alert' : 'periodic',
    summary,
    metrics: {
      total: subordinates.length,
      healthy,
      errored,
      paused,
      avg_duration_ms: subordinates.reduce((sum, s) => sum + (s.avg_duration_ms || 0), 0) / (subordinates.length || 1),
    },
    anomalies: anomalies.length > 0 ? anomalies : null,
    recommendations: recommendations.length > 0 ? recommendations : null,
    source_agent: superAgentName,
  });

  await logAiEvent(superAgentName, 'department_report', 'department_reports', department, {
    total: subordinates.length,
    healthy,
    errored,
    anomalies_count: anomalies.length,
  }).catch(() => {});

  return {
    department,
    subordinates,
    healthy,
    errored,
    paused,
    total: subordinates.length,
    anomalies,
    recommendations,
  };
}
