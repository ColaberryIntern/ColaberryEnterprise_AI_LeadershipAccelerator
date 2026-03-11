import { Op } from 'sequelize';
import { ChatConversation } from '../../../models';
import AdmissionsMemory from '../../../models/AdmissionsMemory';
import { saveConversationToMemory } from '../../admissionsMemoryService';
import { logAgentActivity } from '../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'AdmissionsConversationMemoryAgent';

/**
 * Process closed ChatConversations into AdmissionsMemory summaries.
 * Schedule: every 30 minutes.
 */
export async function runAdmissionsConversationMemoryAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    // Find recently closed conversations not yet in memory
    const since = new Date(Date.now() - 60 * 60 * 1000); // last hour

    const closedConversations = await ChatConversation.findAll({
      where: {
        status: 'closed',
        ended_at: { [Op.gte]: since },
      },
      limit: 50,
    });

    for (const conv of closedConversations) {
      // Check if already in memory
      const memory = await AdmissionsMemory.findOne({
        where: { visitor_id: conv.visitor_id },
      });

      const existingSummaries = memory?.conversation_summaries || [];
      const alreadyProcessed = existingSummaries.some(
        (s: any) => s.conversation_id === conv.id
      );

      if (alreadyProcessed) continue;

      try {
        await saveConversationToMemory(conv.id);

        actions.push({
          campaign_id: '',
          action: 'conversation_memorized',
          reason: `Processed conversation ${conv.id} for visitor ${conv.visitor_id}`,
          confidence: 0.9,
          before_state: null,
          after_state: { conversation_id: conv.id },
          result: 'success',
          entity_type: 'system',
          entity_id: conv.id,
        });
      } catch (err: any) {
        errors.push(`Failed to memorize ${conv.id}: ${err.message}`);
      }
    }

    await logAgentActivity({
      agent_id: agentId,
      action: 'conversation_memory_sync',
      result: 'success',
      details: { conversations_checked: closedConversations.length, memorized: actions.length },
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
    entities_processed: actions.length,
  };
}
