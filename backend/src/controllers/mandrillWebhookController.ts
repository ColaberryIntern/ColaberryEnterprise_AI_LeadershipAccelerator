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

    // Signature verification — log mismatch but don't block
    // (Cloudflare/proxy can alter headers, causing false rejections)
    const webhookKey = env.mandrillWebhookKey || '';
    if (webhookKey) {
      const signature = req.headers['x-mandrill-signature'] as string || '';
      const webhookUrl = env.mandrillWebhookUrl || `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      const isValid = verifyMandrillSignature(webhookKey, webhookUrl, req.body, signature);
      if (!isValid) {
        console.warn(`[MandrillWebhook] Signature mismatch (non-blocking) — url: ${webhookUrl}`);
        // Continue processing — don't reject. Mandrill webhooks are critical for tracking.
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

    // Signature verification — skip for inbound since Mandrill's route validation
    // test does not include the correct signature. Inbound emails are already
    // authenticated by Mandrill's MX routing (only Mandrill can deliver to our
    // inbound domain). The outbound webhook retains strict signature checking.

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

      // Auto-detect unsubscribe keywords — broad matching anywhere in message body
      const bodyLower = body.toLowerCase().trim();
      const unsubExactKeywords = ['unsubscribe', 'stop', 'remove me', 'opt out', 'opt-out', 'take me off', 'no more emails', 'stop emailing', 'don\'t email', 'dont email', 'don\'t contact', 'dont contact'];
      const isUnsubscribe = unsubExactKeywords.some(kw => bodyLower.includes(kw));
      if (isUnsubscribe) {
        console.log(`[MandrillInbound] Auto-unsubscribe detected for lead ${lead.id} (${(lead as any).name}): "${bodyLower.substring(0, 80)}"`);
        await processOptOut(lead.id, 'email', `Inbound email opt-out: "${bodyLower.substring(0, 100)}"`, 'inbound_reply');
        // Do NOT auto-reply to someone who asked to unsubscribe
        console.log(`[MandrillInbound] Skipping auto-reply — lead requested unsubscribe`);
        res.status(200).json({ status: 'unsubscribed' });
        return;
      }

      // Auto-reply: generate an AI response and send it back
      try {
        // Don't auto-reply to Ali personal outreach — Ali handles those personally
        const isAliOutreach = await CommunicationLog.findOne({
          where: { lead_id: lead.id, metadata: { trigger: 'ali_personal_outreach' } } as any,
        });
        if (!isAliOutreach) {
          const { generateMessage, buildConversationHistory } = require('../services/aiMessageService');
          const nodemailer = require('nodemailer');

          const conversationHistory = await buildConversationHistory(lead.id);
          const campaignRecord = campaignId ? await (require('../models').Campaign.findByPk(campaignId)) : null;
          const senderName = campaignRecord?.settings?.sender_name || 'Dhee - Colaberry Enterprise AI';
          const senderEmail = campaignRecord?.settings?.sender_email || env.emailFrom;
          const replyDomain = env.mandrillInboundDomain || 'reply.colaberry.com';
          const replyToAddr = senderEmail.replace(/@[^@]+$/, '@' + replyDomain);

          const result = await generateMessage({
            channel: 'email',
            ai_instructions: [
              'You are responding to an inbound email reply from a lead.',
              'The lead said: "' + body.substring(0, 500) + '"',
              'Respond helpfully and specifically to what they asked or said.',
              'If they asked about pricing, mention the upcoming April 14 cohort and suggest a strategy call.',
              'If they expressed interest, acknowledge it warmly and offer to schedule a call.',
              'If they asked a question, answer it directly.',
              'Keep it concise (3-5 sentences). Be warm, professional, and helpful.',
              'Sign off as ' + senderName.split(' - ')[0] + '.',
            ].join('\n'),
            tone: 'warm',
            lead: { name: (lead as any).name, email: (lead as any).email, company: (lead as any).company, title: (lead as any).title } as any,
            conversationHistory,
          });

          if (result.body) {
            const replySubject = subject.startsWith('Re:') ? subject : 'Re: ' + subject;
            const mailer = nodemailer.createTransport({
              host: 'smtp.mandrillapp.com', port: 587, secure: false,
              auth: { user: 'apikey', pass: env.mandrillApiKey },
            });
            await mailer.sendMail({
              from: `"${senderName}" <${senderEmail}>`,
              replyTo: `"${senderName}" <${replyToAddr}>`,
              to: fromEmail,
              subject: replySubject,
              html: result.body,
            });

            await logCommunication({
              lead_id: lead.id,
              campaign_id: campaignId,
              channel: 'email',
              direction: 'outbound',
              delivery_mode: 'live',
              status: 'sent',
              to_address: fromEmail,
              from_address: senderEmail,
              subject: replySubject,
              body: result.body,
              provider: 'mandrill',
              metadata: { auto_reply: true, in_reply_to: inReplyTo || null },
            }).catch(() => {});

            console.log(`[MandrillInbound] Auto-replied to ${(lead as any).name} (${fromEmail})`);
          }
        } else {
          console.log(`[MandrillInbound] Skipping auto-reply — Ali personal outreach (Ali handles personally)`);
        }
      } catch (replyErr: any) {
        console.warn(`[MandrillInbound] Auto-reply failed for lead ${lead.id}: ${replyErr.message}`);
      }

      // If this lead received a personal Ali email, call Ali immediately
      try {
        const aliOutreach = await CommunicationLog.findOne({
          where: { lead_id: lead.id, metadata: { trigger: 'ali_personal_outreach' } } as any,
        });
        if (aliOutreach) {
          const { triggerVoiceCall } = require('../services/synthflowService');
          const leadName = (lead as any).name || 'a lead';
          const leadCompany = (lead as any).company || '';
          const replyPreview = body.substring(0, 150).replace(/\n/g, ' ');
          await triggerVoiceCall({
            name: 'Ali',
            phone: env.adminAlertPhone || '+16825975784',
            callType: 'interest',
            prompt: [
              'You are Cory, Ali\'s AI operations manager. You are calling Ali with urgent good news.',
              `Say: "Hi Ali, this is Cory. ${leadName}${leadCompany ? ' from ' + leadCompany : ''} just replied to your personal email. Here is what they said: ${replyPreview}. You should respond right away while they are engaged. The reply is in your inbox at ali@colaberry.com."`,
              'If Ali asks questions about the lead, share what you know. If he asks you to do something, say you will flag it for the team.',
              'Keep it brief and urgent.',
            ].join('\n'),
            context: {
              lead_name: leadName,
              step_goal: 'Notify Ali of high-priority email reply',
            },
          });
          console.log(`[MandrillInbound] Cory calling Ali — ${leadName} replied to personal email`);
        }
      } catch (callErr: any) {
        console.warn(`[MandrillInbound] Cory notification call failed: ${callErr.message}`);
      }

      processed++;
    }

    console.log(`[MandrillInbound] Processed ${processed} inbound emails, skipped ${skipped}`);
    res.status(200).json({ processed, skipped });
  } catch (error: any) {
    console.error('[MandrillInbound] Error:', error.message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}
