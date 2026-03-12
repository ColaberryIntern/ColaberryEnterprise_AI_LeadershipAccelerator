import { Op } from 'sequelize';
import { AiAgent, ChatConversation, ChatMessage } from '../../../../models';
import { logAgentActivity } from '../../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../../types';

const AGENT_NAME = 'DeptQualityAssuranceAgent';

export async function runDeptQualityAssuranceAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  let entitiesProcessed = 0;

  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // 1. Agent output quality: check error rates
    const agents = await AiAgent.findAll({ where: { enabled: true } });
    const highErrorAgents = agents.filter((a: any) => {
      const runs = a.run_count || 0;
      const errs = a.error_count || 0;
      return runs > 5 && (errs / runs) > 0.15;
    });

    // 2. Conversation quality: sample recent conversations
    const recentConversations = await ChatConversation.findAll({
      where: { started_at: { [Op.gte]: oneDayAgo } },
      limit: 20,
      order: [['started_at', 'DESC']],
    });

    let shortConversations = 0;
    let totalMessageCount = 0;

    for (const conv of recentConversations) {
      const msgCount = await ChatMessage.count({
        where: { conversation_id: (conv as any).id },
      });
      totalMessageCount += msgCount;
      if (msgCount <= 2) shortConversations++;
    }

    const avgMessagesPerConv = recentConversations.length > 0
      ? (totalMessageCount / recentConversations.length).toFixed(1)
      : '0';

    entitiesProcessed = agents.length + recentConversations.length;

    const qualityIssues: Array<{ area: string; issue: string; severity: string }> = [];

    if (highErrorAgents.length > 0) {
      qualityIssues.push({
        area: 'Agent Reliability',
        issue: `${highErrorAgents.length} agents have >15% error rate: ${highErrorAgents.map((a: any) => a.agent_name).slice(0, 5).join(', ')}`,
        severity: 'high',
      });
    }

    if (shortConversations > recentConversations.length * 0.5 && recentConversations.length > 3) {
      qualityIssues.push({
        area: 'Conversation Quality',
        issue: `${shortConversations}/${recentConversations.length} conversations had ≤2 messages — visitors may not be engaging`,
        severity: 'medium',
      });
    }

    actions.push({
      campaign_id: '',
      action: 'quality_audit',
      reason: `Audited ${entitiesProcessed} entities for quality`,
      confidence: 0.84,
      before_state: null,
      after_state: {
        agents_checked: agents.length,
        high_error_agents: highErrorAgents.length,
        conversations_sampled: recentConversations.length,
        avg_messages_per_conv: avgMessagesPerConv,
        short_conversations: shortConversations,
        quality_issues: qualityIssues,
      },
      result: qualityIssues.length > 0 ? 'flagged' : 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'quality_audit',
      result: 'success',
      details: { issues: qualityIssues.length },
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
