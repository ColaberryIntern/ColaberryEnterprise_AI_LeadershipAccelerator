import { Op } from 'sequelize';
import { AiAgent } from '../../../../models';
import { logAgentActivity } from '../../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../../types';

const AGENT_NAME = 'DeptAgentPerformanceAgent';

export async function runDeptAgentPerformanceAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  let entitiesProcessed = 0;

  try {
    const agents = await AiAgent.findAll({
      where: { enabled: true },
      attributes: [
        'agent_name', 'category', 'status', 'run_count', 'error_count',
        'avg_duration_ms', 'last_run_at', 'last_error',
      ],
      order: [['run_count', 'DESC']],
    });

    entitiesProcessed = agents.length;

    // Compute success rates and rank
    const rankings = agents.map((a: any) => {
      const runs = a.run_count || 0;
      const errs = a.error_count || 0;
      const successRate = runs > 0 ? ((runs - errs) / runs * 100).toFixed(1) : 'N/A';
      return {
        name: a.agent_name,
        category: a.category,
        status: a.status,
        runs,
        errors: errs,
        success_rate: successRate,
        avg_ms: a.avg_duration_ms || 0,
        last_run: a.last_run_at,
      };
    });

    // Group by category for department view
    const byCategory: Record<string, { count: number; healthy: number; errored: number; total_runs: number }> = {};
    for (const r of rankings) {
      if (!byCategory[r.category]) {
        byCategory[r.category] = { count: 0, healthy: 0, errored: 0, total_runs: 0 };
      }
      byCategory[r.category].count++;
      if (r.status !== 'error') byCategory[r.category].healthy++;
      else byCategory[r.category].errored++;
      byCategory[r.category].total_runs += r.runs;
    }

    // Top 5 and bottom 5 by success rate
    const withRate = rankings.filter(r => r.success_rate !== 'N/A');
    const topPerformers = [...withRate].sort((a, b) => parseFloat(b.success_rate as string) - parseFloat(a.success_rate as string)).slice(0, 5);
    const bottomPerformers = [...withRate].sort((a, b) => parseFloat(a.success_rate as string) - parseFloat(b.success_rate as string)).slice(0, 5);

    actions.push({
      campaign_id: '',
      action: 'agent_performance_analysis',
      reason: `Ranked ${entitiesProcessed} agents by performance`,
      confidence: 0.90,
      before_state: null,
      after_state: {
        total_agents: entitiesProcessed,
        by_category: byCategory,
        top_performers: topPerformers,
        bottom_performers: bottomPerformers,
      },
      result: 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'agent_performance_analysis',
      result: 'success',
      details: { agents: entitiesProcessed },
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
