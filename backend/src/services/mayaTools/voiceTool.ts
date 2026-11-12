import { Op } from 'sequelize';
import { ChatMessage } from '../../models';
import CallContactLog from '../../models/CallContactLog';
import AdmissionsKnowledgeEntry from '../../models/AdmissionsKnowledgeEntry';
import { triggerVoiceCall } from '../synthflowService';
import { gateKnowledgeEntries } from '../admissionsKnowledgeGate';
import { routeLeadToCampaign, addMayaInteractionTag } from '../mayaCampaignRouter';
import { logCommunication } from '../communicationLogService';
import { getTestOverrides } from '../settingsService';
import { pricingPitchRule } from '../admissionsPricing';
import type { MayaActionResult } from '../mayaActionService';
import { resolveLeadForVisitor, logAction, logOutboundOutcome } from './toolContext';
import { voiceSkipSummary, VOICE_SKIP_SUMMARY_FALLBACK } from './voiceSummaries';

/**
 * `initiate_voice_call` - place an AI voice call to the visitor.
 *
 * Moved out of `mayaToolsService.ts` by MR1: that file was 1,047 lines against a 500-line hard
 * ceiling, and CLAUDE.md says the next change to an oversize file must split it before adding
 * code. `mayaToolsService` re-exports this, so no caller and no test mock changed.
 *
 * ── THE DEFECT THIS FILE WAS SPLIT OUT TO FIX, AND IT WAS NOT HYPOTHETICAL ──
 *
 * `triggerVoiceCall` returns `{ success: true, data: { skipped: true, reason } }` for SEVEN
 * reasons it did not dial. That is a 200-shaped success: nothing throws and no error class is
 * ever constructed. This handler read `result.success` alone.
 *
 * Measured in production 2026-11-12: `admissions_action_logs` held exactly 2
 * `voice_call_initiated` rows, both `status='completed'` (2026-10-24 and 2026-11-06), and
 * `call_contact_logs` held 2 `pending` rows, **both with a null `synthflow_call_id`**. A null
 * provider id means the request never reached Synthflow. `ENABLE_VOICE_CALLS` is `false` in
 * production, so every attempt takes the `feature_disabled` branch and no call can arrive.
 *
 * Two consequences worth naming separately:
 *   - `kill_switch_active` is one of the seven, so the platform-wide emergency stop halted the
 *     dial and left Maya still promising calls - the opposite of what that switch is for.
 *   - The phantom row broke the retry. The 24h dedup below matches ANY row for the visitor
 *     regardless of `call_status`, so a skipped attempt blocked the next genuine one for a day.
 *
 * ── THREE OUTCOMES, NOT TWO ─────────────────────────────────────────────────
 *
 *   not dialled   `skipped`, or `success: false` -> failure, NO `CallContactLog` row (so a
 *                 retry is not blocked), no tag, no campaign enrolment.
 *   unconfirmed   accepted with no `call_id` -> a call MAY be ringing and cannot be tracked,
 *                 because the completion webhook matches on `provider_message_id`. Reported as
 *                 a failure, but the row IS written, because a duplicate call to a stranger is
 *                 worse than a duplicate row. Its `reason_for_call` is distinct, so a forensic
 *                 query can tell it apart from the old phantom rows, which are byte-identical
 *                 in every other column.
 *   placed        `call_id` present -> unchanged behavior.
 */

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

  // Fetch high-priority knowledge entries so the voice agent has accurate facts
  let knowledgeFacts = '';
  try {
    const topEntries = await AdmissionsKnowledgeEntry.findAll({
      where: { active: true, priority: { [Op.gte]: 9 } },
      order: [['priority', 'DESC']],
      limit: 15,
    });
    // Gated as well: this path reads the table directly by priority and never went through
    // `findRelevantKnowledge`, so it was the third way a retired fact could reach a person -
    // and the only one that reaches them by telephone.
    const gated = gateKnowledgeEntries(topEntries);
    if (gated.allowed.length > 0) {
      knowledgeFacts = gated.allowed
        .map((e: any) => `- ${e.title}: ${e.content}`)
        .join('\n');
    }
  } catch {
    // Non-fatal — fall back to static facts only
  }

  const callPrompt = `You ARE Maya, Director of Admissions at Colaberry. You are calling ${leadName}. Introduce yourself as "Hi ${leadName.split(' ')[0]}, this is Maya from Colaberry." They were just chatting with you online about the AI Leadership Accelerator program.

CRITICAL PROGRAM FACTS — use these exact figures, never approximate or guess:
- Program name: Enterprise AI Leadership Accelerator
- ${pricingPitchRule()} Group and corporate pricing comes from a person in admissions
- Duration: 3 weeks, 5 live sessions
- Format: Live, hands-on, with expert-guided project work
- Payment: card for membership; corporate invoice through admissions
- What participants get: Enterprise AI architecture templates, governance frameworks, production-ready AI proof of capability, 90-day expansion roadmap
- Target audience: Directors and VPs of Engineering, Technology, or Data; CTOs and CDOs; Senior Technical Architects responsible for AI adoption; any technical leader whose team is being asked to deliver AI outcomes — this program is for builders and decision-makers at every level, not just C-suite executives
- ROI framing: Organizations typically invest 6-12 months to achieve similar outcomes through traditional approaches. The Accelerator compresses this to 3 weeks
${knowledgeFacts ? `\nADDITIONAL KNOWLEDGE BASE FACTS:\n${knowledgeFacts}` : ''}

CONVERSATION CONTEXT (what was discussed in the chat before this call):
${conversationContext}

Your goal: Continue the conversation naturally, answer their questions about the program, and guide them toward booking a strategy call or enrollment. During the conversation, try to naturally learn: their full name, company, job title, email address, what specifically interests them about the program, and any timeline or budget considerations. Don't interrogate — weave these into natural conversation. Remember: you ARE Maya — speak in first person as Maya throughout the call.`;

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

    // THE PROVIDER'S `success` IS NOT A PLACED CALL. See this file's header for the measured
    // production evidence and the three-outcome rule. The guard is keyed on `data.skipped`
    // rather than on a list of reason names, deliberately: the reason set has already grown
    // once under this code (a reviewer found `invalid_phone` at `synthflowService.ts:222`
    // after the first six were enumerated), so correctness must not depend on the list being
    // complete. `voiceSkipSummary` answers for any reason, known or not.
    const skipReason = result.data?.skipped === true
      ? String(result.data?.reason ?? 'unspecified')
      : null;
    const providerAccepted = result.success && !skipReason;
    const callId = typeof result.data?.call_id === 'string' && result.data.call_id
      ? result.data.call_id
      : null;

    if (!providerAccepted) {
      // Nothing was dialled, and we know it. Report the refusal and write nothing that implies
      // a call, so a retry is not blocked by an attempt that never left the building.
      const errorClass = skipReason ? 'VoiceProviderSkipped' : 'VoiceProviderRejected';
      logOutboundOutcome({
        event: 'maya_voice_call_not_placed',
        outcome: 'failure',
        errorClass,
        context: { visitor_id: visitorId, conversation_id: conversationId, reason: skipReason },
      });
      await logAction(visitorId, conversationId, 'voice_call_initiated', 'failed', {
        lead_id: lead?.id,
        error_class: errorClass,
        provider_reason: skipReason,
      });
      return {
        success: false,
        summary: voiceSkipSummary(skipReason),
      };
    }

    // The provider accepted the request, so a call MAY be dialling. Record it either way: the
    // row is what stops a second dial, and a duplicate call to a stranger is worse than a
    // duplicate row.
    await CallContactLog.create({
      visitor_id: visitorId,
      call_type: 'maya_initiated',
      call_timestamp: new Date(),
      call_status: 'pending',
      reason_for_call: 'Maya chat visitor requested voice call',
      approved_by_agent: 'Maya',
      synthflow_call_id: callId,
      // Distinct text when there is no provider id, so a forensic query can separate a
      // legitimately unconfirmed attempt from the two phantom rows the old bug left behind -
      // which are identical in every other column and can never resolve.
      ...(callId ? {} : { reason_for_call: 'Maya voice call accepted with no provider id (unconfirmed)' }),
    } as any).catch(() => {});

    if (!callId) {
      // Accepted with no call id: a call may be ringing and we cannot track it, because the
      // completion webhook matches on `provider_message_id`. This is the one genuinely UNKNOWN
      // outcome, and it is reported as a failure deliberately - "we could not confirm it" is
      // the only honest thing to say, and being silently surprised by a call is a far smaller
      // harm than waiting for one that never comes.
      logOutboundOutcome({
        event: 'maya_voice_call_unconfirmed',
        outcome: 'failure',
        errorClass: 'VoiceProviderNoCallId',
        context: {
          visitor_id: visitorId,
          conversation_id: conversationId,
          response_keys: Object.keys(result.data || {}),
        },
      });
      await logAction(visitorId, conversationId, 'voice_call_initiated', 'failed', {
        lead_id: lead?.id,
        error_class: 'VoiceProviderNoCallId',
      });
      return {
        success: false,
        summary: 'The call could not be confirmed, so do not tell them a call is coming. Offer to '
          + 'arrange a callback with schedule_callback instead.',
      };
    }

    // Log to CommunicationLog so the Synthflow webhook can match this call
    // and store the transcript for post-call processing
    logCommunication({
      lead_id: lead?.id || null,
      channel: 'voice',
      direction: 'outbound',
      delivery_mode: 'live',
      status: 'pending',
      to_address: phone,
      provider: 'synthflow',
      provider_message_id: callId,
      metadata: { visitor_id: visitorId, conversation_id: conversationId, source: 'maya_chat' },
    } as any).catch((err: any) => {
      logOutboundOutcome({
        event: 'maya_voice_communication_log_failed',
        outcome: 'failure',
        errorClass: err instanceof Error ? err.constructor.name : 'UnknownError',
        context: { visitor_id: visitorId, conversation_id: conversationId },
      });
    });

    logOutboundOutcome({
      event: 'maya_voice_call_placed',
      outcome: 'success',
      context: { visitor_id: visitorId, conversation_id: conversationId, call_id: callId },
    });
    await logAction(visitorId, conversationId, 'voice_call_initiated', 'completed', {
      lead_id: lead?.id,
      phone,
      synthflow_response: true,
    });

    // Tag + auto-enroll in Voice Call Requested campaign
    if (lead?.id) {
      addMayaInteractionTag(lead.id, 'maya_voice_call_requested').catch(() => {});
      routeLeadToCampaign(lead.id, 'voice_call', visitorId, conversationId).catch((err: any) => {
        logOutboundOutcome({
          event: 'maya_voice_campaign_enrollment_failed',
          outcome: 'failure',
          errorClass: err instanceof Error ? err.constructor.name : 'UnknownError',
          context: { visitor_id: visitorId, lead_id: lead.id },
        });
      });
    }

    return {
      success: true,
      summary: `Voice call initiated to ${phone}. ${leadName} should receive a call shortly.`,
      details: { phone, lead_name: leadName },
    };
  } catch (err: any) {
    // A throw here means the request did not complete, so no call was placed. The provider's own
    // error text is NOT handed to the model: it can carry a URL, an id or an upstream payload,
    // and the visitor-facing reply is the wrong place for any of them.
    logOutboundOutcome({
      event: 'maya_voice_call_threw',
      outcome: 'failure',
      errorClass: err instanceof Error ? err.constructor.name : 'UnknownError',
      context: { visitor_id: visitorId, conversation_id: conversationId },
    });
    await logAction(visitorId, conversationId, 'voice_call_initiated', 'failed', {
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      error: err?.message,
    });
    return { success: false, summary: VOICE_SKIP_SUMMARY_FALLBACK };
  }
}
