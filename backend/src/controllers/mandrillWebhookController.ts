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
import { handleTicketReplyEmail } from '../services/workforce/ticketReplyService';
import { redactForLogs } from '../utils/piiRedaction';

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

  // Constant-time comparison — a plain === leaks timing information proportional to how
  // many leading bytes match, a real (if narrow) side channel for a signature check.
  const hashBuf = Buffer.from(hash);
  const expectedBuf = Buffer.from(expectedSignature || '');
  if (hashBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(hashBuf, expectedBuf);
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

    // Signature verification — REJECT on mismatch when a webhook key is configured.
    // (Inbound Mandrill events can trigger AI voice calls / automation, so a forged
    // payload is an action-injection risk — accepting unsigned events is unsafe.)
    // To avoid false rejections behind a proxy that rewrites Host/URL, set the exact
    // public URL via MANDRILL_WEBHOOK_URL so the signed-data reconstruction is stable.
    const webhookKey = env.mandrillWebhookKey || '';
    if (webhookKey) {
      const signature = req.headers['x-mandrill-signature'] as string || '';
      const webhookUrl = env.mandrillWebhookUrl || `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      const isValid = verifyMandrillSignature(webhookKey, webhookUrl, req.body, signature);
      if (!isValid) {
        console.warn(
          `[MandrillWebhook] Signature mismatch — rejecting. url: ${webhookUrl}. ` +
          `If this is a false rejection behind a proxy, set MANDRILL_WEBHOOK_URL to the exact public webhook URL.`
        );
        res.status(401).json({ error: 'Invalid webhook signature' });
        return;
      }
    }

    let processed = 0;
    let skipped = 0;

    // Log event type distribution for debugging
    const eventTypeCounts: Record<string, number> = {};
    for (const e of events) { eventTypeCounts[e.event] = (eventTypeCounts[e.event] || 0) + 1; }
    console.log(`[MandrillWebhook] Event types received: ${JSON.stringify(eventTypeCounts)}`);

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
        // Log what we're skipping for debugging
        if (event.event === 'open' || event.event === 'click') {
          console.log(`[MandrillWebhook] Skipping ${event.event} for ${redactForLogs(event.msg?.email) || 'unknown'} — no scheduled_email_id in metadata: ${JSON.stringify(event.msg?.metadata || {})}`);
        }
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

      // D2 FIX — suppress a hard-bounced address globally.
      //
      // Before this, a hard bounce wrote an InteractionOutcome and nothing else.
      // checkLeadSendable (communicationSafetyService.ts:106) blocks on
      // Lead.status IN ('unsubscribed','dnd','bounced'), but NOTHING in the
      // codebase ever wrote 'bounced' — so that branch was unreachable and a
      // hard-bounced address stayed globally sendable. campaignLifecycleService
      // exits the lead from the campaign it bounced on, which meant re-enrolling
      // them anywhere else resumed mail to a dead address. That is a real
      // deliverability and reputation problem, not a tidiness one.
      //
      // hard_bounce and reject only. A reject means the address is on the
      // provider's suppression list, which is at least as permanent as a hard
      // bounce. soft_bounce is deliberately excluded — it is transient (full
      // mailbox, temporary server issue) and suppressing on it would silently
      // discard recoverable recipients.
      if (event.event === 'hard_bounce' || event.event === 'reject') {
        try {
          const scheduledEmail = await ScheduledEmail.findByPk(scheduledEmailId, {
            attributes: ['id', 'lead_id'],
          });
          if (scheduledEmail) {
            const lead = await Lead.findByPk(scheduledEmail.lead_id, {
              attributes: ['id', 'status'],
            });
            // Never downgrade a stronger, user-expressed suppression. An
            // unsubscribe or DND is a decision the person made; 'bounced' is a
            // mechanical fact, and overwriting the former with the latter would
            // lose the reason we must never contact them again.
            if (lead && lead.status !== 'unsubscribed' && lead.status !== 'dnd') {
              await Lead.update({ status: 'bounced' }, { where: { id: lead.id } });
              console.log(
                `[MandrillWebhook] Lead ${lead.id} marked bounced via ${event.event}`,
              );
            }
          }
        } catch (bounceErr: any) {
          // Never fail the webhook over this — Mandrill retries on non-200 and a
          // retry storm is worse than a delayed suppression.
          console.warn('[MandrillWebhook] Bounce suppression failed:', bounceErr.message);
        }
      }

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

    // Signature verification — REJECT the whole request on mismatch when a webhook key is
    // configured, matching the outbound handler's convention (handleMandrillWebhook above).
    // Previously this only rejected the ticket-<id>@ reply path; the Lead-reply path below —
    // which can trigger an AI-generated auto-reply send, an auto-unsubscribe, and a voice
    // call to Ali — accepted unverified inbound events. The Mandrill URL-verification
    // HEAD/ping (no `mandrill_events` body) already short-circuits above this point, so
    // promoting to a full-request reject doesn't reintroduce the false-positive that
    // originally motivated scoping enforcement down to just the ticket path.
    // NOTE: env.mandrillWebhookUrl is hardcoded in production to the OUTBOUND tracking-events
    // URL (.../api/webhook/mandrill) — reusing it here would make every real inbound
    // signature fail, since Mandrill signs against the exact URL it posted to. Derive this
    // route's own URL instead (append '/inbound' to the outbound base when the override is
    // set; otherwise reconstruct per-request exactly like the outbound handler's fallback).
    const webhookKey = env.mandrillWebhookKey || '';
    if (webhookKey) {
      const signature = req.headers['x-mandrill-signature'] as string || '';
      const inboundWebhookUrl = env.mandrillWebhookUrl
        ? `${env.mandrillWebhookUrl}/inbound`
        : `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      const isValid = verifyMandrillSignature(webhookKey, inboundWebhookUrl, req.body, signature);
      if (!isValid) {
        console.warn(
          `[MandrillInbound] Signature mismatch — rejecting. url: ${inboundWebhookUrl}. ` +
          `If this is a false rejection behind a proxy, verify MANDRILL_WEBHOOK_URL matches the exact public inbound URL.`
        );
        res.status(401).json({ error: 'Invalid webhook signature' });
        return;
      }
    } else {
      // No webhook key configured — auth degrades to sender-email (+ reply-token on the
      // ticket path) only. Loud on purpose: production is confirmed to have the key set, so
      // this firing there means the config regressed, not routine dev behavior.
      console.warn('[MandrillInbound] MANDRILL_WEBHOOK_KEY not configured — inbound signature verification is disabled');
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

      // AI Workforce ticket-approval replies: routed via a ticket-<id>-<token>@ subaddress
      // on the Mandrill-inbound domain, so the ticket ID is read directly off the recipient
      // address — no thread/Message-ID correlation needed, and no dependency on the Lead
      // pipeline below at all. The token is a per-ticket random value only ever transmitted
      // in the actual approval email (never rendered in the dashboard UI) — required in
      // addition to the sender allowlist so knowing a ticket's UUID alone (visible to any
      // admin who can browse the Tickets board, a broader set than who may approve) isn't
      // enough to construct a working reply address.
      const toLocalPart = String(msg.email || '').split('@')[0] || '';
      const ticketMatch = toLocalPart.match(/^ticket-([0-9a-f-]{36})-([0-9a-f]{8})$/i);
      if (ticketMatch) {
        try {
          const result = await handleTicketReplyEmail({ ticketId: ticketMatch[1], replyToken: ticketMatch[2], fromEmail, rawBody: body });
          console.log(`[MandrillInbound] Ticket reply for ${ticketMatch[1]}: ${result.reason}`);
        } catch (err: any) {
          console.error(`[MandrillInbound] Ticket reply handling failed for ${ticketMatch[1]}:`, err.message);
        }
        processed++;
        continue;
      }

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

      console.log(`[MandrillInbound] Reply processed for lead ${lead.id} (${redactForLogs(lead.name)})`);

      // Auto-detect unsubscribe keywords — broad matching anywhere in message body
      const bodyLower = body.toLowerCase().trim();
      const unsubExactKeywords = ['unsubscribe', 'stop', 'remove me', 'opt out', 'opt-out', 'take me off', 'no more emails', 'stop emailing', 'don\'t email', 'dont email', 'don\'t contact', 'dont contact'];
      const isUnsubscribe = unsubExactKeywords.some(kw => bodyLower.includes(kw));
      if (isUnsubscribe) {
        console.log(`[MandrillInbound] Auto-unsubscribe detected for lead ${lead.id} (${redactForLogs((lead as any).name)}): "${redactForLogs(bodyLower).substring(0, 80)}"`);
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

            console.log(`[MandrillInbound] Auto-replied to ${redactForLogs((lead as any).name)} (${redactForLogs(fromEmail)})`);
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
