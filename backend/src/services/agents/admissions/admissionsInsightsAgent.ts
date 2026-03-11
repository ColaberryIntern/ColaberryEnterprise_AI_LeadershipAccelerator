import { Op, fn, col } from 'sequelize';
import { ChatConversation, IntentScore } from '../../../models';
import AdmissionsMemory from '../../../models/AdmissionsMemory';
import { logAgentActivity } from '../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'AdmissionsInsightsAgent';

/**
 * Aggregate admissions analytics into last_result for dashboard display.
 * Schedule: every 30 minutes.
 */
export async function runAdmissionsInsightsAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalMemories,
      todayConversations,
      weekConversations,
      activeConversations,
      returningCount,
      highIntentCount,
      enterpriseCount,
      ceoCount,
      intentDistribution,
    ] = await Promise.all([
      AdmissionsMemory.count(),
      ChatConversation.count({ where: { started_at: { [Op.gte]: todayStart } } }),
      ChatConversation.count({ where: { started_at: { [Op.gte]: weekAgo } } }),
      ChatConversation.count({ where: { status: 'active' } }),
      AdmissionsMemory.count({ where: { visitor_type: 'returning' } }),
      AdmissionsMemory.count({ where: { visitor_type: 'high_intent' } }),
      AdmissionsMemory.count({ where: { visitor_type: 'enterprise' } }),
      AdmissionsMemory.count({ where: { visitor_type: 'ceo' } }),
      AdmissionsMemory.findAll({
        attributes: ['visitor_type', [fn('COUNT', col('id')), 'count']],
        group: ['visitor_type'],
        raw: true,
      }) as any,
    ]);

    // Top interests
    const allMemories = await AdmissionsMemory.findAll({
      attributes: ['interests'],
      where: { interests: { [Op.ne]: '[]' } },
      limit: 200,
    });

    const interestCounts: Record<string, number> = {};
    for (const m of allMemories) {
      for (const interest of m.interests || []) {
        interestCounts[interest] = (interestCounts[interest] || 0) + 1;
      }
    }

    const insights = {
      total_known_visitors: totalMemories,
      conversations_today: todayConversations,
      conversations_this_week: weekConversations,
      active_conversations: activeConversations,
      visitor_types: {
        returning: returningCount,
        high_intent: highIntentCount,
        enterprise: enterpriseCount,
        ceo: ceoCount,
      },
      visitor_type_distribution: (intentDistribution || []).reduce(
        (acc: any, r: any) => ({ ...acc, [r.visitor_type]: parseInt(r.count, 10) }),
        {}
      ),
      top_interests: Object.entries(interestCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([interest, count]) => ({ interest, count })),
      generated_at: new Date().toISOString(),
    };

    actions.push({
      campaign_id: '',
      action: 'insights_generated',
      reason: `Admissions insights: ${totalMemories} visitors, ${todayConversations} conversations today`,
      confidence: 0.95,
      before_state: null,
      after_state: insights,
      result: 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'insights_aggregation',
      result: 'success',
      details: insights,
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
