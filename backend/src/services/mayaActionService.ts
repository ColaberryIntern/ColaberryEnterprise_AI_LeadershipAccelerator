// ─── Maya Action Service ──────────────────────────────────────────────────────
// Bridges Maya's OpenAI function calls to actual backend actions:
// send documents, schedule callbacks, send emails, send SMS.

import { Lead } from '../models';
import AdmissionsMemory from '../models/AdmissionsMemory';
import AdmissionsActionLog from '../models/AdmissionsActionLog';
import DocumentDeliveryLog from '../models/DocumentDeliveryLog';
import { canDeliverDocument } from './admissionsWorkflowService';
import { sendAdmissionsDocument } from './emailService';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

// ─── OpenAI Tool Definitions ────────────────────────────────────────────────

export const MAYA_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'send_document',
      description:
        'Send a document to the visitor via email. Use this when the visitor requests a document or you offer to send one and they agree. You MUST have their email address before calling this.',
      parameters: {
        type: 'object',
        properties: {
          document_type: {
            type: 'string',
            enum: ['program_overview', 'executive_briefing', 'enterprise_guide', 'pricing_guide'],
            description: 'The type of document to send',
          },
          recipient_email: {
            type: 'string',
            description: 'The email address to send the document to',
          },
          recipient_name: {
            type: 'string',
            description: 'The name of the recipient (for the email greeting)',
          },
        },
        required: ['document_type', 'recipient_email'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'schedule_callback',
      description:
        'Request a callback for a visitor who prefers phone contact. Use when visitor asks for a call or provides their phone number for follow-up.',
      parameters: {
        type: 'object',
        properties: {
          phone_number: {
            type: 'string',
            description: 'The phone number to call back',
          },
          preferred_time: {
            type: 'string',
            description: 'When the visitor would like to be called (e.g. "tomorrow morning", "this afternoon")',
          },
          reason: {
            type: 'string',
            description: 'Brief reason for the callback',
          },
        },
        required: ['reason'],
      },
    },
  },
];

// ─── Action Executor ────────────────────────────────────────────────────────

export interface MayaActionResult {
  success: boolean;
  summary: string;
  details?: Record<string, any>;
}

export async function executeMayaAction(
  functionName: string,
  args: Record<string, any>,
  visitorId: string,
  conversationId: string,
): Promise<MayaActionResult> {
  switch (functionName) {
    case 'send_document':
      return handleSendDocument(args, visitorId, conversationId);
    case 'schedule_callback':
      return handleScheduleCallback(args, visitorId, conversationId);
    default:
      return { success: false, summary: `Unknown action: ${functionName}` };
  }
}

// ─── Send Document Handler ──────────────────────────────────────────────────

async function handleSendDocument(
  args: Record<string, any>,
  visitorId: string,
  conversationId: string,
): Promise<MayaActionResult> {
  const { document_type, recipient_email, recipient_name } = args;

  if (!document_type || !recipient_email) {
    return { success: false, summary: 'Missing document_type or recipient_email' };
  }

  const supportedDocs = ['executive_briefing', 'program_overview', 'enterprise_guide', 'pricing_guide'];
  if (!supportedDocs.includes(document_type)) {
    return { success: false, summary: `Unsupported document type: ${document_type}` };
  }

  // Check workflow rules (e.g. executive_briefing requires stage >= 2)
  try {
    const { allowed, reason } = await canDeliverDocument(visitorId, document_type);
    if (!allowed) {
      await logAction(visitorId, conversationId, 'send_document', 'denied', {
        document_type,
        reason,
      });
      return { success: false, summary: reason || 'Document delivery not allowed at this workflow stage' };
    }
  } catch {
    // Workflow check failed — allow delivery for non-executive docs
    if (document_type === 'executive_briefing') {
      return { success: false, summary: 'Unable to verify workflow stage for executive briefing' };
    }
  }

  // Resolve name from Lead if not provided
  let name = recipient_name || 'there';
  const memory = await AdmissionsMemory.findOne({ where: { visitor_id: visitorId } }).catch(() => null);
  if (!recipient_name && memory?.lead_id) {
    const lead = await Lead.findByPk(memory.lead_id).catch(() => null);
    if (lead?.getDataValue('name')) {
      name = lead.getDataValue('name');
    }
  }

  // Send the email
  try {
    await sendAdmissionsDocument({
      to: recipient_email,
      name,
      documentType: document_type,
    });
  } catch (err: any) {
    await logAction(visitorId, conversationId, 'send_document', 'failed', {
      document_type,
      error: err.message,
    });
    return { success: false, summary: `Failed to send email: ${err.message}` };
  }

  // Log delivery
  await DocumentDeliveryLog.create({
    visitor_id: visitorId,
    lead_id: memory?.lead_id || null,
    document_type,
    delivery_method: 'email',
    recipient_email,
    status: 'sent',
  }).catch(() => {});

  await logAction(visitorId, conversationId, 'send_document', 'completed', {
    document_type,
    recipient_email,
    recipient_name: name,
  });

  const docNames: Record<string, string> = {
    executive_briefing: 'Executive Briefing',
    program_overview: 'Program Overview',
    enterprise_guide: 'Enterprise Guide',
    pricing_guide: 'Pricing Guide',
  };

  return {
    success: true,
    summary: `Successfully sent ${docNames[document_type]} to ${recipient_email}`,
    details: { document_type, recipient_email, recipient_name: name },
  };
}

// ─── Schedule Callback Handler ──────────────────────────────────────────────

async function handleScheduleCallback(
  args: Record<string, any>,
  visitorId: string,
  conversationId: string,
): Promise<MayaActionResult> {
  const { phone_number, preferred_time, reason } = args;

  await logAction(visitorId, conversationId, 'schedule_callback', 'pending', {
    phone_number: phone_number || null,
    preferred_time: preferred_time || null,
    reason,
  });

  return {
    success: true,
    summary: `Callback request logged${phone_number ? ` for ${phone_number}` : ''}${preferred_time ? ` (${preferred_time})` : ''}. The team will follow up.`,
    details: { phone_number, preferred_time, reason },
  };
}

// ─── Logging Helper ─────────────────────────────────────────────────────────

async function logAction(
  visitorId: string,
  conversationId: string,
  actionType: string,
  status: string,
  details: Record<string, any>,
): Promise<void> {
  try {
    await AdmissionsActionLog.create({
      visitor_id: visitorId,
      conversation_id: conversationId,
      action_type: actionType,
      action_details: details,
      status,
      agent_name: 'Maya',
    });
  } catch {
    // Non-critical
  }
}
