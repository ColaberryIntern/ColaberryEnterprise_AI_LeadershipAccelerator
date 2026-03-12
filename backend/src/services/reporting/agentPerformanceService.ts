// ─── Agent Performance Service ────────────────────────────────────────────
// Tracks all agent KPIs: run counts, error rates, durations, and impact scores.

import { AiAgent, AiAgentActivityLog } from '../../models';
import { getDepartmentForCategory } from '../../intelligence/agents/agentFactory';
import { sequelize } from '../../config/database';
import { QueryTypes, Op } from 'sequelize';

export interface AgentKPI {
  agent_id: string;
  agent_name: string;
  department: string;
  category: string;
  status: string;
  run_count: number;
  error_count: number;
  error_rate: number;
  avg_duration_ms: number;
  actions_last_24h: number;
  success_rate: number;
  impact_score: number;
}

// ─── Compute Agent KPIs ───────────────────────────────────────────────────

export async function computeAgentKPIs(): Promise<AgentKPI[]> {
  const agents = await AiAgent.findAll({
    where: { enabled: true },
    attributes: ['id', 'agent_name', 'category', 'status', 'run_count', 'error_count', 'avg_duration_ms'],
    raw: true,
  });

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Get recent activity counts per agent
  const recentActivity = await sequelize.query<any>(`
    SELECT agent_id,
           COUNT(*) as total_actions,
           COUNT(*) FILTER (WHERE result = 'success') as success_count,
           COUNT(*) FILTER (WHERE result = 'failed') as fail_count
    FROM ai_agent_activity_logs
    WHERE created_at >= :dayAgo
    GROUP BY agent_id
  `, {
    type: QueryTypes.SELECT,
    replacements: { dayAgo: dayAgo.toISOString() },
  });

  const activityMap: Record<string, any> = {};
  for (const a of recentActivity) {
    activityMap[a.agent_id] = a;
  }

  return agents.map((agent: any) => {
    const activity = activityMap[agent.id] || { total_actions: 0, success_count: 0, fail_count: 0 };
    const totalActions = Number(activity.total_actions) || 0;
    const successCount = Number(activity.success_count) || 0;

    return {
      agent_id: agent.id,
      agent_name: agent.agent_name,
      department: getDepartmentForCategory(agent.category),
      category: agent.category,
      status: agent.status,
      run_count: agent.run_count || 0,
      error_count: agent.error_count || 0,
      error_rate: agent.run_count > 0 ? (agent.error_count || 0) / agent.run_count : 0,
      avg_duration_ms: agent.avg_duration_ms || 0,
      actions_last_24h: totalActions,
      success_rate: totalActions > 0 ? successCount / totalActions : 1,
      impact_score: computeImpactScore(agent, totalActions, successCount),
    };
  });
}

function computeImpactScore(agent: any, recentActions: number, recentSuccess: number): number {
  const volumeScore = Math.min((agent.run_count || 0) / 1000, 1) * 0.3;
  const reliabilityScore = (1 - (agent.error_count || 0) / Math.max(agent.run_count || 1, 1)) * 0.3;
  const activityScore = Math.min(recentActions / 50, 1) * 0.2;
  const successScore = (recentActions > 0 ? recentSuccess / recentActions : 1) * 0.2;
  return volumeScore + reliabilityScore + activityScore + successScore;
}

// ─── Rankings ─────────────────────────────────────────────────────────────

export async function getAgentRankings(
  metric: string = 'impact_score',
  limit: number = 20,
): Promise<AgentKPI[]> {
  const kpis = await computeAgentKPIs();

  kpis.sort((a, b) => {
    const aVal = (a as any)[metric] ?? 0;
    const bVal = (b as any)[metric] ?? 0;
    return bVal - aVal;
  });

  return kpis.slice(0, limit);
}

// ─── Department Agent Health ──────────────────────────────────────────────

export async function getDepartmentAgentHealth(department: string): Promise<{
  total_agents: number;
  healthy: number;
  errored: number;
  paused: number;
  avg_error_rate: number;
  top_performers: AgentKPI[];
}> {
  const kpis = await computeAgentKPIs();
  const deptKpis = kpis.filter(k => k.department === department);

  const healthy = deptKpis.filter(k => k.status !== 'error' && k.status !== 'paused').length;
  const errored = deptKpis.filter(k => k.status === 'error').length;
  const paused = deptKpis.filter(k => k.status === 'paused').length;
  const avgErrorRate = deptKpis.length > 0
    ? deptKpis.reduce((sum, k) => sum + k.error_rate, 0) / deptKpis.length
    : 0;

  const topPerformers = [...deptKpis].sort((a, b) => b.impact_score - a.impact_score).slice(0, 5);

  return {
    total_agents: deptKpis.length,
    healthy,
    errored,
    paused,
    avg_error_rate: avgErrorRate,
    top_performers: topPerformers,
  };
}
