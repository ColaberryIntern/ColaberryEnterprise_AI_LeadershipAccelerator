import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { CommunicationLog, CampaignSimulationStep, Lead } from '../models';
import { InteractionOutcome } from '../models';
import { CallContactLog } from '../models';
import { processCallTranscript } from '../services/callTranscriptProcessor';
import { sendSmsViaGhl, syncLeadToGhl, findContactByEmail } from '../services/ghlService';
import { logActivity } from '../services/activityService';
import OpenAI from 'openai';
import { env } from '../config/env';
import { getTestOverrides } from '../services/settingsService';

/**
 * POST /api/webhook/synthflow/call-complete
 * Receives call completion data from Synthflow AI.
 * Updates the CommunicationLog with transcript and call metadata.
 */
export async function handleSynthflowCallComplete(req: Request, res: Response): Promise<void> {
  try {
    // Log raw payload to diagnose Synthflow's field names
    console.log('[Synthflow Webhook] Raw payload:', JSON.stringify(req.body).slice(0, 2000));

    const body = req.body || {};

    // Synthflow V2 nests most data under body.call.*
    const call = body.call || {};
    const call_id = call.call_id || body.call_id || call._id || body._id || null;
    const status = call.status || body.status || '';
    const duration = call.duration || body.duration || null;
    const transcript = call.transcript || body.transcript || '';
    const recording_url = call.recording_url || body.recording_url || '';
    const disposition = call.end_call_reason || body.disposition || '';
    const analysis = body.analysis || {};
    const metadata = body.metadata || {};

    if (!call_id) {
      console.warn('[Synthflow Webhook] No call_id found. Payload keys:', Object.keys(body).join(', '));
      // Accept it anyway with 200 so Synthflow doesn't retry, but log for debugging
      res.status(200).json({ ok: true, matched: false, reason: 'no_call_id', keys: Object.keys(body) });
      return;
    }

    console.log(`[Synthflow Webhook] Call complete: ${call_id}, status: ${status}, disposition: ${disposition}`);

    // Find the communication log entry by provider_message_id
    let commLog = await CommunicationLog.findOne({
      where: { provider_message_id: call_id, provider: 'synthflow' },
    });

    // Fallback: match by recent pending voice call (covers null call_id scenarios)
    if (!commLog) {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
      commLog = await CommunicationLog.findOne({
        where: {
          provider: 'synthflow',
          channel: 'voice',
          status: 'pending',
          created_at: { [Op.gte]: tenMinAgo },
        },
        order: [['created_at', 'DESC']],
      });
      if (commLog) {
        console.log(`[Synthflow Webhook] Matched via fallback (recent pending voice call)`);
        await commLog.update({ provider_message_id: call_id });
      }
    }

    // Backfill CallContactLog with synthflow_call_id if it was null
    if (call_id) {
      CallContactLog.update(
        { synthflow_call_id: call_id, call_status: 'completed' },
        { where: { synthflow_call_id: { [Op.is]: null as any }, call_type: 'maya_initiated' }, limit: 1 } as any,
      ).catch(() => {});
    }

    if (!commLog) {
      console.warn(`[Synthflow Webhook] No CommunicationLog found for call_id: ${call_id}`);
      res.status(200).json({ ok: true, matched: false });
      return;
    }

    // Update communication log with transcript and call data
    const callCompleted = status === 'completed';
    await commLog.update({
      status: callCompleted ? 'delivered' : 'failed',
      provider_response: {
        ...(commLog.provider_response || {}),
        call_status: status,
        duration,
        transcript,
        recording_url,
        end_call_reason: disposition,
        analysis,
        metadata,
        completed_at: new Date().toISOString(),
      },
    } as any);

    const commMeta = (commLog as any).metadata || {};

    // Bridge voice call to Activity timeline
    if (commLog.lead_id) {
      try {
        const leadRecord = await Lead.findByPk(commLog.lead_id);
        const leadName = (leadRecord as any)?.name || 'Lead';
        const firstName = leadName.split(' ')[0];
        const isVoicemail = disposition === 'voicemail';
        const durationMin = duration ? `${Math.floor(duration / 60)}m ${duration % 60}s` : '';

        await logActivity({
          lead_id: commLog.lead_id as number,
          type: 'call',
          subject: isVoicemail
            ? `Maya called ${firstName} — voicemail`
            : `Maya called ${firstName}${durationMin ? ` (${durationMin})` : ''}`,
          body: transcript ? transcript.substring(0, 2000) : undefined,
          metadata: {
            activity_subtype: 'voice_call',
            call_id,
            duration,
            disposition,
            recording_url: recording_url || undefined,
            has_transcript: !!transcript,
            trigger: commMeta.trigger || 'outbound_call',
            status,
          },
        });
      } catch (actErr: any) {
        console.warn(`[Synthflow Webhook] Activity bridge error:`, actErr.message);
      }
    }

    // If this was a simulation step, update step details with transcript
    if (commLog.simulation_step_id) {
      const simStep = await CampaignSimulationStep.findByPk(commLog.simulation_step_id);
      if (simStep) {
        const details = (simStep as any).details || {};
        await simStep.update({
          details: {
            ...details,
            transcript,
            recording_url,
            call_duration: duration,
            call_disposition: disposition,
          },
        } as any);
      }
    }

    // Create interaction outcome if lead_id exists
    if (commLog.lead_id && commLog.campaign_id) {
      // Map Synthflow end_call_reason to outcome
      const outcome = status === 'completed' ? 'answered'
        : disposition === 'voicemail' ? 'voicemail'
        : disposition === 'no_answer' ? 'no_answer'
        : 'no_answer';

      await InteractionOutcome.create({
        lead_id: commLog.lead_id,
        campaign_id: commLog.campaign_id,
        channel: 'voice',
        outcome,
        metadata: {
          call_id,
          duration,
          disposition,
          has_transcript: !!transcript,
          source: 'synthflow_webhook',
        },
      } as any);
    }

    // If hot lead escalation call went to voicemail → send fallback SMS
    if (disposition === 'voicemail' && commMeta.trigger === 'hot_lead_escalation' && commLog.lead_id) {
      sendVoicemailFallbackSms(commLog.lead_id as any).catch((err: any) => {
        console.warn('[Synthflow Webhook] Voicemail fallback SMS failed:', err.message);
      });
    }

    // Process transcript via AI to extract lead data
    if (transcript && commLog.lead_id) {
      processCallTranscript(commLog.lead_id, transcript, call_id).then(async () => {
        // Update the voice call activity with AI-extracted call summary
        try {
          const updatedComm = await CommunicationLog.findByPk(commLog.id);
          const callSummary = (updatedComm as any)?.metadata?.call_summary;
          if (callSummary) {
            const { Activity } = require('../models');
            const callActivity = await Activity.findOne({
              where: { lead_id: commLog.lead_id, type: 'call' },
              order: [['created_at', 'DESC']],
            });
            if (callActivity) {
              const existingMeta = (callActivity as any).metadata || {};
              await callActivity.update({
                metadata: { ...existingMeta, call_summary: callSummary },
              });
            }
          }
        } catch (sumErr: any) {
          console.warn('[Synthflow Webhook] Call summary activity update failed:', sumErr.message);
        }

        // If this was a hot lead escalation call and the lead showed interest,
        // move them from current campaign → Strategy Call Readiness
        if (commMeta.trigger === 'hot_lead_escalation') {
          try {
            const lead = await Lead.findByPk(commLog.lead_id as any);
            const interestArea = (lead as any)?.interest_area;
            // Check if lead expressed interest (transcript processor sets interest_area)
            if (interestArea === 'strategy_call' || interestArea === 'enrollment' || interestArea === 'executive_briefing') {
              const { CampaignLead, ScheduledEmail } = require('../models');
              const strategyCampaignId = '673d0ddf-78fc-44ab-b25e-858ef322d335';
              const prevCampaignId = commMeta.previous_campaign_id;

              // Unenroll from current campaign
              if (prevCampaignId) {
                await CampaignLead.update(
                  { status: 'completed' },
                  { where: { lead_id: commLog.lead_id, campaign_id: prevCampaignId, status: 'active' } },
                );
                // Cancel pending actions in old campaign
                await ScheduledEmail.update(
                  { status: 'cancelled' },
                  { where: { lead_id: commLog.lead_id, campaign_id: prevCampaignId, status: 'pending' } },
                );
                console.log(`[Synthflow Webhook] Unenrolled lead ${commLog.lead_id} from ${prevCampaignId}`);
              }

              // Enroll in Strategy Call Readiness
              const { enrollLeadInSequence } = require('../services/sequenceService');
              await enrollLeadInSequence(commLog.lead_id, strategyCampaignId);
              console.log(`[Synthflow Webhook] 🎯 Hot lead ${(lead as any)?.name} moved to Strategy Call Readiness (interest: ${interestArea})`);
            }
          } catch (moveErr: any) {
            console.warn(`[Synthflow Webhook] Campaign transition failed: ${moveErr.message}`);
          }
        }
      }).catch((err: any) => {
        console.warn('[Synthflow Webhook] Transcript processing failed:', err.message);
      });
    }

    // Send post-call SMS summary with CTA (fire-and-forget)
    if (callCompleted && transcript && commLog.lead_id) {
      sendPostCallSms(commLog.lead_id, transcript, call_id).catch((err: any) => {
        console.warn('[Synthflow Webhook] Post-call SMS failed:', err.message);
      });
    }

    res.status(200).json({ ok: true, matched: true });
  } catch (err: any) {
    console.error('[Synthflow Webhook] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ─── Post-Call SMS Summary ──────────────────────────────────────────────────
// Summarizes the voice call transcript and sends an SMS with a CTA via GHL.

async function sendPostCallSms(leadId: number, transcript: string, callId: string): Promise<void> {
  const lead = await Lead.findByPk(leadId);
  if (!lead) {
    console.warn(`[PostCallSMS] Lead ${leadId} not found`);
    return;
  }

  const leadName = (lead as any).name || (lead as any).first_name || 'there';
  const firstName = leadName.split(' ')[0];

  // In test mode, look up the test contact by test email instead of using the lead's stored GHL ID
  let ghlContactId: string | null = null;
  const testOverrides = await getTestOverrides();
  const isTestMode = !!(testOverrides.enabled);

  if (isTestMode && testOverrides.email) {
    console.log(`[PostCallSMS] TEST MODE — looking up GHL contact for test email: ${testOverrides.email}`);
    const testContact = await findContactByEmail(testOverrides.email);
    if (testContact) {
      ghlContactId = testContact.id;
      console.log(`[PostCallSMS] TEST MODE — using test contact ${ghlContactId}`);
    } else {
      // Sync to create the test contact
      const syncResult = await syncLeadToGhl(lead, 'voice_call', false, true);
      ghlContactId = syncResult.contactId;
    }
  } else {
    ghlContactId = (lead as any).ghl_contact_id;
    if (!ghlContactId) {
      console.log(`[PostCallSMS] Lead ${leadId} has no GHL contact — syncing now`);
      const syncResult = await syncLeadToGhl(lead, 'voice_call', false, true);
      ghlContactId = syncResult.contactId;
    }
  }

  if (!ghlContactId) {
    console.warn(`[PostCallSMS] Could not resolve GHL contact for lead ${leadId}. SMS skipped.`);
    return;
  }

  // Summarize transcript via AI
  const smsBody = await summarizeTranscriptForSms(firstName, transcript);
  console.log(`[PostCallSMS] Sending SMS to lead ${leadId} (${smsBody.length} chars): ${smsBody.substring(0, 80)}...`);

  const result = await sendSmsViaGhl(ghlContactId, smsBody);
  if (result.success) {
    console.log(`[PostCallSMS] SMS sent to lead ${leadId} via GHL contact ${ghlContactId}`);

    // Bridge to Activity timeline
    const leadName = (lead as any).name || 'Lead';
    const firstN = leadName.split(' ')[0];
    await logActivity({
      lead_id: leadId,
      type: 'sms',
      subject: `Post-call follow-up SMS sent to ${firstN}`,
      body: smsBody,
      metadata: {
        activity_subtype: 'post_call_sms',
        call_id: callId,
        trigger: 'post_call_summary',
      },
    }).catch(() => {});
  } else {
    console.error(`[PostCallSMS] SMS failed for lead ${leadId}: ${result.error}`);
  }
}

async function summarizeTranscriptForSms(firstName: string, transcript: string): Promise<string> {
  try {
    const apiKey = env.openaiApiKey;
    if (!apiKey) throw new Error('No OpenAI key');

    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model: env.chatModel,
      max_tokens: 150,
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content: `You are Maya, Director of Admissions at Colaberry. You just finished a phone call with ${firstName}. Write a brief follow-up TEXT MESSAGE (SMS) that:
1. Thanks them for the call
2. Summarizes 1-2 key points discussed
3. Includes a clear call-to-action (book a strategy call or visit the enrollment page)
4. Keeps a warm, professional tone

RULES:
- Maximum 280 characters total
- Include this link for booking: https://enterprise.colaberry.ai/program
- Sign off as "- Maya, Colaberry"
- Do NOT use emojis
- Write as a text message, not an email`,
        },
        { role: 'user', content: `Call transcript:\n${transcript}` },
      ],
    });

    return response.choices[0]?.message?.content?.trim() ||
      `Hi ${firstName}, thanks for chatting with me! I'd love to continue our conversation. Book a strategy call here: https://enterprise.colaberry.ai/program - Maya, Colaberry`;
  } catch (err: any) {
    console.warn(`[PostCallSMS] AI summary failed: ${err.message}. Using fallback.`);
    return `Hi ${firstName}, thanks for chatting with me about the AI Leadership Accelerator! Book a strategy call to continue our conversation: https://enterprise.colaberry.ai/program - Maya, Colaberry`;
  }
}

// ─── Voicemail Fallback SMS ─────────────────────────────────────────────────
// Sends a quick SMS when Maya's hot lead call goes to voicemail.

async function sendVoicemailFallbackSms(leadId: number): Promise<void> {
  const lead = await Lead.findByPk(leadId);
  if (!lead) return;

  const leadName = (lead as any).name || 'there';
  const firstName = leadName.split(' ')[0];

  // Resolve GHL contact (same pattern as sendPostCallSms)
  let ghlContactId: string | null = null;
  const testOverrides = await getTestOverrides();

  if (testOverrides.enabled && testOverrides.email) {
    const testContact = await findContactByEmail(testOverrides.email);
    ghlContactId = testContact?.id || null;
  } else {
    ghlContactId = (lead as any).ghl_contact_id;
    if (!ghlContactId) {
      const syncResult = await syncLeadToGhl(lead, 'voice_call', false, true);
      ghlContactId = syncResult.contactId;
    }
  }

  if (!ghlContactId) {
    console.warn(`[VM-SMS] No GHL contact for lead ${leadId}. SMS skipped.`);
    return;
  }

  const smsBody = `Hi ${firstName}, this is Maya from Colaberry Enterprise AI. I just tried to give you a call — I noticed you've been engaging with our content about building AI systems and wanted to connect personally. Feel free to reply here or book a 30-min strategy call: https://enterprise.colaberry.ai/ai-architect - Maya, Colaberry`;

  const result = await sendSmsViaGhl(ghlContactId, smsBody);
  if (result.success) {
    console.log(`[VM-SMS] Voicemail fallback SMS sent to lead ${leadId} (${firstName})`);
  } else {
    console.error(`[VM-SMS] SMS failed for lead ${leadId}: ${result.error}`);
  }

  // Log communication
  const { logCommunication } = require('../services/communicationLogService');
  await logCommunication({
    lead_id: leadId,
    channel: 'sms',
    direction: 'outbound',
    delivery_mode: 'live',
    status: result.success ? 'sent' : 'failed',
    to_address: (lead as any).phone,
    subject: 'Voicemail fallback SMS',
    body: smsBody,
    provider: 'ghl',
    metadata: { trigger: 'hot_lead_vm_fallback' },
  }).catch(() => {});

  // Bridge to Activity timeline
  if (result.success) {
    await logActivity({
      lead_id: leadId,
      type: 'sms',
      subject: `Voicemail follow-up SMS sent to ${firstName}`,
      body: smsBody,
      metadata: {
        activity_subtype: 'voicemail_fallback_sms',
        trigger: 'hot_lead_vm_fallback',
      },
    }).catch(() => {});
  }
}
