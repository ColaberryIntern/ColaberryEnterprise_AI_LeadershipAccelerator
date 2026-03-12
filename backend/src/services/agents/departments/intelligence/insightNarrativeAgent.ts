import { Op } from 'sequelize';
import { AiAgent } from '../../../../models';
import { logAgentActivity } from '../../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../../types';

const AGENT_NAME = 'DeptInsightNarrativeAgent';

export async function runDeptInsightNarrativeAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  let entitiesProcessed = 0;

  try {
    // Read last_result from all recently-run agents to compose a narrative
    const recentAgents = await AiAgent.findAll({
      where: {
        last_run_at: { [Op.ne]: null },
        last_result: { [Op.ne]: null },
      } as any,
      order: [['last_run_at', 'DESC']],
      limit: 50,
    });

    entitiesProcessed = recentAgents.length;
    const narrativePoints: string[] = [];

    for (const agent of recentAgents) {
      const a = agent as any;
      const result = a.last_result;
      if (!result || !result.actions_taken) continue;

      for (const action of result.actions_taken) {
        const state = action.after_state;
        if (!state) continue;

        // Extract key metrics and convert to narrative
        if (state.recommendations && Array.isArray(state.recommendations)) {
          for (const rec of state.recommendations.slice(0, 2)) {
            narrativePoints.push(`[${a.agent_name}] ${rec}`);
          }
        }
      }
    }

    // Compose executive narrative
    const narrative = narrativePoints.length > 0
      ? narrativePoints.slice(0, 15).join('\n')
      : 'All systems operating normally. No significant insights to report.';

    const agentHealth = {
      total: recentAgents.length,
      healthy: recentAgents.filter((a: any) => a.status !== 'error').length,
      errored: recentAgents.filter((a: any) => a.status === 'error').length,
    };

    actions.push({
      campaign_id: '',
      action: 'insight_narrative',
      reason: `Composed narrative from ${entitiesProcessed} agent results`,
      confidence: 0.85,
      before_state: null,
      after_state: {
        agents_read: entitiesProcessed,
        narrative_points: narrativePoints.length,
        narrative,
        agent_health: agentHealth,
      },
      result: 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'insight_narrative',
      result: 'success',
      details: { agents_read: entitiesProcessed, points: narrativePoints.length },
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
