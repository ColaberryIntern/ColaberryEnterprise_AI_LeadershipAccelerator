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
import { revokeConsent } from './consentService';
import { redactForLogs } from '../utils/piiRedaction';

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
// Inbound email unsubscribe-intent detection (Inbox COS scanner)
// ---------------------------------------------------------------------------

// Imperative opt-out phrases. These express clear intent even mid-sentence, so
// they match at any length (e.g. "please take me off your list, thanks").
const INTENT_PHRASES = [
  'remove me', 'take me off', 'no more emails', 'stop emailing', 'stop sending',
  'opt out', 'opt-out', "don't email", 'dont email', "don't contact", 'dont contact',
  'unsubscribe me', 'please unsubscribe',
];

// A genuine one-line unsubscribe reply is short. Above this (quote-stripped) size
// we require an explicit INTENT_PHRASE — the bare word "unsubscribe" in a long body
// is almost always a quoted/forwarded campaign footer, not a request.
const SHORT_REPLY_MAX_CHARS = 240;

// Senders we never auto-unsubscribe from an inbox sweep: our own staff. They
// discuss and forward campaign content (whose footers contain "unsubscribe"),
// which previously opted them out of their own campaigns. A real staff opt-out
// is a manual, rare case.
const INTERNAL_SENDER_DOMAINS = ['colaberry.com'];

/**
 * Return only the sender's OWN text from an email body — everything above the
 * first quoted-history / forwarded-message marker. This is what stops a reply
 * or forward that merely quotes a footer containing "unsubscribe" from tripping
 * an opt-out. Lowercased + trimmed for matching.
 */
export function topReplyText(raw: string | null | undefined): string {
  const lines = (raw || '').split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) break;                                   // ">" quoted line
    if (/^\s*On\b.*\bwrote:\s*$/i.test(line)) break;                 // "On <date>, X wrote:"
    if (/^\s*-{2,}\s*(original message|forwarded message)\b/i.test(line)) break;
    if (/^\s*_{5,}\s*$/.test(line)) break;                           // Outlook underscore divider
    if (/^\s*(from|sent|to|subject|date):\s/i.test(line) && kept.length > 0) break; // header block
    kept.push(line);
  }
  return kept.join('\n').toLowerCase().trim();
}

/**
 * Decide whether an inbound email reply is a genuine unsubscribe request.
 *
 * Tightened 2026-07-15 to stop false positives where a reply/forward merely
 * MENTIONS or quotes "unsubscribe" (internal staff discussing a campaign,
 * quoted footers, forwarded newsletters). Three defenses:
 *   1. Skip internal (@colaberry.com) senders entirely.
 *   2. Match only the sender's own text, above any quoted history (topReplyText).
 *   3. The bare word "unsubscribe" counts only in a SHORT message; long bodies
 *      need an explicit imperative phrase, so a forwarded campaign footer is ignored.
 *
 * Compliance: this only NARROWS matching for false positives — a genuine request
 * (short reply, or any imperative phrase, or the native-client "unsubscribe"
 * subject) is still caught, so no real opt-out is missed.
 */
export function detectInboxUnsubscribeIntent(
  subject: string | null | undefined,
  bodyText: string | null | undefined,
  fromAddress?: string | null,
): { matched: boolean; via: 'subject' | 'body' | null } {
  // 1) Never auto-unsubscribe our own staff from an inbox sweep.
  const domain = (fromAddress || '').toLowerCase().split('@')[1] || '';
  if (INTERNAL_SENDER_DOMAINS.includes(domain)) {
    return { matched: false, via: null };
  }

  // 2) Subject-based: native mail-client unsubscribe (Apple/Gmail List-Unsubscribe
  //    mailto → subject "unsubscribe") or an explicit "unsubscribe" subject.
  if (/^(re:\s*)?unsubscribe\b/i.test(subject || '')) {
    return { matched: true, via: 'subject' };
  }

  // 3) Body-based — only the sender's own text, above any quoted history.
  const top = topReplyText(bodyText);
  if (INTENT_PHRASES.some((kw) => top.includes(kw))) {
    return { matched: true, via: 'body' };
  }
  if (top.length <= SHORT_REPLY_MAX_CHARS && top.includes('unsubscribe')) {
    return { matched: true, via: 'body' };
  }
  return { matched: false, via: null };
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
  console.log(`[Unsubscribe] Processing opt-out for lead ${leadId} via ${channel}: ${redactForLogs(reason)}`);

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

  // 4b. Mirror the opt-out into the consent ledger as `revoked` (TBI P0-3, Phase 2 capture).
  //     Belt-and-suspenders with suppression; the consent gate then blocks on this record too.
  //     Swallow-safe — consent capture must never break the unsubscribe path. 'all'/unknown → all channels.
  const revokeChannel = (['email', 'sms', 'voice'] as const).find((c) => c === channel);
  await revokeConsent({
    subjectType: 'lead',
    subjectId: String(leadId),
    channel: revokeChannel,
    source: `unsubscribe:${source}`,
    evidence: { reason: reason.substring(0, 200), channel_requested: channel },
  }).catch((err) => console.warn('[Unsubscribe] consent revoke failed:', err.message));

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
