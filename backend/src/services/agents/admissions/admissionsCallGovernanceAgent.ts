import { Op } from 'sequelize';
import CallContactLog from '../../../models/CallContactLog';
import { logAgentActivity } from '../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'AdmissionsCallGovernanceAgent';

// Exceptions that bypass the 24-hour rule
const VALID_EXCEPTIONS = ['visitor_requested_callback', 'appointment_reminder', 'support_followup'];

/**
 * Approve or deny voice calls based on the 24-hour rule + CallContactLog.
 * Trigger: on_demand.
 */
export async function runAdmissionsCallGovernanceAgent(
  agentId: string,
  config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    const { visitor_id, call_type, reason, requesting_agent } = config;

    if (!visitor_id || !call_type || !reason) {
      errors.push('visitor_id, call_type, and reason are required');
      return buildResult(actions, errors, startTime);
    }

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Check last call within 24 hours
    const recentCall = await CallContactLog.findOne({
      where: {
        visitor_id,
        call_timestamp: { [Op.gte]: twentyFourHoursAgo },
        call_status: { [Op.in]: ['completed', 'pending'] },
      },
      order: [['call_timestamp', 'DESC']],
    });

    let approved = true;
    let governanceReason = 'No recent calls — approved';

    if (recentCall) {
      // Check if this call type is a valid exception
      if (VALID_EXCEPTIONS.includes(call_type)) {
        governanceReason = `Recent call found but ${call_type} is a valid exception — approved`;
      } else {
        approved = false;
        governanceReason = `Call denied: visitor ${visitor_id} was called ${recentCall.call_timestamp.toISOString()} (within 24h). Call type "${call_type}" is not an exception.`;
      }
    }

    actions.push({
      campaign_id: '',
      action: approved ? 'call_approved' : 'call_denied',
      reason: governanceReason,
      confidence: 0.95,
      before_state: {
        last_call: recentCall?.call_timestamp?.toISOString() || null,
        call_type,
      },
      after_state: {
        approved,
        reason: governanceReason,
        requesting_agent: requesting_agent || 'unknown',
      },
      result: approved ? 'success' : 'skipped',
      entity_type: 'visitor',
      entity_id: visitor_id,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'call_governance',
      result: approved ? 'success' : 'failed',
      details: { visitor_id, call_type, approved, reason: governanceReason },
    }).catch(() => {});
  } catch (err: any) {
    errors.push(err.message);
  }

  return buildResult(actions, errors, startTime);
}

function buildResult(actions: AgentAction[], errors: string[], startTime: number): AgentExecutionResult {
  return {
    agent_name: AGENT_NAME,
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - startTime,
    entities_processed: actions.length,
  };
}
