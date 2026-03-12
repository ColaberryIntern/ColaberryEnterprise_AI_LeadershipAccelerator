import { Op } from 'sequelize';
import { AiAgent } from '../../../../models';
import { logAgentActivity } from '../../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../../types';

const AGENT_NAME = 'DeptDecisionSimulationAgent';

export async function runDeptDecisionSimulationAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  let entitiesProcessed = 0;

  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Review recent agent decisions (from last_result) to simulate outcomes
    const recentAgents = await AiAgent.findAll({
      where: {
        last_run_at: { [Op.gte]: oneDayAgo },
        last_result: { [Op.ne]: null },
      } as any,
      attributes: ['agent_name', 'last_result', 'last_run_at', 'error_count', 'run_count'],
      order: [['last_run_at', 'DESC']],
      limit: 30,
    });

    entitiesProcessed = recentAgents.length;

    const simulations: Array<{
      agent: string; decision: string; predicted_outcome: string; confidence: number;
    }> = [];

    for (const agent of recentAgents) {
      const a = agent as any;
      const result = a.last_result;
      if (!result || !result.actions_taken) continue;

      for (const action of result.actions_taken) {
        if (!action.after_state) continue;

        // Simulate based on action type and state
        const state = action.after_state;
        let prediction = 'stable';
        let conf = 0.7;

        if (state.recommendations && state.recommendations.length > 3) {
          prediction = 'Multiple issues detected — system may degrade without intervention';
          conf = 0.75;
        } else if (state.health_score !== undefined && state.health_score < 60) {
          prediction = 'System health declining — automated recovery likely insufficient';
          conf = 0.80;
        } else if (state.anomalies_detected > 0) {
          prediction = 'Anomalies present — monitor for escalation';
          conf = 0.72;
        } else if (action.result === 'flagged') {
          prediction = 'Flagged items require human review within 24h';
          conf = 0.78;
        }

        if (prediction !== 'stable') {
          simulations.push({
            agent: a.agent_name,
            decision: action.action,
            predicted_outcome: prediction,
            confidence: conf,
          });
        }
      }
    }

    actions.push({
      campaign_id: '',
      action: 'decision_simulation',
      reason: `Simulated outcomes for ${entitiesProcessed} recent agent decisions`,
      confidence: 0.75,
      before_state: null,
      after_state: {
        agents_reviewed: entitiesProcessed,
        simulations_run: simulations.length,
        simulations: simulations.slice(0, 20),
      },
      result: simulations.length > 5 ? 'flagged' : 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'decision_simulation',
      result: 'success',
      details: { agents_reviewed: entitiesProcessed, simulations: simulations.length },
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
