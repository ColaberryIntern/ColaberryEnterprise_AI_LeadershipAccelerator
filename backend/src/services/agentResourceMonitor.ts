/**
 * Agent Resource Monitor
 *
 * Tracks per-agent resource usage (execution duration, DB writes, proposals)
 * and marks agents as "degraded" when thresholds are exceeded.
 *
 * Designed to be called after each agent execution by the orchestrator.
 */

import { Op } from 'sequelize';
import { AiAgent } from '../models';
import AgentWriteAudit from '../models/AgentWriteAudit';
import ProposedAgentAction from '../models/ProposedAgentAction';
import { logAiEvent } from './aiEventService';

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

const DEGRADED_THRESHOLDS = {
  max_avg_duration_ms: 30000,      // 30s avg execution = degraded
  max_error_rate: 0.3,             // 30% error rate = degraded
  max_writes_per_hour: 200,        // 200+ writes/hour = degraded
  max_proposals_per_hour: 100,     // 100+ proposals/hour = degraded
};

// ---------------------------------------------------------------------------
// Resource Snapshot
// ---------------------------------------------------------------------------

export interface AgentResourceSnapshot {
  agent_name: string;
  agent_id: string;
  status: string;
  enabled: boolean;
  // Execution metrics
  run_count: number;
  error_count: number;
  error_rate: number;
  avg_duration_ms: number;
  // Recent activity (last hour)
  writes_last_hour: number;
  proposals_last_hour: number;
  // Limits
  max_runs_per_hour: number | null;
  max_writes_per_execution: number | null;
  max_proposals_per_run: number | null;
  // Health
  is_degraded: boolean;
  degraded_reasons: string[];
}

/**
 * Evaluate the health of a single agent and return a resource snapshot.
 * Optionally marks the agent as degraded if thresholds exceeded.
 */
export async function evaluateAgentHealth(agentName: string, autoDegrade = false): Promise<AgentResourceSnapshot | null> {
  const agent = await AiAgent.findOne({ where: { agent_name: agentName } });
  if (!agent) return null;

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const [writesLastHour, proposalsLastHour] = await Promise.all([
    AgentWriteAudit.count({
      where: { agent_name: agentName, was_allowed: true, created_at: { [Op.gte]: oneHourAgo } },
    }),
    ProposedAgentAction.count({
      where: { agent_name: agentName, created_at: { [Op.gte]: oneHourAgo } },
    }),
  ]);

  const errorRate = agent.run_count > 0 ? agent.error_count / agent.run_count : 0;
  const degradedReasons: string[] = [];

  if (agent.avg_duration_ms && agent.avg_duration_ms > DEGRADED_THRESHOLDS.max_avg_duration_ms) {
    degradedReasons.push(`avg_duration ${agent.avg_duration_ms}ms exceeds ${DEGRADED_THRESHOLDS.max_avg_duration_ms}ms`);
  }
  if (errorRate > DEGRADED_THRESHOLDS.max_error_rate && agent.run_count >= 5) {
    degradedReasons.push(`error_rate ${(errorRate * 100).toFixed(1)}% exceeds ${DEGRADED_THRESHOLDS.max_error_rate * 100}%`);
  }
  if (writesLastHour > DEGRADED_THRESHOLDS.max_writes_per_hour) {
    degradedReasons.push(`writes_last_hour ${writesLastHour} exceeds ${DEGRADED_THRESHOLDS.max_writes_per_hour}`);
  }
  if (proposalsLastHour > DEGRADED_THRESHOLDS.max_proposals_per_hour) {
    degradedReasons.push(`proposals_last_hour ${proposalsLastHour} exceeds ${DEGRADED_THRESHOLDS.max_proposals_per_hour}`);
  }

  const isDegraded = degradedReasons.length > 0;

  // Auto-degrade: set agent status to 'error' if thresholds exceeded
  if (autoDegrade && isDegraded && agent.status !== 'error') {
    await agent.update({
      status: 'error',
      last_error: `Degraded: ${degradedReasons.join('; ')}`,
      last_error_at: new Date(),
      updated_at: new Date(),
    });
    await logAiEvent('AgentResourceMonitor', 'agent_degraded', 'agent', agent.id, {
      agent_name: agentName,
      reasons: degradedReasons,
    });
    console.warn(`[AgentResourceMonitor] Agent "${agentName}" marked DEGRADED: ${degradedReasons.join('; ')}`);
  }

  return {
    agent_name: agentName,
    agent_id: agent.id,
    status: isDegraded && autoDegrade ? 'error' : agent.status,
    enabled: agent.enabled,
    run_count: agent.run_count,
    error_count: agent.error_count,
    error_rate: Math.round(errorRate * 1000) / 1000,
    avg_duration_ms: agent.avg_duration_ms || 0,
    writes_last_hour: writesLastHour,
    proposals_last_hour: proposalsLastHour,
    max_runs_per_hour: agent.max_runs_per_hour || null,
    max_writes_per_execution: agent.max_writes_per_execution || null,
    max_proposals_per_run: agent.max_proposals_per_run || null,
    is_degraded: isDegraded,
    degraded_reasons: degradedReasons,
  };
}

/**
 * Evaluate all enabled agents and return resource snapshots.
 */
export async function evaluateAllAgents(autoDegrade = false): Promise<AgentResourceSnapshot[]> {
  const agents = await AiAgent.findAll({
    where: { enabled: true },
    attributes: ['agent_name'],
    order: [['agent_name', 'ASC']],
  });

  const snapshots: AgentResourceSnapshot[] = [];
  for (const agent of agents) {
    const snapshot = await evaluateAgentHealth(agent.agent_name, autoDegrade);
    if (snapshot) snapshots.push(snapshot);
  }
  return snapshots;
}
