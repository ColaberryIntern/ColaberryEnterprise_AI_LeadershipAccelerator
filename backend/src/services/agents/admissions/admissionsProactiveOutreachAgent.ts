import { Op } from 'sequelize';
import { IntentScore, Visitor, ChatConversation } from '../../../models';
import AdmissionsMemory from '../../../models/AdmissionsMemory';
import { logAgentActivity } from '../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'AdmissionsProactiveOutreachAgent';

/**
 * Set proactive_chat_pending on high-intent visitors without active conversations.
 * Schedule: every 5 minutes.
 */
export async function runAdmissionsProactiveOutreachAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    // Find high-intent visitors
    const highIntentScores = await IntentScore.findAll({
      where: { score: { [Op.gte]: 60 } },
      order: [['score', 'DESC']],
      limit: 50,
    });

    for (const intent of highIntentScores) {
      const visitorId = intent.visitor_id;

      // Skip if already in an active conversation
      const activeConv = await ChatConversation.findOne({
        where: { visitor_id: visitorId, status: 'active' },
      });
      if (activeConv) continue;

      // Check visitor metadata
      const visitor = await Visitor.findByPk(visitorId);
      if (!visitor) continue;

      const metadata = (visitor as any).metadata || {};
      if (metadata.proactive_chat_pending) continue;

      // Set proactive chat flag
      await visitor.update({
        metadata: {
          ...metadata,
          proactive_chat_pending: true,
          proactive_chat_context: {
            reason: 'high_admissions_intent',
            intent_score: intent.score,
            intent_level: intent.intent_level,
          },
        },
      } as any);

      actions.push({
        campaign_id: '',
        action: 'proactive_outreach_set',
        reason: `High intent visitor ${visitorId} (score: ${intent.score}) flagged for proactive Maya outreach`,
        confidence: 0.8,
        before_state: { proactive_chat_pending: false },
        after_state: { proactive_chat_pending: true, intent_score: intent.score },
        result: 'success',
        entity_type: 'system',
        entity_id: visitorId,
      });
    }

    await logAgentActivity({
      agent_id: agentId,
      action: 'proactive_outreach',
      result: 'success',
      details: { high_intent_visitors: highIntentScores.length, flagged: actions.length },
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
