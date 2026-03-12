import { Op } from 'sequelize';
import { AiAgent } from '../../../../models';
import { logAgentActivity } from '../../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../../types';

const AGENT_NAME = 'DeptSystemHealthAgent';

export async function runDeptSystemHealthAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  let entitiesProcessed = 0;

  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Agent fleet health
    const totalAgents = await AiAgent.count({ where: { enabled: true } });
    const runningAgents = await AiAgent.count({ where: { status: 'running' } });
    const erroredAgents = await AiAgent.count({ where: { status: 'error', enabled: true } });
    const pausedAgents = await AiAgent.count({ where: { status: 'paused' } });
    const recentlyRan = await AiAgent.count({
      where: { last_run_at: { [Op.gte]: oneHourAgo } },
    });

    // Compute avg duration across all agents
    const agentsWithDuration = await AiAgent.findAll({
      where: { avg_duration_ms: { [Op.gt]: 0 } } as any,
      attributes: ['avg_duration_ms'],
    });
    const avgDurationAll = agentsWithDuration.length > 0
      ? Math.round(agentsWithDuration.reduce((sum: number, a: any) => sum + (a.avg_duration_ms || 0), 0) / agentsWithDuration.length)
      : 0;

    // Slowest agents
    const slowestAgents = await AiAgent.findAll({
      where: { avg_duration_ms: { [Op.gt]: 0 }, enabled: true } as any,
      order: [['avg_duration_ms', 'DESC']],
      limit: 5,
      attributes: ['agent_name', 'avg_duration_ms'],
    });

    entitiesProcessed = totalAgents;

    // Compute health score (0-100)
    let healthScore = 100;
    if (totalAgents > 0) {
      healthScore -= (erroredAgents / totalAgents) * 40;
      healthScore -= (pausedAgents / totalAgents) * 10;
      if (recentlyRan < totalAgents * 0.3) healthScore -= 15;
    }
    if (avgDurationAll > 30000) healthScore -= 10;
    healthScore = Math.max(0, Math.round(healthScore));

    const alerts: string[] = [];
    if (erroredAgents > 0) alerts.push(`${erroredAgents} agents in error state`);
    if (recentlyRan < totalAgents * 0.2 && totalAgents > 10) alerts.push('Low agent activity — most agents haven\'t run in the last hour');
    if (avgDurationAll > 30000) alerts.push(`High avg agent duration: ${avgDurationAll}ms`);

    actions.push({
      campaign_id: '',
      action: 'system_health_check',
      reason: `Checked health of ${entitiesProcessed} agents`,
      confidence: 0.92,
      before_state: null,
      after_state: {
        health_score: healthScore,
        total_agents: totalAgents,
        running: runningAgents,
        errored: erroredAgents,
        paused: pausedAgents,
        recently_ran: recentlyRan,
        avg_duration_ms: avgDurationAll,
        slowest_agents: slowestAgents.map((a: any) => ({ name: a.agent_name, avg_ms: a.avg_duration_ms })),
        alerts,
      },
      result: healthScore < 70 ? 'flagged' : 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'system_health_check',
      result: 'success',
      details: { health_score: healthScore, alerts: alerts.length },
    }).catch(() => {});
  } catch (err: any) {
    errors.push(err.message);
  }

  return {
    agent_name: AGENT_NAME,
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - startTime,
    entities_processed: entitiesProcessed,
  };
}
