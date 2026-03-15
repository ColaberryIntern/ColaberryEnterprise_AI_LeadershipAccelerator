import { Request, Response } from 'express';
import { Lead, InteractionOutcome, Campaign, CampaignLead, CampaignSimulation, CampaignSimulationStep, FollowUpSequence } from '../models';
import { logActivity } from '../services/activityService';
import { addContactNote, sendSmsViaGhl } from '../services/ghlService';
import { logCommunication, getLeadComms } from '../services/communicationLogService';
import { generateMessage } from '../services/aiMessageService';
import { respondAsLead } from '../services/testing/campaignSimulator';
import { checkLeadSendable } from '../services/communicationSafetyService';
import { detectStopKeyword, processOptOut } from '../services/unsubscribeEnforcementService';

export async function handleGhlSmsReply(req: Request, res: Response): Promise<void> {
  try {
    // Log full payload for debugging GHL variable mapping
    console.log(`[GHL Webhook] Raw payload:`, JSON.stringify(req.body, null, 2));

    const { contactId, phone, message, campaignTag } = req.body;

    if (!contactId || !message) {
      console.warn(`[GHL Webhook] Missing fields — contactId: "${contactId || ''}", message: "${message || ''}", keys: ${Object.keys(req.body).join(', ')}`);
      res.status(400).json({ error: 'contactId and message are required' });
      return;
    }

    console.log(`[GHL Webhook] SMS reply from ${contactId}: ${message.substring(0, 100)}`);

    // Find lead by ghl_contact_id
    const lead = await Lead.findOne({ where: { ghl_contact_id: contactId } });
    if (!lead) {
      console.warn(`[GHL Webhook] No lead found for GHL contact ${contactId}`);
      res.status(200).json({ received: true, matched: false });
      return;
    }

    // Find campaign by interest_group tag if provided
    let campaignId: string | null = null;
    if (campaignTag) {
      const campaign = await Campaign.findOne({ where: { interest_group: campaignTag } });
      if (campaign) campaignId = campaign.id;
    }

    // If no campaign from tag, try to find the most recent active campaign for this lead
    if (!campaignId) {
      const cl = await CampaignLead.findOne({
        where: { lead_id: lead.id, status: 'active' },
        order: [['enrolled_at', 'DESC']],
      });
      if (cl) campaignId = cl.campaign_id;
    }

    // STOP keyword detection — process opt-out before any auto-reply
    if (detectStopKeyword(message)) {
      console.log(`[GHL Webhook] STOP keyword detected from lead ${lead.id}`);
      await processOptOut(lead.id, 'sms', message, 'stop_keyword');
      res.status(200).json({ received: true, matched: true, lead_id: lead.id, opted_out: true });
      return;
    }

    // Log activity
    await logActivity({
      lead_id: lead.id,
      type: 'sms',
      subject: 'SMS Reply Received',
      body: message,
      metadata: {
        direction: 'inbound',
        ghl_contact_id: contactId,
        phone: phone || null,
        campaign_tag: campaignTag || null,
        campaign_id: campaignId,
      },
    });

    // Record interaction outcome
    await InteractionOutcome.create({
      lead_id: lead.id,
      campaign_id: campaignId,
      channel: 'sms',
      outcome: 'replied',
      metadata: {
        direction: 'inbound',
        ghl_contact_id: contactId,
        message_preview: message.substring(0, 200),
      },
      lead_industry: lead.industry || null,
      lead_title_category: lead.title || null,
      lead_company_size_bucket: lead.company_size || null,
      lead_source_type: lead.lead_source_type || 'warm',
    } as any);

    // Add note to GHL contact
    await addContactNote(
      contactId,
      `📩 SMS Reply Received:\n${message}`
    ).catch(() => {});

    // Log inbound SMS to unified communication log
    logCommunication({
      lead_id: lead.id,
      campaign_id: campaignId,
      channel: 'sms',
      direction: 'inbound',
      delivery_mode: 'live',
      status: 'delivered',
      to_address: null,
      from_address: phone || null,
      body: message,
      provider: 'ghl',
      metadata: { ghl_contact_id: contactId, campaign_tag: campaignTag || null },
    }).catch((err) => console.warn('[GHL Webhook] Comm log failed:', err.message));

    // Check if lead has an active simulation — resume it with the reply
    try {
      const activeSim = await CampaignSimulation.findOne({
        where: { test_lead_id: lead.id, status: 'running' },
        order: [['started_at', 'DESC']],
      });
      if (activeSim) {
        const currentStep = await CampaignSimulationStep.findOne({
          where: { simulation_id: activeSim.id, status: 'sent', channel: 'sms' },
          order: [['step_index', 'DESC']],
        });
        if (currentStep) {
          await respondAsLead(activeSim.id, 'replied', message);
          console.log(`[GHL Webhook] Resumed simulation ${activeSim.id} with SMS reply`);
        }
      }
    } catch (simErr: any) {
      console.warn(`[GHL Webhook] Failed to resume simulation:`, simErr.message);
    }

    // --- Check if lead is allowed to receive replies ---
    const leadSendable = await checkLeadSendable(lead.id);
    if (!leadSendable.sendable) {
      console.log(`[GHL Webhook] Lead ${lead.id} blocked from auto-reply: ${leadSendable.reason}`);
      res.status(200).json({ received: true, matched: true, lead_id: lead.id, blocked: true, reason: leadSendable.reason });
      return;
    }

    // --- Compose AI reply and push to GHL ---
    let smsComposed: string | null = null;
    try {
      // Build conversation history from recent SMS comms
      const recentComms = await getLeadComms(lead.id, { channel: 'sms', limit: 10 });
      const conversationHistory = recentComms
        .reverse() // oldest first
        .map((c: any) => `[${c.direction === 'outbound' ? 'Us' : 'Lead'}]: ${(c.body || '').substring(0, 200)}`)
        .join('\n');

      // Get campaign context for AI instructions
      let aiInstructions = 'Write a helpful follow-up SMS reply. Be conversational, brief, and include a clear next step.';
      let campaignContext: any = undefined;
      if (campaignId) {
        const campaign = await Campaign.findByPk(campaignId, { include: [{ model: FollowUpSequence, as: 'sequence' }] });
        if (campaign) {
          const seq = (campaign as any).sequence;
          campaignContext = { type: campaign.type, name: campaign.name };
          if (seq?.system_prompt) campaignContext.system_prompt = seq.system_prompt;
          // Use campaign-level AI instructions if available
          if (seq?.steps) {
            const smsStep = (seq.steps as any[]).find((s: any) => s.channel === 'sms');
            if (smsStep?.ai_instructions) aiInstructions = smsStep.ai_instructions;
          }
        }
      }

      const aiResult = await generateMessage({
        channel: 'sms',
        ai_instructions: `${aiInstructions}\n\nThe lead just replied with: "${message}"\nCompose a reply to their message.`,
        lead: {
          name: lead.name,
          company: lead.company,
          title: lead.title,
          industry: lead.industry,
          email: lead.email,
          phone: lead.phone,
          interest_area: lead.interest_area,
        },
        conversationHistory,
        campaignContext,
      });

      smsComposed = aiResult.body;
      console.log(`[GHL Webhook] AI composed reply (${smsComposed.length} chars): ${smsComposed.substring(0, 100)}`);

      // Push composed reply to GHL — updates cory_sms_composed which triggers GHL send workflow
      const ghlResult = await sendSmsViaGhl(contactId, smsComposed);
      if (ghlResult.success) {
        console.log(`[GHL Webhook] Reply pushed to GHL contact ${contactId}`);

        // Log outbound reply to communication log
        logCommunication({
          lead_id: lead.id,
          campaign_id: campaignId,
          channel: 'sms',
          direction: 'outbound',
          delivery_mode: 'live',
          status: 'sent',
          to_address: phone || null,
          from_address: null,
          body: smsComposed,
          provider: 'ghl',
          metadata: { ghl_contact_id: contactId, ai_generated: true, tokens_used: aiResult.tokens_used, model: aiResult.model },
        }).catch((err) => console.warn('[GHL Webhook] Outbound comm log failed:', err.message));

        await addContactNote(contactId, `🤖 AI Reply Sent:\n${smsComposed}`).catch(() => {});
      } else {
        console.error(`[GHL Webhook] Failed to push reply to GHL: ${ghlResult.error}`);
      }
    } catch (aiErr: any) {
      console.error(`[GHL Webhook] AI reply generation failed: ${aiErr.message}`);
      // Non-fatal — the inbound SMS is still logged even if we can't auto-reply
    }

    console.log(`[GHL Webhook] Reply processed for lead ${lead.id} (${lead.name})`);
    res.status(200).json({
      received: true,
      matched: true,
      lead_id: lead.id,
      sms_composed: smsComposed,
    });
  } catch (error: any) {
    console.error('[GHL Webhook] Error processing SMS reply:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}
