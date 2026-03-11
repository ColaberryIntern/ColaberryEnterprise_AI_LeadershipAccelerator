import { Op } from 'sequelize';
import { IntentScore } from '../../../models';
import CallContactLog from '../../../models/CallContactLog';
import CallbackRequest from '../../../models/CallbackRequest';
import DocumentDeliveryLog from '../../../models/DocumentDeliveryLog';
import AdmissionsActionLog from '../../../models/AdmissionsActionLog';
import { runAdmissionsCallGovernanceAgent } from './admissionsCallGovernanceAgent';
import { logAgentActivity } from '../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'AdmissionsAssistantAgent';

/**
 * Prepare daily call queues, verify eligibility, monitor operational backlog.
 * Schedule: every 10 minutes.
 */
export async function runAdmissionsAssistantAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // 1. Build call queue: high-intent visitors without recent outreach
    const highIntentVisitors = await IntentScore.findAll({
      where: { score: { [Op.gte]: 70 } },
      order: [['score', 'DESC']],
      limit: 30,
    });

    const callQueue: { visitor_id: string; score: number; eligible: boolean }[] = [];

    for (const intent of highIntentVisitors) {
      // Check governance eligibility
      const governance = await runAdmissionsCallGovernanceAgent(agentId, {
        visitor_id: intent.visitor_id,
        call_type: 'admissions_outreach',
        reason: 'High-intent visitor outreach',
        requesting_agent: AGENT_NAME,
      });

      const eligible = governance.actions_taken.some((a) => a.action === 'call_approved');
      callQueue.push({
        visitor_id: intent.visitor_id,
        score: intent.score,
        eligible,
      });
    }

    const eligibleCount = callQueue.filter((v) => v.eligible).length;

    // 2. Monitor operational backlog
    const pendingCallbacks = await CallbackRequest.count({
      where: { callback_status: 'pending' },
    });

    const pendingActions = await AdmissionsActionLog.count({
      where: { status: 'pending' },
    });

    const todayDocuments = await DocumentDeliveryLog.count({
      where: { created_at: { [Op.gte]: todayStart } },
    });

    const todayCalls = await CallContactLog.count({
      where: { call_timestamp: { [Op.gte]: todayStart } },
    });

    const todayEmails = await AdmissionsActionLog.count({
      where: {
        action_type: 'send_email',
        created_at: { [Op.gte]: todayStart },
        status: 'completed',
      },
    });

    const todaySms = await AdmissionsActionLog.count({
      where: {
        action_type: 'send_sms',
        created_at: { [Op.gte]: todayStart },
        status: 'completed',
      },
    });

    actions.push({
      campaign_id: '',
      action: 'operational_health_report',
      reason: `Call queue: ${eligibleCount}/${callQueue.length} eligible. Backlog: ${pendingCallbacks} callbacks, ${pendingActions} pending actions.`,
      confidence: 0.95,
      before_state: null,
      after_state: {
        call_queue_size: callQueue.length,
        call_queue_eligible: eligibleCount,
        pending_callbacks: pendingCallbacks,
        pending_actions: pendingActions,
        today_documents: todayDocuments,
        today_calls: todayCalls,
        today_emails: todayEmails,
        today_sms: todaySms,
      },
      result: 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'admissions_assistant',
      result: 'success',
      details: {
        call_queue_eligible: eligibleCount,
        pending_callbacks: pendingCallbacks,
        pending_actions: pendingActions,
      },
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
