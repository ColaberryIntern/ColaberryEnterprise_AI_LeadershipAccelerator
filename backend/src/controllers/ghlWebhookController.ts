import { Request, Response } from 'express';
import { Lead, InteractionOutcome, Campaign, CampaignLead, CampaignSimulation, CampaignSimulationStep } from '../models';
import { logActivity } from '../services/activityService';
import { addContactNote } from '../services/ghlService';
import { logCommunication } from '../services/communicationLogService';
import { respondAsLead } from '../services/testing/campaignSimulator';

export async function handleGhlSmsReply(req: Request, res: Response): Promise<void> {
  try {
    const { contactId, phone, message, campaignTag } = req.body;

    if (!contactId || !message) {
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

    console.log(`[GHL Webhook] Reply processed for lead ${lead.id} (${lead.name})`);
    res.status(200).json({ received: true, matched: true, lead_id: lead.id });
  } catch (error: any) {
    console.error('[GHL Webhook] Error processing SMS reply:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}
