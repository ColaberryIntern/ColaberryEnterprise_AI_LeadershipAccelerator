import { Op } from 'sequelize';
import { AiAgent } from '../../../../models';
import { logAgentActivity } from '../../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../../types';

const AGENT_NAME = 'DeptAgentHiringAgent';

export async function runDeptAgentHiringAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  let entitiesProcessed = 0;

  try {
    const agents = await AiAgent.findAll({
      attributes: ['agent_name', 'category', 'status', 'enabled', 'error_count', 'run_count'],
    });

    entitiesProcessed = agents.length;

    // Count agents per category
    const categoryCounts: Record<string, { total: number; enabled: number; errored: number }> = {};
    for (const agent of agents) {
      const cat = (agent as any).category || 'uncategorized';
      if (!categoryCounts[cat]) categoryCounts[cat] = { total: 0, enabled: 0, errored: 0 };
      categoryCounts[cat].total++;
      if ((agent as any).enabled) categoryCounts[cat].enabled++;
      if ((agent as any).status === 'error') categoryCounts[cat].errored++;
    }

    // Identify gaps and recommendations
    const hiringRecommendations: Array<{ department: string; reason: string; priority: string }> = [];

    for (const [cat, counts] of Object.entries(categoryCounts)) {
      if (counts.total < 2) {
        hiringRecommendations.push({
          department: cat,
          reason: `Only ${counts.total} agent(s) — limited coverage`,
          priority: 'medium',
        });
      }
      if (counts.errored > counts.total * 0.5 && counts.total >= 2) {
        hiringRecommendations.push({
          department: cat,
          reason: `${counts.errored}/${counts.total} agents errored — need backup agents`,
          priority: 'high',
        });
      }
    }

    // Check for departments with no agents at all
    const expectedCategories = [
      'dept_growth', 'dept_marketing', 'dept_education', 'dept_finance',
      'dept_intelligence', 'dept_operations', 'dept_infrastructure', 'dept_orchestration',
    ];
    for (const cat of expectedCategories) {
      if (!categoryCounts[cat]) {
        hiringRecommendations.push({
          department: cat,
          reason: 'No agents deployed — department has zero coverage',
          priority: 'high',
        });
      }
    }

    actions.push({
      campaign_id: '',
      action: 'agent_hiring_analysis',
      reason: `Analyzed agent coverage across ${Object.keys(categoryCounts).length} categories`,
      confidence: 0.82,
      before_state: null,
      after_state: {
        total_agents: entitiesProcessed,
        category_counts: categoryCounts,
        hiring_recommendations: hiringRecommendations,
      },
      result: hiringRecommendations.length > 0 ? 'flagged' : 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'agent_hiring_analysis',
      result: 'success',
      details: { categories: Object.keys(categoryCounts).length, recommendations: hiringRecommendations.length },
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
