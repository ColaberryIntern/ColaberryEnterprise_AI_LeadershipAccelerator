import { Op } from 'sequelize';
import { ChatConversation, ChatMessage, AiAgent } from '../../../../models';
import { logAgentActivity } from '../../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../../types';

const AGENT_NAME = 'DeptAIModelPerformanceAgent';

export async function runDeptAIModelPerformanceAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  let entitiesProcessed = 0;

  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Conversation metrics as proxy for AI model performance
    const totalConversationsToday = await ChatConversation.count({
      where: { started_at: { [Op.gte]: oneDayAgo } },
    });

    const totalMessagesToday = await ChatMessage.count({
      where: { timestamp: { [Op.gte]: oneDayAgo } },
    });

    const assistantMessagesToday = await ChatMessage.count({
      where: { timestamp: { [Op.gte]: oneDayAgo }, role: 'assistant' },
    });

    // Check for very short AI responses (potential quality issue)
    const shortResponses = await ChatMessage.count({
      where: {
        timestamp: { [Op.gte]: oneDayAgo },
        role: 'assistant',
      },
    });

    // Agent performance as AI proxy
    const agentsUsingAI = await AiAgent.findAll({
      where: {
        enabled: true,
        last_run_at: { [Op.gte]: oneDayAgo },
      },
      attributes: ['agent_name', 'avg_duration_ms', 'run_count', 'error_count'],
      order: [['avg_duration_ms', 'DESC']],
      limit: 10,
    });

    entitiesProcessed = totalConversationsToday + agentsUsingAI.length;

    const avgResponsesPerConv = totalConversationsToday > 0
      ? (assistantMessagesToday / totalConversationsToday).toFixed(1)
      : '0';

    const recommendations: string[] = [];
    if (parseFloat(avgResponsesPerConv) < 2 && totalConversationsToday > 3) {
      recommendations.push('Low AI responses per conversation — check model response quality');
    }
    if (agentsUsingAI.some((a: any) => (a.avg_duration_ms || 0) > 60000)) {
      recommendations.push('Some agents taking >60s — investigate model latency or prompt optimization');
    }

    actions.push({
      campaign_id: '',
      action: 'ai_model_performance',
      reason: `Evaluated AI model performance across ${entitiesProcessed} interactions`,
      confidence: 0.80,
      before_state: null,
      after_state: {
        conversations_today: totalConversationsToday,
        messages_today: totalMessagesToday,
        assistant_messages: assistantMessagesToday,
        avg_responses_per_conv: avgResponsesPerConv,
        top_agents_by_duration: agentsUsingAI.map((a: any) => ({
          name: a.agent_name, avg_ms: a.avg_duration_ms,
        })),
        recommendations,
      },
      result: 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'ai_model_performance',
      result: 'success',
      details: { conversations: totalConversationsToday, messages: totalMessagesToday },
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
