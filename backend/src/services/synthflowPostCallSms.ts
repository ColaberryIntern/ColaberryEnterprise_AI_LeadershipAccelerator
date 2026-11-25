/**
 * Synthflow post-call text messages: the post-call summary SMS and the hot-lead voicemail fallback
 * SMS. Moved verbatim out of controllers/synthflowWebhookController.ts (VS3.2), which was over the
 * 500-line ceiling when touched; the controller decides WHEN (first delivery only), this module HOW.
 */

import { Lead } from '../models';
import { sendSmsViaGhl, syncLeadToGhl, findContactByEmail } from './ghlService';
import { logActivity } from './activityService';
import OpenAI from 'openai';
import { getInstrumentedOpenAI } from './openaiInstrumented';
import { env } from '../config/env';
import { getTestOverrides } from './settingsService';
import { redactForLogs } from '../utils/piiRedaction';
import { resolveGhlContactId } from './ghlMirrorService';

// ─── Post-Call SMS Summary ──────────────────────────────────────────────────
// Summarizes the voice call transcript and sends an SMS with a CTA via GHL.

export async function sendPostCallSms(leadId: number, transcript: string, callId: string): Promise<void> {
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
    // Shared find-or-sync with the GHL mirror (OH1l).
    ghlContactId = await resolveGhlContactId(lead, 'voice_call');
  }

  if (!ghlContactId) {
    console.warn(`[PostCallSMS] Could not resolve GHL contact for lead ${leadId}. SMS skipped.`);
    return;
  }

  // Summarize transcript via AI
  const smsBody = await summarizeTranscriptForSms(firstName, transcript);
  console.log(`[PostCallSMS] Sending SMS to lead ${leadId} (${smsBody.length} chars): ${redactForLogs(smsBody).substring(0, 80)}...`);

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

    const client = getInstrumentedOpenAI({ workflow_id: 'voice_summary' }, { apiKey });
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
- Include this link for booking: https://enterprise.colaberry.ai/ai-architect
- Sign off as "- Maya, Colaberry"
- Do NOT use emojis
- Write as a text message, not an email`,
        },
        { role: 'user', content: `Call transcript:\n${transcript}` },
      ],
    });

    return response.choices[0]?.message?.content?.trim() ||
      `Hi ${firstName}, thanks for chatting with me! I'd love to continue our conversation. Book a strategy call here: https://enterprise.colaberry.ai/ai-architect - Maya, Colaberry`;
  } catch (err: any) {
    console.warn(`[PostCallSMS] AI summary failed: ${err.message}. Using fallback.`);
    return `Hi ${firstName}, thanks for chatting with me about the AI Leadership Accelerator! Book a strategy call to continue our conversation: https://enterprise.colaberry.ai/ai-architect - Maya, Colaberry`;
  }
}

// ─── Voicemail Fallback SMS ─────────────────────────────────────────────────
// Sends a quick SMS when Maya's hot lead call goes to voicemail.

export async function sendVoicemailFallbackSms(leadId: number): Promise<void> {
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
    console.log(`[VM-SMS] Voicemail fallback SMS sent to lead ${leadId} (${redactForLogs(firstName)})`);
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
