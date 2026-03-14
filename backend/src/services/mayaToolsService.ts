// ─── Maya Tools Service ────────────────────────────────────────────────────────
// Central orchestration layer: bridges Maya's OpenAI tool calls to existing
// backend services. Each function returns MayaActionResult and logs to
// AdmissionsActionLog via the shared logAction helper.

import { Lead, Visitor, ChatMessage } from '../models';
import AdmissionsActionLog from '../models/AdmissionsActionLog';
import AdmissionsMemory from '../models/AdmissionsMemory';
import CallContactLog from '../models/CallContactLog';
import { syncNewLeadToGhl, syncLeadToGhl, sendSmsViaGhl } from './ghlService';
import { triggerVoiceCall } from './synthflowService';
import {
  getAvailableSlots as calendarGetSlots,
  createBooking,
} from './calendarService';
import { createAppointment } from './appointmentService';
import { sendStrategyCallConfirmation } from './emailService';
import { findRelevantKnowledge } from './admissionsKnowledgeService';
import { routeLeadToCampaign } from './mayaCampaignRouter';
import {
  generateConversationSummary,
  buildSmsSummaryContent,
} from './mayaConversationSummaryService';
import { logCommunication } from './communicationLogService';
import { getTestOverrides } from './settingsService';
import type { MayaActionResult } from './mayaActionService';

const { Op } = require('sequelize');

// ─── Internal Helpers ──────────────────────────────────────────────────────────

/** Resolve the Lead linked to a visitor, or null. */
export async function resolveLeadForVisitor(
  visitorId: string,
): Promise<InstanceType<typeof Lead> | null> {
  const visitor = await Visitor.findByPk(visitorId);
  if (!visitor?.lead_id) return null;
  return Lead.findByPk(visitor.lead_id);
}

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

// ─── Tool: Capture Lead Details ────────────────────────────────────────────────

export async function captureLeadDetails(
  args: Record<string, any>,
  visitorId: string,
  conversationId: string,
): Promise<MayaActionResult> {
  const { first_name, last_name, email, phone, company, title, interest_type } = args;

  if (!first_name) {
    return { success: false, summary: 'first_name is required' };
  }

  const fullName = last_name ? `${first_name} ${last_name}` : first_name;

  try {
    const visitor = await Visitor.findByPk(visitorId);
    if (!visitor) {
      return { success: false, summary: 'Visitor not found' };
    }

    let lead: InstanceType<typeof Lead>;
    let isNew = false;

    if (visitor.lead_id) {
      // Update existing lead
      lead = (await Lead.findByPk(visitor.lead_id))!;
      if (!lead) {
        return { success: false, summary: 'Linked lead record not found' };
      }
      const updates: Record<string, any> = { name: fullName };
      if (email) updates.email = email;
      if (phone) updates.phone = phone;
      if (company) updates.company = company;
      if (title) updates.title = title;
      if (interest_type) updates.interest_area = interest_type;
      await lead.update(updates);
    } else {
      // Check if lead exists by email
      let existingLead: InstanceType<typeof Lead> | null = null;
      if (email) {
        existingLead = await Lead.findOne({
          where: require('sequelize').where(
            require('sequelize').fn('LOWER', require('sequelize').col('email')),
            email.toLowerCase(),
          ),
        });
      }

      if (existingLead) {
        lead = existingLead;
        const updates: Record<string, any> = { name: fullName };
        if (phone && !lead.phone) updates.phone = phone;
        if (company && !lead.company) updates.company = company;
        if (title && !(lead as any).title) updates.title = title;
        if (interest_type) updates.interest_area = interest_type;
        await lead.update(updates);
      } else {
        // Create new lead
        lead = await Lead.create({
          name: fullName,
          email: email || null,
          phone: phone || null,
          company: company || null,
          title: title || null,
          interest_area: interest_type || 'general',
          lead_source_type: 'inbound',
          source: 'maya_chat',
          visitor_id: visitorId,
          pipeline_stage: 'new',
          status: 'active',
          lead_score: 25,
          lead_temperature: 'warm',
        } as any);
        isNew = true;
      }

      // Link visitor to lead
      await visitor.update({ lead_id: lead.id } as any);

      // Update admissions memory with lead_id
      await AdmissionsMemory.update(
        { lead_id: lead.id },
        { where: { visitor_id: visitorId } },
      ).catch(() => {});
    }

    // Sync to GHL (fire-and-forget)
    syncNewLeadToGhl(lead).catch((err: any) => {
      console.warn('[MayaTools] GHL sync failed:', err.message);
    });

    // Auto-enroll in campaign based on interest type (fire-and-forget)
    if (interest_type && interest_type !== 'general') {
      routeLeadToCampaign(lead.id, interest_type, visitorId, conversationId).catch(
        (err: any) => {
          console.warn('[MayaTools] Campaign enrollment failed:', err.message);
        },
      );
    }

    await logAction(visitorId, conversationId, 'lead_captured', 'completed', {
      lead_id: lead.id,
      name: fullName,
      email,
      phone,
      company,
      title,
      interest_type,
      is_new: isNew,
    });

    return {
      success: true,
      summary: `Lead ${isNew ? 'created' : 'updated'}: ${fullName}${email ? ` (${email})` : ''}`,
      details: { lead_id: lead.id, name: fullName, email, phone, is_new: isNew },
    };
  } catch (err: any) {
    await logAction(visitorId, conversationId, 'lead_captured', 'failed', {
      error: err.message,
    });
    return { success: false, summary: `Failed to capture lead: ${err.message}` };
  }
}

// ─── Tool: Update Lead Record ──────────────────────────────────────────────────

const SAFE_LEAD_FIELDS = ['company', 'title', 'phone', 'email', 'interest_area'];

export async function updateLeadRecord(
  args: Record<string, any>,
  visitorId: string,
  conversationId: string,
): Promise<MayaActionResult> {
  const { field, value } = args;

  if (!field || !value) {
    return { success: false, summary: 'field and value are required' };
  }
  if (!SAFE_LEAD_FIELDS.includes(field)) {
    return { success: false, summary: `Cannot update field: ${field}` };
  }

  const lead = await resolveLeadForVisitor(visitorId);
  if (!lead) {
    return { success: false, summary: 'No lead record found for this visitor' };
  }

  await lead.update({ [field]: value });
  await logAction(visitorId, conversationId, 'lead_updated', 'completed', {
    lead_id: lead.id,
    field,
    value,
  });

  return {
    success: true,
    summary: `Updated ${field} to "${value}"`,
    details: { lead_id: lead.id, field, value },
  };
}

// ─── Tool: Send SMS Summary ────────────────────────────────────────────────────

export async function sendSmsSummary(
  _args: Record<string, any>,
  visitorId: string,
  conversationId: string,
): Promise<MayaActionResult> {
  const lead = await resolveLeadForVisitor(visitorId);
  if (!lead) {
    return { success: false, summary: 'No lead record found. Capture contact details first.' };
  }
  if (!lead.phone) {
    return { success: false, summary: 'No phone number on file. Ask for their phone first.' };
  }

  // Ensure GHL contact exists
  let contactId = (lead as any).ghl_contact_id;
  if (!contactId) {
    try {
      const syncResult = await syncLeadToGhl(lead);
      if (syncResult.contactId && !syncResult.isTestMode) {
        await lead.update({ ghl_contact_id: syncResult.contactId });
        contactId = syncResult.contactId;
      } else if (syncResult.contactId) {
        contactId = syncResult.contactId; // test mode — still send
      }
    } catch {
      return { success: false, summary: 'Unable to sync with messaging system' };
    }
  }

  if (!contactId) {
    return { success: false, summary: 'Unable to establish SMS contact. Team will follow up.' };
  }

  // Generate summary and send
  try {
    const { summary } = await generateConversationSummary(conversationId);
    const leadName = lead.getDataValue('name') || 'there';
    const smsContent = buildSmsSummaryContent({
      summary,
      visitorName: leadName.split(' ')[0],
    });

    await sendSmsViaGhl(contactId, smsContent);

    await logAction(visitorId, conversationId, 'sms_summary_sent', 'completed', {
      lead_id: lead.id,
      phone: lead.phone,
      summary_length: smsContent.length,
    });

    return {
      success: true,
      summary: `SMS summary sent to ${lead.phone}`,
      details: { phone: lead.phone },
    };
  } catch (err: any) {
    await logAction(visitorId, conversationId, 'sms_summary_sent', 'failed', {
      error: err.message,
    });
    return { success: false, summary: `Failed to send SMS: ${err.message}` };
  }
}

// ─── Tool: Initiate Voice Call ─────────────────────────────────────────────────

export async function initiateVoiceCall(
  args: Record<string, any>,
  visitorId: string,
  conversationId: string,
): Promise<MayaActionResult> {
  const { phone, name: argName, context_summary } = args;
  if (!phone) {
    return { success: false, summary: 'Phone number is required' };
  }

  // 24h dedup check — skip in test mode
  const testOverrides = await getTestOverrides();
  if (!testOverrides.enabled) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentCall = await CallContactLog.findOne({
      where: {
        visitor_id: visitorId,
        call_timestamp: { [Op.gte]: oneDayAgo },
      },
    }).catch(() => null);

    if (recentCall) {
      return {
        success: false,
        summary: 'A call was already initiated for this visitor in the last 24 hours.',
      };
    }
  }

  const lead = await resolveLeadForVisitor(visitorId);
  // Prefer the name passed by Maya (from conversation) over the lead record
  const leadName = argName || lead?.getDataValue('name') || 'Visitor';

  // Build conversation context from recent messages
  let conversationContext = context_summary || '';
  if (!conversationContext) {
    try {
      const recentMessages = await ChatMessage.findAll({
        where: { conversation_id: conversationId },
        order: [['timestamp', 'DESC']],
        limit: 5,
      });
      conversationContext = recentMessages
        .reverse()
        .filter((m: any) => m.role !== 'system')
        .map((m: any) => `${m.role === 'visitor' ? 'Visitor' : 'Maya'}: ${m.content}`)
        .join('\n');
    } catch {
      conversationContext = 'Visitor expressed interest in the AI Leadership Accelerator.';
    }
  }

  const callPrompt = `You ARE Maya, Director of Admissions at Colaberry. You are calling ${leadName}. Introduce yourself as "Hi ${leadName.split(' ')[0]}, this is Maya from Colaberry." They were just chatting with you online about the AI Leadership Accelerator program. Here is the recent conversation context:\n\n${conversationContext}\n\nYour goal: Continue the conversation naturally, answer their questions about the program, and guide them toward booking a strategy call or enrollment. During the conversation, try to naturally learn: their full name, company, job title, email address, what specifically interests them about the program, and any timeline or budget considerations. Don't interrogate — weave these into natural conversation. Remember: you ARE Maya — speak in first person as Maya throughout the call.`;

  try {
    const result = await triggerVoiceCall({
      name: leadName,
      phone,
      callType: 'interest',
      prompt: callPrompt,
      context: {
        lead_name: leadName,
        lead_company: lead?.company || undefined,
        lead_title: (lead as any)?.title || undefined,
        lead_email: lead?.email || undefined,
        lead_score: (lead as any)?.lead_score || undefined,
        conversation_history: conversationContext,
        step_goal: 'Continue admissions conversation and guide toward strategy call or enrollment',
      },
    });

    // Log to CallContactLog
    await CallContactLog.create({
      visitor_id: visitorId,
      call_type: 'maya_initiated',
      call_timestamp: new Date(),
      call_status: result.success ? 'pending' : 'failed',
      reason_for_call: 'Maya chat visitor requested voice call',
      approved_by_agent: 'Maya',
      synthflow_call_id: result.data?.call_id || null,
    } as any).catch(() => {});

    // Log to CommunicationLog so the Synthflow webhook can match this call
    // and store the transcript for post-call processing
    if (result.success && result.data?.call_id) {
      logCommunication({
        lead_id: lead?.id || null,
        channel: 'voice',
        direction: 'outbound',
        delivery_mode: 'live',
        status: 'pending',
        to_address: phone,
        provider: 'synthflow',
        provider_message_id: result.data.call_id,
        metadata: { visitor_id: visitorId, conversation_id: conversationId, source: 'maya_chat' },
      } as any).catch((err: any) => {
        console.warn('[MayaTools] CommunicationLog failed:', err.message);
      });
    }

    await logAction(visitorId, conversationId, 'voice_call_initiated', result.success ? 'completed' : 'failed', {
      lead_id: lead?.id,
      phone,
      synthflow_response: result.success,
    });

    if (!result.success) {
      return { success: false, summary: 'Unable to initiate call right now. The team will follow up.' };
    }

    return {
      success: true,
      summary: `Voice call initiated to ${phone}. ${leadName} should receive a call shortly.`,
      details: { phone, lead_name: leadName },
    };
  } catch (err: any) {
    await logAction(visitorId, conversationId, 'voice_call_initiated', 'failed', {
      error: err.message,
    });
    return { success: false, summary: `Failed to initiate call: ${err.message}` };
  }
}

// ─── Tool: Get Available Slots ─────────────────────────────────────────────────

export async function getAvailableSlots(
  args: Record<string, any>,
  _visitorId: string,
  _conversationId: string,
): Promise<MayaActionResult> {
  const days = args.days || 14;

  try {
    const availability = await calendarGetSlots(days);

    if (!availability.dates || availability.dates.length === 0) {
      return {
        success: true,
        summary: 'No available slots found in the next two weeks. Suggest the visitor check back or request a callback.',
      };
    }

    // Format into readable text — show top 8 slots across days
    const lines: string[] = [];
    let slotCount = 0;

    for (const dateEntry of availability.dates) {
      if (slotCount >= 8) break;

      const dateObj = new Date(dateEntry.date + 'T12:00:00Z');
      const dayLabel = dateObj.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        timeZone: 'America/New_York',
      });

      const times: string[] = [];
      for (const slot of dateEntry.slots) {
        if (slotCount >= 8) break;
        const slotTime = new Date(slot.start);
        const timeLabel = slotTime.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          timeZone: 'America/New_York',
        });
        times.push(`${timeLabel} (${slot.start})`);
        slotCount++;
      }

      lines.push(`${dayLabel}: ${times.join(', ')}`);
    }

    return {
      success: true,
      summary: `Available strategy call times (${availability.timezone}):\n${lines.join('\n')}`,
      details: { slot_count: slotCount, timezone: availability.timezone },
    };
  } catch (err: any) {
    return { success: false, summary: `Unable to check calendar: ${err.message}` };
  }
}

// ─── Tool: Schedule Strategy Call ──────────────────────────────────────────────

export async function scheduleStrategyCall(
  args: Record<string, any>,
  visitorId: string,
  conversationId: string,
): Promise<MayaActionResult> {
  const { slot_start, name, email, company, phone } = args;

  if (!slot_start || !name || !email) {
    return { success: false, summary: 'slot_start, name, and email are required' };
  }

  try {
    // Book on Google Calendar
    const booking = await createBooking({
      name,
      email,
      company: company || '',
      phone: phone || '',
      slotStart: slot_start,
      timezone: 'America/New_York',
    });

    // Resolve or auto-create lead so appointment, campaign, and SMS all work
    let lead = await resolveLeadForVisitor(visitorId);
    if (!lead) {
      try {
        lead = await Lead.create({
          name,
          email,
          phone: phone || null,
          company: company || null,
          interest_area: 'strategy_call',
          lead_source_type: 'inbound',
          source: 'maya_chat',
          visitor_id: visitorId,
          pipeline_stage: 'new',
          status: 'active',
          lead_score: 50,
          lead_temperature: 'hot',
        } as any);
        const visitor = await Visitor.findByPk(visitorId);
        if (visitor) await visitor.update({ lead_id: lead.id } as any);
        console.log(`[MayaTools] Auto-created lead ${lead.id} for strategy call booking`);
      } catch (err: any) {
        console.warn('[MayaTools] Auto-create lead failed:', err.message);
      }
    }

    if (lead) {
      await createAppointment({
        lead_id: lead.id,
        title: 'Executive AI Strategy Call',
        scheduled_at: new Date(slot_start),
        type: 'strategy_call',
        status: 'scheduled',
        notes: `Booked via Maya chat. Meet link: ${booking.meetLink || 'N/A'}`,
        calendar_event_id: booking.eventId,
      } as any).catch(() => {});

      // Enroll in strategy call campaign (fire-and-forget)
      routeLeadToCampaign(lead.id, 'strategy_call', visitorId, conversationId).catch(() => {});
    }

    // Send booking confirmation email with date/time and Meet link
    await sendStrategyCallConfirmation({
      to: email,
      name,
      scheduledAt: new Date(slot_start),
      timezone: 'America/New_York',
      meetLink: booking.meetLink || '',
    }).catch((err: any) => {
      console.warn('[MayaTools] Confirmation email failed:', err.message);
    });

    // Send confirmation SMS if phone + GHL available
    if (phone && lead) {
      const contactId = (lead as any).ghl_contact_id;
      if (contactId) {
        const startDate = new Date(slot_start);
        const timeStr = startDate.toLocaleString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZone: 'America/New_York',
        });
        await sendSmsViaGhl(
          contactId,
          `Hi ${name.split(' ')[0]}, your strategy call is confirmed for ${timeStr} ET. ${booking.meetLink ? `Join here: ${booking.meetLink}` : 'Check your email for the meeting link.'} — Maya, Colaberry`,
        ).catch(() => {});
      }
    }

    await logAction(visitorId, conversationId, 'strategy_call_booked', 'completed', {
      lead_id: lead?.id,
      slot_start,
      event_id: booking.eventId,
      meet_link: booking.meetLink,
      name,
      email,
    });

    const startDate = new Date(slot_start);
    const timeStr = startDate.toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/New_York',
    });

    return {
      success: true,
      summary: `Strategy call booked for ${timeStr} ET. Confirmation email sent to ${email}.${booking.meetLink ? ` Google Meet link: ${booking.meetLink}` : ''}`,
      details: { slot_start, event_id: booking.eventId, meet_link: booking.meetLink },
    };
  } catch (err: any) {
    console.error(`[MayaTools] scheduleStrategyCall error (${err.statusCode || 'no-status'}):`, err.message);
    await logAction(visitorId, conversationId, 'strategy_call_booked', 'failed', {
      error: err.message,
    });
    return { success: false, summary: `Failed to book call: ${err.message}` };
  }
}

// ─── Tool: Enroll in Campaign ──────────────────────────────────────────────────

export async function enrollInCampaign(
  args: Record<string, any>,
  visitorId: string,
  conversationId: string,
): Promise<MayaActionResult> {
  const { interest_type } = args;
  if (!interest_type) {
    return { success: false, summary: 'interest_type is required' };
  }

  const lead = await resolveLeadForVisitor(visitorId);
  if (!lead) {
    return { success: false, summary: 'No lead record found. Capture contact details first.' };
  }

  try {
    const result = await routeLeadToCampaign(lead.id, interest_type, visitorId, conversationId);
    return result;
  } catch (err: any) {
    return { success: false, summary: `Campaign enrollment failed: ${err.message}` };
  }
}

// ─── Tool: Retrieve Knowledge ──────────────────────────────────────────────────

export async function retrieveKnowledgeContent(
  args: Record<string, any>,
  _visitorId: string,
  _conversationId: string,
): Promise<MayaActionResult> {
  const { query, category } = args;
  if (!query) {
    return { success: false, summary: 'query is required' };
  }

  try {
    const entries = await findRelevantKnowledge({ query, pageCategory: category || undefined });
    if (!entries || entries.length === 0) {
      return {
        success: true,
        summary: 'No matching knowledge base entries found for this query.',
      };
    }

    const formatted = entries
      .map((e: any) => `[${e.category?.toUpperCase() || 'INFO'}] ${e.title}: ${e.content}`)
      .join('\n\n');

    return {
      success: true,
      summary: formatted,
      details: { entry_count: entries.length },
    };
  } catch (err: any) {
    return { success: false, summary: `Knowledge retrieval failed: ${err.message}` };
  }
}
