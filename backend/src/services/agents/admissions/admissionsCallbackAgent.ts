import { Op } from 'sequelize';
import CallbackRequest from '../../../models/CallbackRequest';
import AdmissionsActionLog from '../../../models/AdmissionsActionLog';
import { runAdmissionsCallGovernanceAgent } from './admissionsCallGovernanceAgent';
import { logAgentActivity } from '../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'AdmissionsCallbackManagementAgent';

/**
 * Process pending callback requests, schedule them with governance check.
 * Schedule: every 5 minutes.
 */
export async function runAdmissionsCallbackAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    // Find pending callback requests
    const pendingCallbacks = await CallbackRequest.findAll({
      where: { callback_status: 'pending' },
      order: [['request_timestamp', 'ASC']],
      limit: 20,
    });

    for (const callback of pendingCallbacks) {
      try {
        // If requested_time is in the future, skip until it's time
        if (callback.requested_time && new Date(callback.requested_time) > new Date()) {
          continue;
        }

        // Governance check
        const governanceResult = await runAdmissionsCallGovernanceAgent(agentId, {
          visitor_id: callback.visitor_id,
          call_type: 'visitor_requested_callback',
          reason: `Callback requested at ${callback.request_timestamp.toISOString()}`,
          requesting_agent: AGENT_NAME,
        });

        const approved = governanceResult.actions_taken.some(
          (a) => a.action === 'call_approved',
        );

        if (approved) {
          // Mark as scheduled (actual call placement done by SynthflowCallAgent or manual)
          const scheduledTime = callback.requested_time || new Date();
          await callback.update({
            callback_status: 'scheduled',
            scheduled_time: scheduledTime,
            agent_notes: `Approved by governance at ${new Date().toISOString()}`,
          });

          await AdmissionsActionLog.create({
            visitor_id: callback.visitor_id,
            conversation_id: callback.conversation_id,
            action_type: 'schedule_callback',
            action_details: {
              callback_id: callback.id,
              scheduled_time: scheduledTime,
            },
            status: 'completed',
            agent_name: AGENT_NAME,
          });

          actions.push({
            campaign_id: '',
            action: 'callback_scheduled',
            reason: `Callback for visitor ${callback.visitor_id} scheduled at ${scheduledTime}`,
            confidence: 0.9,
            before_state: { callback_status: 'pending' },
            after_state: { callback_status: 'scheduled', scheduled_time: scheduledTime },
            result: 'success',
            entity_type: 'visitor',
            entity_id: callback.visitor_id,
          });
        } else {
          // Governance denied — keep pending, add note
          await callback.update({
            agent_notes: `Governance denied at ${new Date().toISOString()} — will retry next cycle`,
          });

          actions.push({
            campaign_id: '',
            action: 'callback_governance_denied',
            reason: `Callback for visitor ${callback.visitor_id} denied by governance — will retry`,
            confidence: 0.85,
            before_state: { callback_status: 'pending' },
            after_state: { callback_status: 'pending', governance_denied: true },
            result: 'skipped',
            entity_type: 'visitor',
            entity_id: callback.visitor_id,
          });
        }
      } catch (err: any) {
        errors.push(`Callback ${callback.id}: ${err.message}`);
      }
    }

    // Also check for overdue scheduled callbacks (scheduled > 30 min ago, not completed)
    const overdueThreshold = new Date(Date.now() - 30 * 60 * 1000);
    const overdueCallbacks = await CallbackRequest.findAll({
      where: {
        callback_status: 'scheduled',
        scheduled_time: { [Op.lt]: overdueThreshold },
      },
      limit: 10,
    });

    for (const overdue of overdueCallbacks) {
      actions.push({
        campaign_id: '',
        action: 'callback_overdue',
        reason: `Scheduled callback for visitor ${overdue.visitor_id} is overdue (scheduled: ${overdue.scheduled_time})`,
        confidence: 0.9,
        before_state: { callback_status: 'scheduled', scheduled_time: overdue.scheduled_time },
        after_state: { overdue: true },
        result: 'flagged',
        entity_type: 'visitor',
        entity_id: overdue.visitor_id,
      });
    }

    await logAgentActivity({
      agent_id: agentId,
      action: 'callback_management',
      result: 'success',
      details: {
        pending_processed: pendingCallbacks.length,
        scheduled: actions.filter((a) => a.action === 'callback_scheduled').length,
        overdue: overdueCallbacks.length,
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
    entities_processed: actions.length,
  };
}
