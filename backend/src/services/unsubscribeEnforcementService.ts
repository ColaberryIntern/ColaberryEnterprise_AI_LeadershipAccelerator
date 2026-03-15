/**
 * Unsubscribe Enforcement Service
 *
 * Handles opt-out lifecycle:
 *   1. STOP keyword detection in SMS replies
 *   2. Lead status update (→ unsubscribed)
 *   3. CampaignLead lifecycle_status update (→ dnd)
 *   4. Cancel all pending/processing ScheduledEmail actions
 *   5. Record UnsubscribeEvent for audit trail
 *   6. Sync DND status to GHL CRM
 */
import { Op } from 'sequelize';
import { Lead, CampaignLead, ScheduledEmail, UnsubscribeEvent } from '../models';
import { logActivity } from './activityService';

// ---------------------------------------------------------------------------
// STOP keyword detection
// ---------------------------------------------------------------------------

const STOP_PATTERN = /^(STOP|UNSUBSCRIBE|OPT\s*OUT|REMOVE|CANCEL|END|QUIT)\s*$/i;

/**
 * Detect if an SMS body contains an opt-out keyword.
 * Only matches standalone keywords (entire message), not embedded in sentences.
 */
export function detectStopKeyword(body: string): boolean {
  if (!body) return false;
  return STOP_PATTERN.test(body.trim());
}

// ---------------------------------------------------------------------------
// Opt-out processing
// ---------------------------------------------------------------------------

/**
 * Process a lead opt-out across the entire system.
 * This is the single entry point for all unsubscribe actions.
 *
 * @param leadId  - The lead who opted out
 * @param channel - The channel through which opt-out was received (email, sms, voice, all)
 * @param reason  - Human-readable reason or the original message
 * @param source  - Where the opt-out originated (stop_keyword, webhook, admin, system)
 */
export async function processOptOut(
  leadId: number,
  channel: string,
  reason: string,
  source: string = 'system',
): Promise<{ cancelled: number }> {
  console.log(`[Unsubscribe] Processing opt-out for lead ${leadId} via ${channel}: ${reason}`);

  // 1. Update lead status → unsubscribed
  await Lead.update(
    { status: 'unsubscribed' } as any,
    { where: { id: leadId } },
  );

  // 2. Update all CampaignLead records → lifecycle_status = 'dnd'
  await CampaignLead.update(
    { lifecycle_status: 'dnd' } as any,
    { where: { lead_id: leadId } },
  );

  // 3. Cancel all pending/processing scheduled actions for this lead
  const cancelled = await cancelPendingActions(leadId);

  // 4. Record the unsubscribe event for audit trail
  await UnsubscribeEvent.create({
    lead_id: leadId,
    channel,
    reason: reason.substring(0, 500),
    source,
  } as any);

  // 5. Log activity
  await logActivity({
    lead_id: leadId,
    type: 'system',
    subject: `Lead opted out via ${channel}`,
    body: reason.substring(0, 200),
    metadata: { channel, source, actions_cancelled: cancelled },
  }).catch((err) => console.warn('[Unsubscribe] Activity log failed:', err.message));

  // 6. Sync DND to GHL (non-blocking)
  syncOptOutToGhl(leadId).catch((err) =>
    console.warn('[Unsubscribe] GHL DND sync failed:', err.message),
  );

  console.log(`[Unsubscribe] Lead ${leadId} opted out. ${cancelled} pending actions cancelled.`);
  return { cancelled };
}

// ---------------------------------------------------------------------------
// Cancel pending actions
// ---------------------------------------------------------------------------

/**
 * Cancel all pending and processing ScheduledEmail actions for a lead.
 * Returns the count of cancelled actions.
 */
export async function cancelPendingActions(leadId: number): Promise<number> {
  const [count] = await ScheduledEmail.update(
    {
      status: 'cancelled',
      metadata: { cancelled_reason: 'lead_opted_out', cancelled_at: new Date().toISOString() },
    } as any,
    {
      where: {
        lead_id: leadId,
        status: { [Op.in]: ['pending', 'processing'] },
      },
    },
  );
  return count;
}

// ---------------------------------------------------------------------------
// GHL DND sync
// ---------------------------------------------------------------------------

/**
 * Sync the opt-out status to GoHighLevel CRM.
 * Adds a DND tag and note to the GHL contact.
 */
export async function syncOptOutToGhl(leadId: number): Promise<void> {
  try {
    const lead = await Lead.findByPk(leadId, { attributes: ['id', 'ghl_contact_id'] });
    if (!lead || !lead.ghl_contact_id) return;

    const { addContactTag, addContactNote } = require('./ghlService');
    await addContactTag(lead.ghl_contact_id, 'DND');
    await addContactNote(lead.ghl_contact_id, `🚫 Lead opted out — DND applied automatically`);
  } catch (err: any) {
    console.warn('[Unsubscribe] GHL sync error:', err.message);
  }
}
