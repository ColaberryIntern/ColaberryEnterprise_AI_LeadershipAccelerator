import { Op } from 'sequelize';
import { ChatConversation, ChatMessage } from '../../../models';
import CallbackRequest from '../../../models/CallbackRequest';
import AdmissionsActionLog from '../../../models/AdmissionsActionLog';
import { logAgentActivity } from '../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'AdmissionsConversationTaskMonitor';

// Task detection patterns
const TASK_PATTERNS: { pattern: RegExp; task_type: string; action_type: string }[] = [
  { pattern: /send.*briefing|executive briefing|send.*overview/i, task_type: 'document_request', action_type: 'send_document' },
  { pattern: /call me|phone me|ring me|give me a call/i, task_type: 'callback_request', action_type: 'schedule_callback' },
  { pattern: /email.*info|send.*email|email me/i, task_type: 'email_request', action_type: 'send_email' },
  { pattern: /text me|sms|send.*link.*phone|send.*text/i, task_type: 'sms_request', action_type: 'send_sms' },
  { pattern: /schedule.*call|book.*call|book.*meeting|schedule.*meeting/i, task_type: 'appointment_request', action_type: 'schedule_call' },
];

/**
 * Scan active conversations for actionable task requests from visitors.
 * Schedule: every 2 minutes.
 */
export async function runAdmissionsConversationTaskMonitor(
  agentId: string,
  config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    // Track last scanned message to avoid reprocessing
    const lastScannedId = config.last_scanned_message_id || null;

    // Find active conversations
    const activeConvs = await ChatConversation.findAll({
      where: { status: 'active' },
      attributes: ['id', 'visitor_id'],
      limit: 50,
    });

    let newestMessageId: string | null = lastScannedId;

    for (const conv of activeConvs) {
      // Get visitor messages not yet scanned
      const whereClause: any = {
        conversation_id: conv.id,
        role: 'user',
      };
      if (lastScannedId) {
        whereClause.id = { [Op.gt]: lastScannedId };
      }

      const messages = await ChatMessage.findAll({
        where: whereClause,
        order: [['created_at', 'ASC']],
        limit: 50,
      });

      for (const msg of messages) {
        const content = (msg as any).content || '';

        // Track newest message for next run
        if (!newestMessageId || msg.id > newestMessageId) {
          newestMessageId = msg.id;
        }

        // Check each task pattern
        for (const { pattern, task_type, action_type } of TASK_PATTERNS) {
          if (pattern.test(content)) {
            // Check if we already created an action for this message
            const existing = await AdmissionsActionLog.findOne({
              where: {
                visitor_id: (conv as any).visitor_id,
                action_type,
                action_details: { message_id: msg.id } as any,
              },
            });
            if (existing) continue;

            // Create the appropriate task
            if (task_type === 'callback_request') {
              await CallbackRequest.create({
                visitor_id: (conv as any).visitor_id,
                conversation_id: conv.id,
              });
            }

            await AdmissionsActionLog.create({
              visitor_id: (conv as any).visitor_id,
              conversation_id: conv.id,
              action_type,
              action_details: {
                message_id: msg.id,
                task_type,
                detected_text: content.substring(0, 200),
              },
              status: 'pending',
              agent_name: AGENT_NAME,
            });

            actions.push({
              campaign_id: '',
              action: 'task_detected',
              reason: `Detected ${task_type} in conversation ${conv.id}: "${content.substring(0, 80)}"`,
              confidence: 0.8,
              before_state: { message_id: msg.id },
              after_state: { task_type, action_type },
              result: 'success',
              entity_type: 'visitor',
              entity_id: (conv as any).visitor_id,
            });
          }
        }
      }
    }

    await logAgentActivity({
      agent_id: agentId,
      action: 'conversation_task_scan',
      result: 'success',
      details: {
        conversations_scanned: activeConvs.length,
        tasks_detected: actions.length,
        newest_message_id: newestMessageId,
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
