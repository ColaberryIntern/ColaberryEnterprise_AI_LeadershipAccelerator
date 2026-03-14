// ─── Maya Action Service ──────────────────────────────────────────────────────
// Bridges Maya's OpenAI function calls to actual backend actions:
// send documents, schedule callbacks, send emails, send SMS.

import { Lead } from '../models';
import AdmissionsMemory from '../models/AdmissionsMemory';
import AdmissionsActionLog from '../models/AdmissionsActionLog';
import DocumentDeliveryLog from '../models/DocumentDeliveryLog';
import { canDeliverDocument } from './admissionsWorkflowService';
import { sendAdmissionsDocument } from './emailService';
import { addMayaInteractionTag } from './mayaCampaignRouter';
import {
  captureLeadDetails,
  updateLeadRecord,
  sendSmsSummary,
  initiateVoiceCall,
  getAvailableSlots,
  scheduleStrategyCall,
  enrollInCampaign,
  retrieveKnowledgeContent,
} from './mayaToolsService';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';

// ─── OpenAI Tool Definitions ────────────────────────────────────────────────

export const MAYA_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'capture_lead_details',
      description:
        'Capture visitor contact info. Use when they share name, email, phone, company, or title. Collect at minimum: first_name + email + phone before performing any actions. interest_type tracks which service they are most interested in.',
      parameters: {
        type: 'object',
        properties: {
          first_name: { type: 'string', description: "Visitor's first name" },
          last_name: { type: 'string', description: "Visitor's last name" },
          email: { type: 'string', description: "Visitor's email address" },
          phone: { type: 'string', description: "Visitor's phone number" },
          company: { type: 'string', description: "Visitor's company name" },
          title: { type: 'string', description: "Visitor's job title" },
          interest_type: {
            type: 'string',
            enum: ['executive_briefing', 'strategy_call', 'sponsorship', 'enrollment', 'voice_call', 'general'],
            description: 'Which service the visitor is most interested in',
          },
        },
        required: ['first_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_lead_record',
      description: "Update a specific field on the visitor's lead record.",
      parameters: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            enum: ['company', 'title', 'phone', 'email', 'interest_area'],
            description: 'The field to update',
          },
          value: { type: 'string', description: 'The new value' },
        },
        required: ['field', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_document',
      description:
        'Send a program document to the visitor via email. Requires a confirmed email address. Supported types: executive_briefing, program_overview, enterprise_guide, pricing_guide.',
      parameters: {
        type: 'object',
        properties: {
          document_type: {
            type: 'string',
            enum: ['executive_briefing', 'program_overview', 'enterprise_guide', 'pricing_guide'],
            description: 'Type of document to send',
          },
          recipient_email: { type: 'string', description: 'Email address to send the document to' },
          recipient_name: { type: 'string', description: "Recipient's name for personalization" },
        },
        required: ['document_type', 'recipient_email'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_sms_summary',
      description:
        'Send an SMS summary of this conversation to the visitor\'s phone. Only use after 3+ message exchanges AND the visitor has confirmed their phone number AND they have agreed to receive a text. Always ask permission first.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'initiate_voice_call',
      description:
        'Place an immediate AI voice call to the visitor via Synthflow. THIS IS THE DEFAULT when a visitor says "call me", asks to talk to someone, or provides their phone number for a call. Always pass the visitor\'s name if known. Max 1 call per visitor per 24h.',
      parameters: {
        type: 'object',
        properties: {
          phone: { type: 'string', description: 'Phone number to call' },
          name: { type: 'string', description: "Visitor's name — always include if you know it" },
          context_summary: { type: 'string', description: 'Brief summary of what was discussed (optional)' },
        },
        required: ['phone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_available_slots',
      description:
        'Check calendar availability for strategy calls. BEFORE calling this, ask the visitor which day they prefer and whether they want morning, afternoon, or evening. Then pass their preferences to get 3 targeted options.',
      parameters: {
        type: 'object',
        properties: {
          preferred_day: { type: 'string', description: "Day the visitor prefers, e.g. 'Monday', 'Tuesday', 'tomorrow', 'this week'. If not specified, returns next 3 available days." },
          preferred_time: { type: 'string', enum: ['morning', 'afternoon', 'any'], description: "Time of day preference: morning (9am-12pm), afternoon (12pm-5pm), or any" },
          days: { type: 'integer', description: 'Number of days to check (default 14)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'schedule_strategy_call',
      description:
        'Book a strategy call at a specific time. Must call get_available_slots first. Sends confirmation email + SMS. Requires name and email at minimum.',
      parameters: {
        type: 'object',
        properties: {
          slot_start: { type: 'string', description: 'ISO datetime of the slot to book (from get_available_slots)' },
          name: { type: 'string', description: "Visitor's full name" },
          email: { type: 'string', description: "Visitor's email address" },
          company: { type: 'string', description: "Visitor's company" },
          phone: { type: 'string', description: "Visitor's phone number" },
        },
        required: ['slot_start', 'name', 'email'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'enroll_in_campaign',
      description:
        'Enroll the visitor in a Maya nurture campaign. Use "voice_call" for visitors who requested a call, or "general" for all other inbound leads. Only two Maya campaigns exist — do NOT use this for leads already in a campaign.',
      parameters: {
        type: 'object',
        properties: {
          interest_type: {
            type: 'string',
            enum: ['voice_call', 'general'],
            description: 'Campaign type: "voice_call" for call requests, "general" for all other inbound leads',
          },
        },
        required: ['interest_type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'retrieve_knowledge',
      description:
        'Search the knowledge base for program information. Use when visitors ask detailed questions about the program, pricing, curriculum, or outcomes.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query for the knowledge base' },
          category: {
            type: 'string',
            enum: ['program', 'curriculum', 'pricing', 'outcomes', 'enterprise', 'logistics', 'faq', 'sponsorship'],
            description: 'Optional category to narrow search',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'schedule_callback',
      description:
        'LAST RESORT ONLY — log a manual callback request for the admissions team. Do NOT use this when the visitor says "call me" — use initiate_voice_call instead to call them immediately. Only use schedule_callback if voice calling is unavailable or the visitor specifically wants a human team member to call later.',
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
    case 'capture_lead_details':
      return captureLeadDetails(args, visitorId, conversationId);
    case 'update_lead_record':
      return updateLeadRecord(args, visitorId, conversationId);
    case 'send_document':
      return handleSendDocument(args, visitorId, conversationId);
    case 'send_sms_summary':
      return sendSmsSummary(args, visitorId, conversationId);
    case 'initiate_voice_call':
      return initiateVoiceCall(args, visitorId, conversationId);
    case 'get_available_slots':
      return getAvailableSlots(args, visitorId, conversationId);
    case 'schedule_strategy_call':
      return scheduleStrategyCall(args, visitorId, conversationId);
    case 'enroll_in_campaign':
      return enrollInCampaign(args, visitorId, conversationId);
    case 'retrieve_knowledge':
      return retrieveKnowledgeContent(args, visitorId, conversationId);
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

  // Tag Maya interaction
  if (memory?.lead_id) {
    addMayaInteractionTag(memory.lead_id, 'maya_document_requested').catch(() => {});
  }

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
