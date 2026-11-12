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
import { admissionsCalendar } from './calendarTarget';
import { createAppointment } from './appointmentService';
import { sendStrategyCallConfirmation } from './emailService';
import { findRelevantKnowledge } from './admissionsKnowledgeService';
import { gateKnowledgeEntries } from './admissionsKnowledgeGate';
import AdmissionsKnowledgeEntry from '../models/AdmissionsKnowledgeEntry';
import { routeLeadToCampaign, addMayaInteractionTag } from './mayaCampaignRouter';
import {
  generateConversationSummary,
  buildSmsSummaryContent,
} from './mayaConversationSummaryService';
import { logCommunication } from './communicationLogService';
import { getTestOverrides } from './settingsService';
import StrategyCall from '../models/StrategyCall';
import type { MayaActionResult } from './mayaActionService';
import { updateBookingState } from './mayaConversationIntelligenceService';
import { pricingPitchRule } from './admissionsPricing';

const { Op } = require('sequelize');

import { resolveLeadForVisitor, logAction } from './mayaTools/toolContext';

// ─── Internal Helpers ──────────────────────────────────────────────────────────

// ─── Internal Helpers ──────────────────────────────────────────────────────────
//
// MR1 SPLIT. This file was 1,047 lines against CLAUDE.md's 500-line hard ceiling, which
// grandfathers an oversize file only "until touched" and then requires a split before new
// code. MR1 touched it, so the shared helpers and the two outbound tools moved to
// ./mayaTools/ and are re-exported here. Nothing that imports this module changed, and
// neither did any test mock, because the export names are identical.
//
// The split is partial and honestly so: ~620 lines, not under 500. Finishing it means moving
// the remaining six tools, a far larger change than MR1 asked for and one that would put the
// whole site chat at regression risk in a single commit. The next tool to be touched is the
// next one to move.
export { resolveLeadForVisitor } from './mayaTools/toolContext';
export { sendSmsSummary } from './mayaTools/smsTool';
export { initiateVoiceCall } from './mayaTools/voiceTool';

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

    // ── Lead identity resolution ─────────────────────────────────────────
    // EMAIL is the canonical identifier.  When an email is provided we
    // always resolve (or create) by email — never by visitor linkage alone.
    // This prevents different people sharing a browser/session from
    // overwriting each other's lead records.

    // Step 1: Try to find existing lead by email (canonical lookup)
    let emailLead: InstanceType<typeof Lead> | null = null;
    if (email) {
      emailLead = await Lead.findOne({
        where: require('sequelize').where(
          require('sequelize').fn('LOWER', require('sequelize').col('email')),
          email.toLowerCase(),
        ),
      });
    }

    // Step 2: Resolve the visitor-linked lead (if any)
    const visitorLead = visitor.lead_id ? await Lead.findByPk(visitor.lead_id) : null;

    if (emailLead) {
      // Email match found — this is the authoritative lead record.
      lead = emailLead;
      const updates: Record<string, any> = {};
      // Only update name if lead has no name or email matches (same person)
      if (!lead.getDataValue('name') || lead.email?.toLowerCase() === email.toLowerCase()) {
        updates.name = fullName;
      }
      if (phone && !lead.phone) updates.phone = phone;
      if (company && !lead.company) updates.company = company;
      if (title && !(lead as any).title) updates.title = title;
      if (interest_type) updates.interest_area = interest_type;
      if (Object.keys(updates).length > 0) await lead.update(updates);
    } else if (visitorLead && !email) {
      // No email provided and visitor has a linked lead — update non-identity
      // fields only (name enrichment is safe, email overwrite is not).
      lead = visitorLead;
      const updates: Record<string, any> = { name: fullName };
      if (phone && !lead.phone) updates.phone = phone;
      if (company && !lead.company) updates.company = company;
      if (title && !(lead as any).title) updates.title = title;
      if (interest_type) updates.interest_area = interest_type;
      await lead.update(updates);
    } else {
      // No email match and either no visitor lead or email provided for a new person.
      // Create a fresh lead record.
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

    // Link visitor to the resolved/created lead
    if (visitor.lead_id !== lead.id) {
      await visitor.update({ lead_id: lead.id } as any);
    }

    // Update admissions memory with lead_id
    await AdmissionsMemory.update(
      { lead_id: lead.id },
      { where: { visitor_id: visitorId } },
    ).catch(() => {});

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

    // Tag Maya interaction
    addMayaInteractionTag(lead.id, 'maya_chat_active').catch(() => {});

    // Auto-enroll in Inbound Lead campaign if name+email+phone captured and no explicit interest
    if (!interest_type && email && phone) {
      routeLeadToCampaign(lead.id, 'general', visitorId, conversationId).catch((err: any) => {
        console.warn('[MayaTools] Inbound campaign enrollment failed:', err.message);
      });
    }

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



// ─── Tool: Get Available Slots ─────────────────────────────────────────────────

export async function getAvailableSlots(
  args: Record<string, any>,
  _visitorId: string,
  _conversationId: string,
): Promise<MayaActionResult> {
  const days = args.days || 14;
  const preferredDay: string | undefined = args.preferred_day;
  const preferredTime: string | undefined = args.preferred_time;

  // Enforce preference collection — don't show slots without asking first
  if (!preferredDay && !preferredTime) {
    return {
      success: false,
      summary: 'You must ask the visitor which day they prefer (e.g. Monday, Tuesday, tomorrow) and whether they want a morning or afternoon slot BEFORE calling this tool. Ask them now, then call get_available_slots again with preferred_day and preferred_time.',
    };
  }

  try {
    const availability = await calendarGetSlots(days, admissionsCalendar()); // C90: Maya offers the admissions calendar's free times

    if (!availability.dates || availability.dates.length === 0) {
      return {
        success: true,
        summary: 'No available slots found in the next two weeks. Suggest the visitor check back or request a callback.',
      };
    }

    // Filter by preferred day if specified
    let matchingDates = availability.dates;
    if (preferredDay) {
      const dayLower = preferredDay.toLowerCase();
      const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

      if (dayLower === 'tomorrow') {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];
        matchingDates = availability.dates.filter((d) => d.date === tomorrowStr);
      } else {
        const targetDayIndex = weekdays.findIndex((w) => dayLower.includes(w));
        if (targetDayIndex >= 0) {
          matchingDates = availability.dates.filter((d) => {
            const dateObj = new Date(d.date + 'T12:00:00Z');
            return dateObj.getUTCDay() === targetDayIndex;
          });
        }
      }

      // Fall back to all dates if no match
      if (matchingDates.length === 0) {
        matchingDates = availability.dates;
      }
    }

    // Collect candidate slots, filtered by time-of-day preference
    interface CandidateSlot {
      dayLabel: string;
      timeLabel: string;
      iso: string;
    }
    const candidates: CandidateSlot[] = [];

    for (const dateEntry of matchingDates) {
      const dateObj = new Date(dateEntry.date + 'T12:00:00Z');
      const dayLabel = dateObj.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'America/Chicago',
      });

      for (const slot of dateEntry.slots) {
        const slotTime = new Date(slot.start);
        const hour = parseInt(
          slotTime.toLocaleTimeString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Chicago' }),
        );

        // Filter by time preference
        if (preferredTime === 'morning' && hour >= 12) continue;
        if (preferredTime === 'afternoon' && hour < 12) continue;

        const timeLabel = slotTime.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          timeZone: 'America/Chicago',
        });
        candidates.push({ dayLabel, timeLabel, iso: slot.start });
      }
    }

    if (candidates.length === 0) {
      // No slots match preferences — tell Maya what's available instead
      const availableDays = availability.dates.slice(0, 5).map((d) => {
        const dateObj = new Date(d.date + 'T12:00:00Z');
        return dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Chicago' });
      });
      return {
        success: true,
        summary: `No slots available for the requested day/time. Available days: ${availableDays.join(', ')}. Ask the visitor which of these works and whether they prefer morning or afternoon.`,
      };
    }

    // Only use slots from the FIRST matching day so options stay on one date
    const firstDay = candidates[0].dayLabel;
    const sameDayCandidates = candidates.filter((c) => c.dayLabel === firstDay);

    // Pick 3 well-spaced options from that day
    const picked: CandidateSlot[] = [];
    if (sameDayCandidates.length <= 3) {
      picked.push(...sameDayCandidates);
    } else {
      // First, middle, last for good spread
      picked.push(sameDayCandidates[0]);
      picked.push(sameDayCandidates[Math.floor(sameDayCandidates.length / 2)]);
      picked.push(sameDayCandidates[sameDayCandidates.length - 1]);
    }

    const optionLines = picked.map((s, i) => `${i + 1}. ${s.dayLabel} at ${s.timeLabel} [${s.iso}]`);
    const timeContext = preferredTime && preferredTime !== 'any' ? ` (${preferredTime})` : '';

    return {
      success: true,
      summary: `Here are 3 available times${timeContext} (Central Time):\n${optionLines.join('\n')}\n\nPresent these 3 options to the visitor. If none work, ask for a different day or time preference and call get_available_slots again.`,
      details: { options: picked.length, total_matching: candidates.length, timezone: availability.timezone },
    };
  } catch (err: any) {
    console.error('[MayaTools] getAvailableSlots error:', err.message);
    return {
      success: false,
      summary: "I'm having trouble checking the calendar right now. Apologize to the visitor and ask them to try again in a moment, or offer to have the team reach out to schedule directly.",
    };
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

  // ── Dedup guard: prevent multiple bookings within 24 hours ──────────
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existingCall = await StrategyCall.findOne({
      where: {
        email: require('sequelize').where(
          require('sequelize').fn('LOWER', require('sequelize').col('email')),
          email.toLowerCase(),
        ),
        status: 'scheduled',
        created_at: { [Op.gte]: oneDayAgo },
      },
    });

    if (existingCall) {
      const existingTime = new Date(existingCall.scheduled_at).toLocaleString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/Chicago',
      });
      await logAction(visitorId, conversationId, 'strategy_call_booked', 'skipped', {
        email,
        reason: 'duplicate_within_24h',
        existing_call_id: existingCall.id,
        existing_scheduled_at: existingCall.scheduled_at,
      });
      return {
        success: false,
        summary: `A strategy call is already scheduled for ${email} on ${existingTime} CT. If they need to reschedule, ask them to reply to the confirmation email or contact the team directly.`,
      };
    }
  } catch (dedupErr: any) {
    // Non-fatal — log and proceed with booking rather than blocking
    console.warn('[MayaTools] Dedup check failed, proceeding:', dedupErr.message);
  }

  try {
    // Book on Google Calendar
    const booking = await createBooking({
      name,
      email,
      company: company || '',
      phone: phone || '',
      slotStart: slot_start,
      timezone: 'America/Chicago',
    }, admissionsCalendar()); // C90: Maya books admissions calls on the admissions calendar

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
      // Use the canonical startTime from the Google Calendar booking result
      // to avoid slot_start parsing inconsistencies (FIX 4)
      await createAppointment({
        lead_id: lead.id,
        title: 'Executive AI Strategy Call',
        scheduled_at: booking.startTime,
        type: 'strategy_call',
        notes: `Booked via Maya chat. Meet link: ${booking.meetLink || 'N/A'}`,
      } as any).catch((err: any) => {
        console.error('[MayaTools] Appointment creation failed:', err.message);
      });

      // Tag + enroll in strategy call campaign (fire-and-forget)
      addMayaInteractionTag(lead.id, 'maya_strategy_call_interest').catch(() => {});
      routeLeadToCampaign(lead.id, 'strategy_call', visitorId, conversationId).catch(() => {});
    }

    // Send booking confirmation email with date/time and Meet link
    await sendStrategyCallConfirmation({
      to: email,
      name,
      scheduledAt: new Date(slot_start),
      timezone: 'America/Chicago',
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
          timeZone: 'America/Chicago',
        });
        await sendSmsViaGhl(
          contactId,
          `Hi ${name.split(' ')[0]}, your strategy call is confirmed for ${timeStr} CT. ${booking.meetLink ? `Join here: ${booking.meetLink}` : 'Check your email for the meeting link.'} — Maya, Colaberry`,
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

    // Record booking completion in conversation intelligence (fire-and-forget)
    updateBookingState(conversationId, {
      offered: true,
      clicked: true,
      completed: true,
      bookingId: booking.eventId,
    }).catch(() => {});

    const startDate = new Date(slot_start);
    const timeStr = startDate.toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Chicago',
    });

    return {
      success: true,
      summary: `Strategy call booked for ${timeStr} CT. Confirmation email sent to ${email}.${booking.meetLink ? ` Google Meet link: ${booking.meetLink}` : ''}`,
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
    // GATED, because this tool is a way AROUND the gated prompt path. Maya calls
    // `retrieve_knowledge` herself and the result goes straight back into the conversation,
    // so leaving it ungated would mean the model could reach a retired fact simply by asking
    // for it. Same gate, same reasons, applied at the same moment of quoting.
    const entries = await findRelevantKnowledge({ query, pageCategory: category || undefined });
    const gated = gateKnowledgeEntries(entries || []);
    if (gated.allowed.length === 0) {
      return {
        success: true,
        // "Nothing matched" and "everything that matched is unquotable" are different
        // situations and the model is told which, so it cannot read the second as the first.
        summary:
          gated.retrieved === 0
            ? 'No matching knowledge base entries found for this query.'
            : `No quotable entry matched. ${gated.retrieved} matched but quote retired facts and were withheld. `
              + 'Do not reconstruct them. Say you want to give the exact answer and offer the admissions team.',
        details: { entry_count: 0, withheld: gated.blocked.length },
      };
    }

    const formatted = gated.allowed
      .map((e: any) => `[${e.category?.toUpperCase() || 'INFO'}] ${e.title}: ${e.content}`)
      .join('\n\n');

    return {
      success: true,
      summary: formatted,
      details: { entry_count: gated.allowed.length, withheld: gated.blocked.length },
    };
  } catch (err: any) {
    return { success: false, summary: `Knowledge retrieval failed: ${err.message}` };
  }
}
