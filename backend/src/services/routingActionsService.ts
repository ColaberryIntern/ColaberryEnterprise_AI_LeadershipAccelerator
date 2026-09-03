import { logActivity } from './activityService';
import { Campaign, CommunicationLog } from '../models';
import { sendNewLeadAlert } from './emailService';
import { logCommunication } from './communicationLogService';

/**
 * Marks the audit rows this handler writes, so the dedup query is unambiguous.
 *
 * Carried in `metadata` rather than a dedicated column: CommunicationLog has no
 * `template` field, and inventing one would mean a migration for a marker. `provider`
 * was the other candidate and is wrong - it means the transport, not the purpose.
 */
const NEW_LEAD_ALERT_PURPOSE = 'new_lead_alert';

/**
 * A routing action execution context. `lead` is the Sequelize Lead instance,
 * `evaluationContext` carries the source/entry/raw_payload metadata assembled
 * by the ingest service.
 */
export interface ActionContext {
  lead: any;
  source_slug: string;
  entry_slug: string;
  raw_payload_id: string;
  normalized: Record<string, any>;
}

export type ActionHandler = (action: Record<string, any>, ctx: ActionContext) => Promise<{ ok: true; detail?: Record<string, any> } | { ok: false; error: string }>;

/* ── Action handlers ────────────────────────────────────────────── */

const tagLead: ActionHandler = async (action, ctx) => {
  const tag = String(action.tag || '').trim();
  if (!tag) return { ok: false, error: 'tag is required' };
  const existing = (ctx.lead as any).metadata || {};
  const tags: string[] = Array.isArray(existing.tags) ? existing.tags.slice() : [];
  if (!tags.includes(tag)) tags.push(tag);
  await ctx.lead.update({ interest_level: ctx.lead.interest_level || tag } as any);
  return { ok: true, detail: { tag } };
};

/**
 * Tell a human that a lead arrived.
 *
 * WHAT THIS REPLACED, AND WHY IT MATTERED
 *
 * This handler used to write an Activity row and `return { ok: true }` with a comment
 * saying real wiring would arrive later. It never did. So the routing engine reported a
 * successful notification for every matching lead and sent nothing — and unlike a missing
 * handler, which is an absence somebody eventually notices, a handler returning `ok` is a
 * positive signal that is false. Every dashboard, test and operator reading routing
 * outcomes would have believed it.
 *
 * It is the same failure this repo already legislates against — `not_run != pass`,
 * `waived != pass` — applied to a side effect instead of a check.
 *
 * So the contract here is: **send, or say why not.** Never both silent and green.
 */
const notifySales: ActionHandler = async (action, ctx) => {
  const channel = String(action.channel || 'email');
  if (channel !== 'email') {
    // Slack is V2 and does not exist. Claiming to have sent to it would repeat exactly
    // the defect this handler was rewritten to remove.
    return { ok: false, error: `unsupported_channel:${channel}` };
  }

  // One lead, one alert, forever — not a time window. A lead is ingested once, so a
  // second alert for the same lead is always a duplicate however long the gap. Keyed on
  // the audit log rather than an in-memory guard, so a restart cannot re-send.
  const alreadyNotified = Boolean(await CommunicationLog.findOne({
    where: { lead_id: ctx.lead.id, channel: 'email', status: 'sent', metadata: { purpose: NEW_LEAD_ALERT_PURPOSE } },
    attributes: ['id'],
  }));

  const result = await sendNewLeadAlert({
    lead: {
      id: ctx.lead.id,
      name: ctx.lead.name,
      email: ctx.lead.email,
      company: ctx.lead.company,
      phone: ctx.lead.phone,
      title: ctx.lead.title,
      message: ctx.lead.message,
      source: ctx.lead.source || ctx.source_slug,
    },
    recipients: action.to,
    convertUrl: action.convert_url,
    alreadyNotified,
  });

  // Logged whichever way it went, so "we thought we told someone" is answerable later.
  try {
    await logCommunication({
      lead_id: ctx.lead.id,
      channel: 'email',
      delivery_mode: result.sent ? 'live' : 'blocked',
      status: result.sent ? 'sent' : 'blocked',
      to_address: result.to || null,
      subject: `New lead alert: ${ctx.lead.id}`,
      provider: 'smtp',
      provider_message_id: result.messageId || null,
      metadata: { purpose: NEW_LEAD_ALERT_PURPOSE },
      error_message: result.sent ? null : result.reason || 'not_sent',
    } as any);
  } catch (logErr: any) {
    // A failed audit write must not turn a delivered alert into a reported failure.
    console.error('[Routing] new-lead alert logged failed:', logErr?.message);
  }

  await logActivity({
    lead_id: ctx.lead.id,
    type: 'system',
    subject: result.sent
      ? `Sales notified by email (lead ${ctx.lead.id})`
      : `Sales notification NOT sent: ${result.reason}`,
    metadata: { subtype: 'routing_action', action_type: 'notify_sales', sent: result.sent, reason: result.reason },
  });

  if (!result.sent) {
    // `already_notified` is the one non-send that is a correct outcome rather than a
    // problem: the human was told the first time. Reported as ok with the reason, so it
    // does not raise a failure alarm on every replay.
    if (result.reason === 'already_notified') {
      return { ok: true, detail: { channel, sent: false, reason: result.reason } };
    }
    return { ok: false, error: result.reason || 'not_sent' };
  }
  return { ok: true, detail: { channel, sent: true, to: result.to, message_id: result.messageId } };
};

const sendPdf: ActionHandler = async (action, ctx) => {
  // Stub for the PDF delivery integration. Logs the intent so we can audit
  // which leads should have received which asset. Downstream worker will
  // read `activities` to dispatch the actual email.
  if (!action.pdf_slug) return { ok: false, error: 'pdf_slug is required' };
  await logActivity({
    lead_id: ctx.lead.id,
    type: 'system',
    subject: `PDF send queued: ${action.pdf_slug}`,
    metadata: { subtype: 'routing_action', action_type: 'send_pdf', pdf_slug: action.pdf_slug },
  });
  return { ok: true, detail: { pdf_slug: action.pdf_slug } };
};

const enrollCampaign: ActionHandler = async (action, ctx) => {
  const slug = String(action.campaign_slug || '').trim();
  const campaignId = action.campaign_id ? String(action.campaign_id) : null;
  if (!slug && !campaignId) return { ok: false, error: 'campaign_slug or campaign_id required' };

  const where: Record<string, any> = {};
  if (campaignId) where.id = campaignId;
  else where.name = slug;

  const campaign = await Campaign.findOne({ where });
  if (!campaign) return { ok: false, error: `Campaign not found: ${slug || campaignId}` };

  const sequenceId = (campaign as any).sequence_id;
  if (!sequenceId) return { ok: false, error: `Campaign ${slug} has no sequence` };

  const { enrollLeadInSequence } = require('./sequenceService');
  await enrollLeadInSequence(ctx.lead.id, sequenceId, (campaign as any).id);
  return { ok: true, detail: { campaign_id: (campaign as any).id, campaign_name: (campaign as any).name } };
};

const createDeal: ActionHandler = async (action, ctx) => {
  // Stub for CRM integration. Logs a structured Activity so the ops worker
  // can pick it up when the deal sync lands.
  await logActivity({
    lead_id: ctx.lead.id,
    type: 'system',
    subject: `Deal creation queued (${action.pipeline || 'default'})`,
    metadata: { subtype: 'routing_action', action_type: 'create_deal', ...action },
  });
  return { ok: true, detail: { pipeline: action.pipeline || 'default' } };
};

const triggerBookingFlow: ActionHandler = async (action, ctx) => {
  await logActivity({
    lead_id: ctx.lead.id,
    type: 'system',
    subject: `Booking flow triggered`,
    metadata: { subtype: 'routing_action', action_type: 'trigger_booking_flow', ...action },
  });
  return { ok: true, detail: {} };
};

export const ACTION_HANDLERS: Record<string, ActionHandler> = {
  tag_lead: tagLead,
  notify_sales: notifySales,
  send_pdf: sendPdf,
  enroll_campaign: enrollCampaign,
  create_deal: createDeal,
  trigger_booking_flow: triggerBookingFlow,
};

export async function runAction(
  action: Record<string, any>,
  ctx: ActionContext
): Promise<{ type: string; status: 'ok' | 'failed' | 'unknown'; detail?: any; error?: string }> {
  const type = String(action?.type || '');
  const handler = ACTION_HANDLERS[type];

  if (!handler) {
    await logActivity({
      lead_id: ctx.lead.id,
      type: 'system',
      subject: `Unknown routing action skipped: ${type}`,
      metadata: { subtype: 'skipped_action', action },
    });
    return { type, status: 'unknown' };
  }

  try {
    const result = await handler(action, ctx);
    if (result.ok) {
      return { type, status: 'ok', detail: result.detail };
    }
    await logActivity({
      lead_id: ctx.lead.id,
      type: 'system',
      subject: `Routing action failed: ${type} — ${result.error}`,
      metadata: { subtype: 'routing_action_failed', action_type: type, error: result.error, action },
    });
    return { type, status: 'failed', error: result.error };
  } catch (err: any) {
    await logActivity({
      lead_id: ctx.lead.id,
      type: 'system',
      subject: `Routing action crashed: ${type} — ${err?.message}`,
      metadata: { subtype: 'routing_action_failed', action_type: type, error: err?.message, action },
    });
    return { type, status: 'failed', error: err?.message || 'crashed' };
  }
}
