import { Request, Response } from 'express';
import crypto from 'crypto';
import { recordWebhookOutcome } from '../services/interactionService';
import { env } from '../config/env';
import type { OutcomeType } from '../models/InteractionOutcome';

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
