import { Op, fn, col } from 'sequelize';
import { ChatConversation, Lead } from '../../../models';
import AdmissionsMemory from '../../../models/AdmissionsMemory';
import AdmissionsActionLog from '../../../models/AdmissionsActionLog';
import CallContactLog from '../../../models/CallContactLog';
import CallbackRequest from '../../../models/CallbackRequest';
import DocumentDeliveryLog from '../../../models/DocumentDeliveryLog';
import { logAgentActivity, logAiEvent } from '../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'AdmissionsExecutiveUpdateAgent';

/**
 * Generate executive summary of admissions activity every 4 hours.
 * Schedule: 0 *\/4 * * *
 */
export async function runAdmissionsExecutiveUpdateAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Gather metrics
    const [
      recentConversations,
      todayTotal,
      newEnterpriseLeads,
      highIntentVisitors,
      totalActiveMemories,
    ] = await Promise.all([
      ChatConversation.count({ where: { started_at: { [Op.gte]: fourHoursAgo } } }),
      ChatConversation.count({ where: { started_at: { [Op.gte]: todayStart } } }),
      AdmissionsMemory.count({
        where: {
          visitor_type: 'enterprise',
          last_updated: { [Op.gte]: fourHoursAgo },
        },
      }),
      AdmissionsMemory.count({
        where: {
          visitor_type: { [Op.in]: ['high_intent', 'enterprise'] },
        },
      }),
      AdmissionsMemory.count({ where: { conversation_count: { [Op.gte]: 1 } } }),
    ]);

    // Operational metrics
    const [
      documentsSentToday,
      callsScheduledToday,
      callbacksPending,
      emailsSentToday,
      smsSentToday,
      governanceDenialsToday,
    ] = await Promise.all([
      DocumentDeliveryLog.count({ where: { created_at: { [Op.gte]: todayStart } } }),
      CallContactLog.count({ where: { call_timestamp: { [Op.gte]: todayStart } } }),
      CallbackRequest.count({ where: { callback_status: 'pending' } }),
      AdmissionsActionLog.count({ where: { action_type: 'send_email', created_at: { [Op.gte]: todayStart }, status: 'completed' } }),
      AdmissionsActionLog.count({ where: { action_type: 'send_sms', created_at: { [Op.gte]: todayStart }, status: 'completed' } }),
      CallContactLog.count({ where: { call_status: 'denied', call_timestamp: { [Op.gte]: todayStart } } }),
    ]);

    // Recent notable conversations (high message count)
    const notableConversations = await ChatConversation.findAll({
      where: {
        started_at: { [Op.gte]: fourHoursAgo },
        visitor_message_count: { [Op.gte]: 3 },
      },
      include: [{ model: Lead, as: 'lead', attributes: ['name', 'email', 'company'], required: false }],
      order: [['visitor_message_count', 'DESC']],
      limit: 5,
    });

    const notableList = notableConversations.map((c: any) => ({
      messages: c.visitor_message_count,
      page: c.page_category,
      lead: c.lead ? `${c.lead.name || 'Unknown'} (${c.lead.company || 'N/A'})` : 'Anonymous',
      summary: c.summary || 'No summary',
    }));

    // Build executive summary
    const summary = {
      period: 'Last 4 hours',
      conversations_in_period: recentConversations,
      conversations_today: todayTotal,
      new_enterprise_leads: newEnterpriseLeads,
      total_high_intent_visitors: highIntentVisitors,
      total_engaged_visitors: totalActiveMemories,
      notable_conversations: notableList,
      // Operational metrics
      documents_sent_today: documentsSentToday,
      calls_scheduled_today: callsScheduledToday,
      callbacks_pending: callbacksPending,
      emails_sent_today: emailsSentToday,
      sms_sent_today: smsSentToday,
      governance_denials_today: governanceDenialsToday,
      generated_at: new Date().toISOString(),
    };

    actions.push({
      campaign_id: '',
      action: 'executive_update_generated',
      reason: `Executive update: ${recentConversations} conversations in last 4h, ${newEnterpriseLeads} new enterprise leads`,
      confidence: 0.95,
      before_state: null,
      after_state: summary,
      result: 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    await logAiEvent('admissions_intelligence', 'executive_update', 'system', undefined, summary).catch(() => {});

    await logAgentActivity({
      agent_id: agentId,
      action: 'executive_update',
      result: 'success',
      details: summary,
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
