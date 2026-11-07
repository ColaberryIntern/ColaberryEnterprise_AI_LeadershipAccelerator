/**
 * dmNotificationService - email the recipient of a direct message, at message time.
 *
 * ## Why this exists
 *
 * Kes Delele, 2 November 2026: "When interns message me on the platform, I don't receive any
 * notification until I am logged in, which delays my response. Can you set-up an email
 * notification just like the one we get when we are tagged in Basecamp?"
 *
 * A notification already existed, so this is a latency fix rather than a new capability.
 * `notifyDmRecipient` creates a `CommunityNotification` of type `new_message`, which surfaces in
 * the in-app bell only; `communityDigestService` then counts those into a digest at 08:00 UTC as a
 * number, not as news. For a manager the interns are blocked on, "tomorrow morning, as a count" is
 * not a notification. This sends one at message time.
 *
 * `community/replyNotificationService.ts` is the direct precedent and exists for exactly the same
 * reason one event earlier: "a reply created a CommunityNotification row and stopped there, so it
 * surfaced ONLY in the in-app bell." This module is its sibling, with two deliberate differences
 * noted below.
 *
 * ## Difference 1: the email carries NO message content
 *
 * The reply notifier includes a preview. This does not, and that is a decision rather than an
 * omission. A DM is private; email is not, and it gets forwarded, synced and indexed. Kes asked to
 * know *that* someone messaged him so he can go and reply, which a content-free notice satisfies
 * in full.
 *
 * It also protects the dedup. The idempotency key is `hash(recipient, subject, business_event_id)`
 * (`email/idempotencyKey.ts:23`), so a subject carrying a preview would mint a fresh key for every
 * message and the quiet period below would never suppress anything.
 *
 * C125 (Ali 2026-11-07, option C): ONE exception. When the sender is one of our AI staff (Reese,
 * Maya, Dara), the email body carries a short preview of that message, because it is text we wrote
 * and the preview is what brings a learner back. Person-to-person messages stay content-free. The
 * sender is matched by ENROLLMENT ID against the three identity seeds, never by display name (a
 * person can rename themselves "Reese"); a failed lookup means no preview. The subject is unchanged,
 * so the dedup above still holds. Within a window only the first message emails, so the preview is
 * that message, not a summary of the thread.
 *
 * ## Difference 2: the quiet period is carried by the idempotency key
 *
 * The ticket is explicit that this "must not become a second firehose: consider one email per
 * thread per quiet period rather than one per message." That needs no scheduler and no new table.
 * `email_send_ledger` already has a unique index on
 * `(lower(recipient), subject, business_event_id)` (`ensureEmailSendLedgerSchema.ts:68`), so
 * putting the window in the `business_event_id` makes the database enforce "at most one per thread
 * per window". `internshipNudge.ts:19-29` is the precedent for choosing granularity this way, and
 * explains the trap at both extremes: too coarse and a person is notified once ever, too fine and
 * "every retry would be a new event and the ledger would protect nobody".
 *
 * HONEST LIMIT: the window is a fixed wall-clock bucket, not a true rolling quiet period. Two
 * messages either side of a bucket boundary can produce two emails a minute apart. A rolling
 * window would mean reading the last send before claiming, which is the check-then-act race
 * `idempotentSend.ts` was built to avoid. A deterministic bucket that is occasionally generous
 * beats a race, and worst case is two emails per half hour instead of one per message.
 *
 * ## What it refuses to do
 *
 * - Never throws. A mail outage must never cost somebody their message; the caller treats this as
 *   fire-and-forget, the same posture as `communityService.ts:729`.
 * - Never mails an AI agent (it may quote one, C125). It is called at the END of `notifyDmRecipient`, which has already
 *   returned early for Reese and Dara, so those skips are reused rather than reimplemented.
 * - Never mails somebody who paused notifications or opted out.
 * - Never takes a recipient from a caller. The recipient is derived from the room's own
 *   membership, so the only person who can be emailed about a message is by construction the other
 *   member of that DM. There is no parameter to aim.
 */
import Enrollment from '../../models/Enrollment';
import RoomMessage from '../../models/RoomMessage';
import { guardedSendMail, resolveEmailRecipient, htmlToPlainText } from '../emailService';
import { sendOnce } from '../email/idempotentSend';
import { env } from '../../config/env';

/** One email per thread per half hour. See the honest limit in the header. */
export const DM_NOTIFY_WINDOW_MINUTES = 30;

const PORTAL_COMMUNITY_URL = 'https://enterprise.colaberry.ai/portal/community';

export type DmNotifyReason =
  | 'sent'
  | 'suppressed_window'
  | 'opted_out'
  | 'paused'
  | 'inactive'
  | 'no_recipient'
  | 'no_email'
  | 'send_failed'
  | 'error';

export interface DmNotifyResult {
  sent: boolean;
  reason: DmNotifyReason;
  idempotencyKey?: string;
}

/**
 * Opt-out lives where every other "email me when..." preference lives:
 * `enrollments.intake_data_json.preferences`. Undefined means opted in, matching how
 * `wantsReplyEmail` and portalSettingsService already resolve every boolean preference, so this
 * needs no migration and no backfill.
 */
export function wantsDmEmail(prefs: Record<string, unknown> | null | undefined): boolean {
  if (!prefs) return true;
  return prefs.dm_notifications !== false;
}

/** Which fixed window `at` falls in. Integer, so it reads cleanly in an event id. */
export function dmWindowBucket(at: Date, windowMinutes: number = DM_NOTIFY_WINDOW_MINUTES): number {
  const minutes = Math.floor(at.getTime() / 60000);
  return Math.floor(minutes / windowMinutes);
}

/**
 * The business event is "this thread notified this person in this window" -- deliberately NOT
 * "this message", because one per message is the firehose the ticket warned against.
 */
export function dmBusinessEventId(
  roomId: string,
  recipientEnrollmentId: string,
  at: Date,
  windowMinutes: number = DM_NOTIFY_WINDOW_MINUTES,
): string {
  return `dm-notify-${roomId}-${recipientEnrollmentId}-${dmWindowBucket(at, windowMinutes)}`;
}

/**
 * Stable for a given sender, which the idempotency key depends on. A DM room has exactly two
 * members, so within one room the sending PERSON is fixed.
 *
 * The name string is a separate question, and an earlier version of this comment over-claimed by
 * saying it "cannot drift mid-window". It can: `sender_name` is a snapshot stored on the message
 * row, so somebody renaming their profile between two messages inside one window would produce a
 * second subject and therefore a second key, and a second email. Bounded, rare, and harmless -
 * one extra notification - but it is not impossible, and the comment should not say it is.
 */
export function dmNotificationSubject(senderName: string): string {
  const who = (senderName || '').trim() || 'Someone';
  return `${who} sent you a message`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const DM_PREVIEW_MAX = 280;

/**
 * C125: the preview text of an AI staff message. Plain text only: a chat link `[label](path)` becomes its label, whitespace
 * collapses, and it is cut at a word boundary to DM_PREVIEW_MAX with an ellipsis. Escaped by the HTML builder, never here.
 */
export function dmPreviewOf(content: string | null | undefined): string {
  const flat = String(content || '').replace(/\[([^\]\n]{1,80})\]\([^)\s]+\)/g, '$1').replace(/\s+/g, ' ').trim();
  if (flat.length <= DM_PREVIEW_MAX) return flat;
  const cut = flat.slice(0, DM_PREVIEW_MAX);
  const atWord = cut.lastIndexOf(' ');
  return `${(atWord > DM_PREVIEW_MAX * 0.6 ? cut.slice(0, atWord) : cut).trimEnd()}...`;
}

/** C125: true only when the sender's enrollment is Reese's, Maya's or Dara's. Any lookup failure: false (no preview). */
export async function isAiStaffSender(senderEnrollmentId: string | null | undefined): Promise<boolean> {
  if (!senderEnrollmentId) return false;
  try {
    const [{ getReeseEnrollmentId }, { getMayaEnrollmentId }, { getDaraEnrollmentId }] = await Promise.all([
      import('../reese/reeseIdentitySeed'), import('../mayaIdentitySeed'), import('../curriculum/daraIdentitySeed'),
    ]);
    const ids = await Promise.all([getReeseEnrollmentId(), getMayaEnrollmentId(), getDaraEnrollmentId()]);
    return ids.includes(senderEnrollmentId);
  } catch (err: unknown) {
    const e = err as Error;
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'dm', event: 'dm_preview_sender_lookup_failed',
      outcome: 'failure', error_class: e?.name || 'Error', context: { message: String(e?.message || '').slice(0, 200) },
    }));
    return false;
  }
}

/** Content-free unless `preview` is given (C125: AI staff senders only). See "Difference 1" in the header. */
export function buildDmNotificationHtml(data: {
  recipientName: string;
  senderName: string;
  preview?: string | null;
}): string {
  const who = escapeHtml((data.senderName || '').trim() || 'Someone');
  const first = escapeHtml((data.recipientName || '').trim().split(/\s+/)[0] || 'there');
  const preview = (data.preview || '').trim();
  const body = preview
    ? `<p style="margin:0 0 22px;padding:12px 16px;border-left:3px solid #C20E1E;background:#f7fafc;color:#2d3748;font-size:15px;">${escapeHtml(preview)}</p>`
    : '<p style="margin:0 0 22px;color:#6b7280;font-size:14px;">The message itself is only on the platform, not in this email.</p>';
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f7fafc;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7fafc;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;font-family:Arial,sans-serif;">
        <tr><td style="padding:28px 32px 8px;color:#2d3748;font-size:16px;line-height:1.6;">
          <p style="margin:0 0 14px;">Hi ${first},</p>
          <p style="margin:0 0 14px;"><strong>${who}</strong> sent you a message on the Colaberry platform.</p>
          ${body}
          <p style="margin:0 0 26px;">
            <a href="${PORTAL_COMMUNITY_URL}" style="display:inline-block;background:#C20E1E;color:#ffffff;padding:11px 22px;border-radius:22px;text-decoration:none;font-weight:700;">Read and reply</a>
          </p>
        </td></tr>
        <tr><td style="padding:14px 32px 24px;border-top:1px solid #e2e8f0;color:#6b7280;font-size:12px;line-height:1.6;">
          You are getting this because someone messaged you directly. Turn these off any time in
          <a href="https://enterprise.colaberry.ai/portal/settings" style="color:#367895;">Settings &#8250; Preferences</a>.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export interface DmNotifyInput {
  roomId: string;
  /** Derived from room membership by the caller, never supplied by a request. */
  recipientEnrollmentId: string;
  /** The message that triggered this, used only to read the sender's display name. */
  messageId: string;
  /** Injected in tests so the window is deterministic. */
  at?: Date;
}

/**
 * Best-effort notify. Returns why it did or did not send, so the caller logs a real outcome
 * instead of assuming delivery.
 */
export async function notifyDmByEmail(input: DmNotifyInput): Promise<DmNotifyResult> {
  try {
    const recipient = await Enrollment.findByPk(input.recipientEnrollmentId);
    if (!recipient) return { sent: false, reason: 'no_recipient' };

    const to = recipient.email;
    if (!to) return { sent: false, reason: 'no_email' };

    // A pause must mean EVERY sender. `communityDigestService.ts:52-77` is explicit that a sender
    // which ignored this would reopen a closed incident.
    if (recipient.notifications_paused_at) return { sent: false, reason: 'paused' };
    if (recipient.status !== 'active') return { sent: false, reason: 'inactive' };

    const intake = (recipient as unknown as { intake_data_json?: unknown }).intake_data_json;
    const prefs = intake && typeof intake === 'object'
      ? (intake as Record<string, unknown>).preferences as Record<string, unknown> | undefined
      : null;
    if (!wantsDmEmail(prefs)) return { sent: false, reason: 'opted_out' };

    const message = await RoomMessage.findByPk(input.messageId);
    const senderName = message?.sender_name || 'Someone';

    const at = input.at ?? new Date();
    const subject = dmNotificationSubject(senderName);
    const businessEventId = dmBusinessEventId(input.roomId, input.recipientEnrollmentId, at);
    const preview = (await isAiStaffSender(message?.enrollment_id)) ? dmPreviewOf(message?.content) : null;
    const html = buildDmNotificationHtml({
      recipientName: recipient.full_name || '',
      senderName,
      preview,
    });

    const result = await sendOnce(
      { recipient: to, subject, businessEventId },
      async () => {
        const r = await resolveEmailRecipient(to, subject);
        const fromHeader = `"Colaberry" <${env.trainingWelcomeFromEmail}>`;
        const info = await guardedSendMail({
          from: fromHeader,
          replyTo: fromHeader,
          to: r.to,
          subject: r.subject,
          html,
          text: htmlToPlainText(html),
          headers: {
            'X-MC-Tags': 'dm-notification',
            'X-MC-Metadata': JSON.stringify({ business_event_id: businessEventId }),
          },
        });
        // `guardedSendMail` returns without a messageId when the kill switch or the dev guard
        // blocked it. That is a refusal, not a delivery, and must not be recorded as sent.
        return info.messageId
          ? { ok: true, messageId: String(info.messageId) }
          : { ok: false, errorClass: 'SendBlocked', error: 'blocked by kill switch or dev guard' };
      },
    );

    if (result.outcome === 'sent') {
      return { sent: true, reason: 'sent', idempotencyKey: result.idempotencyKey };
    }
    if (result.outcome === 'skipped') {
      // The window already notified this thread, which is the designed behaviour.
      return { sent: false, reason: 'suppressed_window', idempotencyKey: result.idempotencyKey };
    }
    return { sent: false, reason: 'send_failed', idempotencyKey: result.idempotencyKey };
  } catch (err: unknown) {
    const e = err as Error;
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'dm',
      event: 'dm_notification_email_failed',
      outcome: 'failure',
      error_class: e?.name || 'Error',
      context: {
        room_id: input.roomId,
        message_id: input.messageId,
        message: String(e?.message || '').slice(0, 200),
      },
    }));
    return { sent: false, reason: 'error' };
  }
}
