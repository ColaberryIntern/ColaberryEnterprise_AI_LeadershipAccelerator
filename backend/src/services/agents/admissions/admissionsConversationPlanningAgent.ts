import AdmissionsMemory from '../../../models/AdmissionsMemory';
import { IntentScore } from '../../../models';
import { logAgentActivity } from '../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'AdmissionsConversationPlanningAgent';

/**
 * Determine conversation_goal and next_message_strategy from context.
 * Trigger: on_demand (called before conversations or during active chats).
 */
export async function runAdmissionsConversationPlanningAgent(
  agentId: string,
  config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    const visitorId = config.visitor_id;
    if (!visitorId) {
      errors.push('visitor_id required in config');
      return { agent_name: AGENT_NAME, campaigns_processed: 0, actions_taken: actions, errors, duration_ms: Date.now() - startTime };
    }

    const memory = await AdmissionsMemory.findOne({ where: { visitor_id: visitorId } });
    const intent = await IntentScore.findOne({ where: { visitor_id: visitorId } });

    const visitorType = memory?.visitor_type || 'new';
    const intentLevel = intent?.intent_level || 'low';
    const interests = memory?.interests || [];
    const conversationCount = memory?.conversation_count || 0;

    // Determine conversation goal
    let goal: string;
    let strategy: string;

    if (visitorType === 'ceo') {
      goal = 'executive_briefing';
      strategy = 'Provide admissions pipeline metrics, conversion trends, and notable visitor interactions. Be data-driven and concise.';
    } else if (intentLevel === 'very_high' || visitorType === 'high_intent') {
      goal = 'conversion';
      strategy = 'Gently guide toward enrollment or strategy call. Address remaining objections. Use urgency messaging if appropriate.';
    } else if (visitorType === 'enterprise') {
      goal = 'enterprise_qualification';
      strategy = 'Explore team size, budget authority, timeline. Discuss group rates and corporate sponsorship. Offer executive briefing.';
    } else if (conversationCount >= 3) {
      goal = 'nurture_to_decision';
      strategy = 'Build on relationship. Reference previous conversations. Share relevant case studies. Gently probe for timeline.';
    } else if (interests.includes('pricing')) {
      goal = 'value_demonstration';
      strategy = 'Focus on ROI and value. Share comparison anchoring. Discuss financing options. Suggest strategy call for detailed pricing.';
    } else if (conversationCount === 0) {
      goal = 'discovery';
      strategy = 'Learn about the visitor: role, company, goals. Provide overview of the program. Build rapport. Identify key interests.';
    } else {
      goal = 'engagement';
      strategy = 'Deepen engagement by exploring specific interests. Provide relevant details. Encourage next step.';
    }

    actions.push({
      campaign_id: '',
      action: 'conversation_planned',
      reason: `Planned goal=${goal} for visitor_type=${visitorType}, intent=${intentLevel}`,
      confidence: 0.75,
      before_state: null,
      after_state: { goal, strategy, visitor_type: visitorType, intent_level: intentLevel },
      result: 'success',
      entity_type: 'system',
      entity_id: visitorId,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'conversation_planning',
      result: 'success',
      details: { visitor_id: visitorId, goal, strategy },
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
    entities_processed: 1,
  };
}
