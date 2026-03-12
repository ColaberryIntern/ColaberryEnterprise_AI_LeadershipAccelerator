import { Op } from 'sequelize';
import { AiAgent, ScheduledEmail } from '../../../../models';
import { logAgentActivity } from '../../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../../types';

const AGENT_NAME = 'DeptCostOptimizationAgent';

export async function runDeptCostOptimizationAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  let entitiesProcessed = 0;

  try {
    // Analyze agent compute usage
    const agents = await AiAgent.findAll({ where: { enabled: true } });
    entitiesProcessed = agents.length;

    const agentCosts: Array<{
      name: string; runs: number; avg_ms: number; errors: number; efficiency: string;
    }> = [];

    let totalRuns = 0;
    let totalErrors = 0;
    let highCostAgents = 0;

    for (const agent of agents) {
      const a = agent as any;
      const runs = a.run_count || 0;
      const avgMs = a.avg_duration_ms || 0;
      const errorCount = a.error_count || 0;
      totalRuns += runs;
      totalErrors += errorCount;

      let efficiency = 'optimal';
      if (runs > 0 && errorCount / runs > 0.2) {
        efficiency = 'wasteful — high error rate';
        highCostAgents++;
      } else if (avgMs > 30000) {
        efficiency = 'slow — consider optimization';
        highCostAgents++;
      } else if (runs === 0 && a.trigger_type === 'cron') {
        efficiency = 'idle — cron scheduled but never ran';
      }

      agentCosts.push({
        name: a.agent_name,
        runs,
        avg_ms: avgMs,
        errors: errorCount,
        efficiency,
      });
    }

    // Email sending costs
    const emailsSentToday = await ScheduledEmail.count({
      where: {
        status: 'sent',
        sent_at: { [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    });

    const recommendations: string[] = [];
    if (highCostAgents > 0) {
      recommendations.push(`${highCostAgents} agents are inefficient — review error rates and durations`);
    }
    if (totalErrors > totalRuns * 0.1) {
      recommendations.push(`System-wide error rate is ${((totalErrors / Math.max(totalRuns, 1)) * 100).toFixed(1)}% — investigate root causes`);
    }

    // Sort by highest cost (runs * avg_ms)
    const topCostAgents = agentCosts
      .sort((a, b) => (b.runs * b.avg_ms) - (a.runs * a.avg_ms))
      .slice(0, 10);

    actions.push({
      campaign_id: '',
      action: 'cost_analysis',
      reason: `Analyzed costs for ${entitiesProcessed} active agents`,
      confidence: 0.82,
      before_state: null,
      after_state: {
        agents_analyzed: entitiesProcessed,
        total_runs: totalRuns,
        total_errors: totalErrors,
        high_cost_agents: highCostAgents,
        emails_sent_today: emailsSentToday,
        top_cost_agents: topCostAgents,
        recommendations,
      },
      result: 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'cost_analysis',
      result: 'success',
      details: { agents: entitiesProcessed, high_cost: highCostAgents },
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
