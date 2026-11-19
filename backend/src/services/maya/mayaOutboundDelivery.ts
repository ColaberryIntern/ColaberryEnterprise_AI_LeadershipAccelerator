import type MayaOutboundApproval from '../../models/MayaOutboundApproval';
import { sendOnce } from '../email/idempotentSend';
import { sendPreRenderedEmail } from '../emailService';

/**
 * The ONE place an approved message leaves the building.
 *
 * -- IT TRANSMITS STORED BYTES AND RENDERS NOTHING --
 *
 * This is the whole reason the module exists separately from the composing tools. The site
 * chat's `send_document` used to call `emailService.sendAdmissionsDocument`, which ASSEMBLES
 * the HTML itself. If approval went through that path, the row Ali read would have been a
 * summary and the bytes that actually left would have been produced afterwards, at delivery,
 * from inputs nobody reviewed. "Approved" would have meant "approved something adjacent".
 *
 * So composing renders, the row stores what was rendered, `approveOutbound` re-hashes it, and
 * this function hands those exact bytes to the provider. There is deliberately no template, no
 * interpolation and no document lookup below this line. If you find yourself needing one here,
 * the thing you are building belongs on the compose side.
 *
 * -- WHY sendOnce STILL WRAPS IT --
 *
 * The queue already prevents a second APPROVAL: the conditional claim in `approveOutbound`
 * means only one caller moves the row out of `pending_approval`. `sendOnce` is a second,
 * independent guard at a different layer - a UNIQUE index inside Postgres arbitrating the
 * provider call itself - and it is kept because the two protect against different failures. The
 * claim protects against two clicks; the ledger protects against the same message being
 * reconstructed and sent by some future path that never saw this queue at all.
 */

/** OH1h: a row composed by mayaReplyDraftService (composed_by `maya_reply:<leadId>`, recipient_ref `lead:<id>`). */
export function isMayaReplyRow(row: Pick<MayaOutboundApproval, 'composed_by'>): boolean {
  return String(row.composed_by || '').startsWith('maya_reply:');
}

/** Maya's reply-to address on the Mandrill inbound domain (reply.colaberry.ai in production). */
export async function mayaReplyToAddress(): Promise<string> {
  // Lazy, like everything this module reaches beyond the provider: it keeps the containment graph of the
  // approve path (mayaOutboundContainment.test.ts) exactly as it was.
  const { env } = await import('../../config/env');
  return `"Maya at Colaberry" <maya@${env.mandrillInboundDomain || 'reply.colaberry.ai'}>`;
}

/**
 * OH1h: the answer is recorded on the lead - the unified communication log (so the one memory sees it) and the
 * activity timeline. A recording failure is logged and never turns a delivered message into a failed one: the
 * person HAS the email, and reporting otherwise would invite a second send.
 */
async function recordMayaReplyOnLead(row: MayaOutboundApproval, providerMessageId: string | null): Promise<void> {
  const leadId = Number(String(row.recipient_ref || '').replace(/^lead:/, ''));
  if (!Number.isInteger(leadId) || leadId <= 0) return;
  try {
    const { logCommunication } = await import('../communicationLogService');
    const { logActivity } = await import('../activityService');
    await logCommunication({
      lead_id: leadId, channel: 'email', direction: 'outbound', delivery_mode: 'live', status: 'sent',
      to_address: row.recipient_address, from_address: null, subject: row.subject ?? null, body: row.body,
      provider: 'mandrill', provider_message_id: providerMessageId,
      metadata: { maya_reply: true, outbound_approval_id: row.id, decided_by: row.decided_by ?? null },
    });
    await logActivity({
      lead_id: leadId, type: 'email_sent', subject: `Maya replied: ${row.subject ?? ''}`.slice(0, 250),
      body: row.body.slice(0, 2000), metadata: { channel: 'email', maya_reply: true, outbound_approval_id: row.id, decided_by: row.decided_by ?? null },
    });
  } catch (err: unknown) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'maya', event: 'maya_reply_record_failed', outcome: 'failure',
      error_class: err instanceof Error ? err.name : 'UnknownError', context: { id: row.id },
    }));
  }
}

export interface OutboundDelivery {
  /** The provider's id for the message, when it gives one. Never PII. */
  providerRef?: string | null;
}

/**
 * Deliver one approved row.
 *
 * Throws on failure rather than returning a flag: `approveOutbound` catches, classifies and
 * records `failed` on the row. A thrown error cannot be mistaken for a send the way a falsy
 * return value can, and the mistake this run exists to prevent is exactly "reported sent, never
 * left".
 */
export async function deliverOutboundRow(row: MayaOutboundApproval): Promise<OutboundDelivery> {
  if (row.channel !== 'email') {
    // Not a fallback and not a TODO. SMS and voice are refused by name at the capability layer,
    // so a row on either channel should be impossible to create; if one exists, something
    // bypassed the gate and the right response is to refuse loudly rather than improvise a
    // sender for a channel Ali said stays off.
    throw new Error(`UnsupportedChannel: ${row.channel} is not deliverable from this queue`);
  }

  // OH1o: an Explorer Growth email is re-checked against every guard at the moment of approval (kill
  // switch, unsubscribe, the 24-hour rule, the Open House hold, the brain cadence, the send switch).
  // Lazy, like everything else this module reaches: the approve path's import graph stays as pinned.
  const explorer = String(row.composed_by || '').startsWith('explorer_growth:');
  if (explorer) {
    const { explorerSendBlock, ExplorerSendBlockedError } = await import('../explorerGrowth/send/explorerSendGuards');
    const block = await explorerSendBlock(row);
    if (block) throw new ExplorerSendBlockedError(block);
  }

  const result = await sendOnce(
    {
      recipient: row.recipient_address,
      subject: row.subject ?? '',
      // The row id, so the ledger key and the queue row are the same business event. A replayed
      // approval of the same row lands on the same ledger key and is refused there too.
      businessEventId: `maya-outbound-${row.id}`,
      correlationId: row.correlation_id,
    },
    async () => {
      const sent = await sendPreRenderedEmail({
        to: row.recipient_address,
        subject: row.subject ?? '',
        html: row.body,
        // OH1h: Maya's answer to an email reply threads back to her (Mandrill inbound domain).
        // OH1o: an Explorer email's replies come back to Maya the same way.
        ...(isMayaReplyRow(row) || explorer ? { replyTo: await mayaReplyToAddress() } : {}),
      });
      return sent.ok
        ? { ok: true, messageId: sent.messageId }
        : { ok: false, error: sent.error, errorClass: sent.errorClass ?? 'ProviderRejected' };
    },
  );

  if (result.outcome === 'sent') {
    if (isMayaReplyRow(row)) await recordMayaReplyOnLead(row, result.messageId ?? null);
    if (explorer) await (await import('../explorerGrowth/send/explorerSendGuards')).recordExplorerSend(row, result.messageId ?? null);
    return { providerRef: result.messageId ?? null };
  }
  if (result.outcome === 'skipped') {
    // The ledger already holds a send for this exact message. Not an error: the person has it.
    // Reported as a delivery so the row settles on `sent` rather than being left for a human to
    // chase, because chasing it would mean approving it again.
    return { providerRef: null };
  }
  throw new Error(`${result.errorClass ?? 'DeliveryFailed'}: ${result.error ?? 'provider did not accept the message'}`);
}
