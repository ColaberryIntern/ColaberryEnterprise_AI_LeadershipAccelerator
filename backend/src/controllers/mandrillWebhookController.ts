import { Request, Response } from 'express';
import crypto from 'crypto';
import { recordWebhookOutcome } from '../services/interactionService';
import { env } from '../config/env';
import type { OutcomeType } from '../models/InteractionOutcome';
import { Lead, InteractionOutcome, CampaignLead, CampaignSimulation, CampaignSimulationStep, CommunicationLog } from '../models';
import { logActivity } from '../services/activityService';
import { logCommunication } from '../services/communicationLogService';
import { respondAsLead } from '../services/testing/campaignSimulator';
import { processOptOut } from '../services/unsubscribeEnforcementService';
import ScheduledEmail from '../models/ScheduledEmail';

/** Map Mandrill event types to our outcome types */
function mapMandrillEvent(eventType: string): OutcomeType | null {
  switch (eventType) {
    case 'send':
      return null; // Already tracked at send time
    case 'open':
      return 'opened';
    case 'click':
      return 'clicked';
    case 'hard_bounce':
    case 'soft_bounce':
      return 'bounced';
    case 'spam':
    case 'unsub':
      return 'unsubscribed';
    case 'reject':
      return 'bounced';
    default:
      return null;
  }
}

/** Verify Mandrill webhook signature */
function verifyMandrillSignature(
  webhookKey: string,
  url: string,
  params: Record<string, string>,
  expectedSignature: string,
): boolean {
  if (!webhookKey) return true; // Skip verification if no key configured

  // Mandrill signs: webhook_url + sorted keys + values
  let signedData = url;
  const keys = Object.keys(params).sort();
  for (const key of keys) {
    signedData += key + params[key];
  }

  const hash = crypto
    .createHmac('sha1', webhookKey)
    .update(signedData)
    .digest('base64');

  return hash === expectedSignature;
}

/** Handle Mandrill webhook events (open, click, bounce, unsub) */
export async function handleMandrillWebhook(req: Request, res: Response): Promise<void> {
  try {
    // Mandrill sends events as form-encoded: mandrill_events=<JSON array>
    const rawEvents = req.body?.mandrill_events;
    if (!rawEvents) {
      // Mandrill sends a HEAD request to verify the webhook URL
      res.status(200).send('OK');
      return;
    }

    let events: any[];
    try {
      events = JSON.parse(rawEvents);
    } catch {
      console.error('[MandrillWebhook] Failed to parse mandrill_events');
      res.status(400).json({ error: 'Invalid event data' });
      return;
    }

    // Optional: verify signature
    const webhookKey = env.mandrillWebhookKey || '';
    if (webhookKey) {
      const signature = req.headers['x-mandrill-signature'] as string || '';
      const webhookUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      const isValid = verifyMandrillSignature(webhookKey, webhookUrl, req.body, signature);
      if (!isValid) {
        console.warn('[MandrillWebhook] Invalid signature');
        res.status(403).json({ error: 'Invalid signature' });
        return;
      }
    }

    let processed = 0;
    let skipped = 0;

    for (const event of events) {
      const outcome = mapMandrillEvent(event.event);
      if (!outcome) {
        skipped++;
        continue;
      }

      // Extract scheduled_email_id from metadata (we embed it via X-MC-Metadata header)
      const metadata = event.msg?.metadata || {};
      const scheduledEmailId = metadata.scheduled_email_id;

      if (!scheduledEmailId) {
        // Can't link back to our system without the tracking ID
        skipped++;
        continue;
      }

      await recordWebhookOutcome(scheduledEmailId, outcome, {
        mandrill_event: event.event,
        mandrill_ts: event.ts,
        ip: event.ip,
        user_agent: event.user_agent,
        url: event.url, // For click events
      });

      // Process opt-out for unsub/spam events
      if (outcome === 'unsubscribed') {
        try {
          const scheduledEmail = await ScheduledEmail.findByPk(scheduledEmailId, { attributes: ['id', 'lead_id', 'campaign_id'] });
          if (scheduledEmail) {
            const source = event.event === 'spam' ? 'mandrill_spam' : 'mandrill_unsub';
            await processOptOut(scheduledEmail.lead_id, 'email', `Mandrill ${event.event} event`, source);
            console.log(`[MandrillWebhook] Processed opt-out for lead ${scheduledEmail.lead_id} via ${source}`);
          }
        } catch (optOutErr: any) {
          console.warn(`[MandrillWebhook] Opt-out processing failed:`, optOutErr.message);
        }
      }

      processed++;
    }

    console.log(`[MandrillWebhook] Processed ${processed} events, skipped ${skipped}`);
    res.status(200).json({ processed, skipped });
  } catch (error: any) {
    console.error('[MandrillWebhook] Error:', error.message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

/** Handle Mandrill HEAD request for URL verification */
export async function handleMandrillWebhookHead(_req: Request, res: Response): Promise<void> {
  res.status(200).send('OK');
}

/** Handle Mandrill inbound email replies */
export async function handleMandrillInbound(req: Request, res: Response): Promise<void> {
  try {
    const rawEvents = req.body?.mandrill_events;
    if (!rawEvents) {
      res.status(200).send('OK');
      return;
    }

    let events: any[];
    try {
      events = JSON.parse(rawEvents);
    } catch {
      console.error('[MandrillInbound] Failed to parse mandrill_events');
      res.status(400).json({ error: 'Invalid event data' });
      return;
    }

    // Optional signature verification
    const webhookKey = env.mandrillWebhookKey || '';
    if (webhookKey) {
      const signature = req.headers['x-mandrill-signature'] as string || '';
      const webhookUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      const isValid = verifyMandrillSignature(webhookKey, webhookUrl, req.body, signature);
      if (!isValid) {
        console.warn('[MandrillInbound] Invalid signature');
        res.status(403).json({ error: 'Invalid signature' });
        return;
      }
    }

    let processed = 0;
    let skipped = 0;

    for (const event of events) {
      if (event.event !== 'inbound') {
        skipped++;
        continue;
      }

      const msg = event.msg;
      if (!msg) { skipped++; continue; }

      const fromEmail = msg.from_email;
      const subject = msg.subject || '(no subject)';
      const body = msg.text || msg.html || '';

      if (!fromEmail) { skipped++; continue; }

      console.log(`[MandrillInbound] Email reply from ${fromEmail}: ${subject}`);

      // Find lead by email
      const lead = await Lead.findOne({ where: { email: fromEmail } });
      if (!lead) {
        console.warn(`[MandrillInbound] No lead found for email ${fromEmail}`);
        skipped++;
        continue;
      }

      // Try to link to campaign via In-Reply-To header → CommunicationLog
      let campaignId: string | null = null;
      const inReplyTo = msg.headers?.['In-Reply-To'] || msg.headers?.['in-reply-to'];
      if (inReplyTo) {
        const commLog = await CommunicationLog.findOne({
          where: { provider_message_id: inReplyTo.replace(/[<>]/g, ''), channel: 'email' },
        });
        if (commLog) {
          campaignId = (commLog as any).campaign_id;
        }
      }

      // Fallback: most recent active campaign for this lead
      if (!campaignId) {
        const cl = await CampaignLead.findOne({
          where: { lead_id: lead.id, status: 'active' },
          order: [['enrolled_at', 'DESC']],
        });
        if (cl) campaignId = cl.campaign_id;
      }

      // Log activity (use 'system' type to avoid ENUM migration)
      await logActivity({
        lead_id: lead.id,
        type: 'system',
        subject: 'Email Reply Received',
        body: body.substring(0, 500),
        metadata: {
          channel: 'email',
          direction: 'inbound',
          from_email: fromEmail,
          original_subject: subject,
          campaign_id: campaignId,
        },
      });

      // Record interaction outcome
      await InteractionOutcome.create({
        lead_id: lead.id,
        campaign_id: campaignId,
        channel: 'email',
        outcome: 'replied',
        metadata: {
          direction: 'inbound',
          from_email: fromEmail,
          subject,
          body_preview: body.substring(0, 200),
        },
        lead_industry: lead.industry || null,
        lead_title_category: lead.title || null,
        lead_company_size_bucket: lead.company_size || null,
        lead_source_type: lead.lead_source_type || 'warm',
      } as any);

      // Log to unified communication log
      logCommunication({
        lead_id: lead.id,
        campaign_id: campaignId,
        channel: 'email',
        direction: 'inbound',
        delivery_mode: 'live',
        status: 'delivered',
        to_address: null,
        from_address: fromEmail,
        subject,
        body,
        provider: 'mandrill',
        metadata: { in_reply_to: inReplyTo || null },
      }).catch((err) => console.warn('[MandrillInbound] Comm log failed:', err.message));

      // Check if lead has an active simulation — resume it with the reply
      try {
        const activeSim = await CampaignSimulation.findOne({
          where: { test_lead_id: lead.id, status: 'running' },
          order: [['started_at', 'DESC']],
        });
        if (activeSim) {
          const currentStep = await CampaignSimulationStep.findOne({
            where: { simulation_id: activeSim.id, status: 'sent', channel: 'email' },
            order: [['step_index', 'DESC']],
          });
          if (currentStep) {
            await respondAsLead(activeSim.id, 'replied', body.substring(0, 500));
            console.log(`[MandrillInbound] Resumed simulation ${activeSim.id} with email reply`);
          }
        }
      } catch (simErr: any) {
        console.warn(`[MandrillInbound] Failed to resume simulation:`, simErr.message);
      }

      console.log(`[MandrillInbound] Reply processed for lead ${lead.id} (${lead.name})`);
      processed++;
    }

    console.log(`[MandrillInbound] Processed ${processed} inbound emails, skipped ${skipped}`);
    res.status(200).json({ processed, skipped });
  } catch (error: any) {
    console.error('[MandrillInbound] Error:', error.message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}
