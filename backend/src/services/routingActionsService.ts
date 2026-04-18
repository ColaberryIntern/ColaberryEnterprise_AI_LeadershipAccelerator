import { logActivity } from './activityService';
import { Campaign } from '../models';

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

const notifySales: ActionHandler = async (action, ctx) => {
  // Stub: emit an Activity row; real email/slack wiring arrives with
  // the sales notification service. Not blocking ingest.
  await logActivity({
    lead_id: ctx.lead.id,
    type: 'system',
    subject: `Sales notification triggered (${action.channel || 'email'})`,
    metadata: { subtype: 'routing_action', action_type: 'notify_sales', ...action },
  });
  return { ok: true, detail: { channel: action.channel || 'email' } };
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
