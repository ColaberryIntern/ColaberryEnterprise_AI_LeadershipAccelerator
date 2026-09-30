/**
 * replyNotificationService — tell a student, by email, that someone answered them.
 *
 * Why: a reply created a CommunityNotification row and stopped there, so it
 * surfaced ONLY in the in-app bell. A student who was not already sitting in
 * the portal never learned anyone had responded — which is a large part of why,
 * across 74 visible community posts, exactly one had ever received a reply.
 *
 * Design rules this obeys:
 *  - IDEMPOTENT. One email per comment, keyed on the comment id, so a retry, a
 *    double-submit, or a replayed job cannot mail the same person twice.
 *  - FAIL-SOFT. Never throws into createComment. A mail outage must not stop a
 *    student's reply from posting.
 *  - OPT-OUT respected before anything is composed, and stated in the mail.
 *  - Self-replies never notify (createComment already skips those).
 */
import CommunityMember from '../../models/CommunityMember';
import Enrollment from '../../models/Enrollment';
import { sendCommunityReplyEmail } from '../emailService';

/**
 * The opt-out lives in the SAME place as every other "email me when…" setting:
 * `enrollments.intake_data_json.preferences.reply_notifications`, surfaced in
 * Settings ▸ Preferences. A dedicated column on community_members was the first
 * attempt and was wrong — it would have been a second, disconnected preferences
 * store for students to hunt through.
 *
 * Undefined means opted in, matching how portalSettingsService already resolves
 * every boolean preference, so this needs no migration and no backfill.
 */
export function wantsReplyEmail(prefs: Record<string, unknown> | null | undefined): boolean {
  if (!prefs) return true;
  return prefs.reply_notifications !== false;
}

/** Trim a reply to something that reads as a preview in an inbox. */
export function previewOf(body: string | null | undefined, max = 220): string {
  const flat = (body || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export interface ReplyEmailInput {
  /** The comment that triggered this. Doubles as the idempotency key. */
  commentId: string;
  recipientMemberId: string;
  actorDisplayName: string;
  commentBody: string;
  postId: string;
  /** "replied to your post" vs "replied to your comment". */
  onOwnPost: boolean;
}

/**
 * Best-effort notify. Returns why it did or did not send, so the caller can log
 * a real outcome instead of assuming delivery.
 */
export async function notifyReplyByEmail(
  input: ReplyEmailInput,
): Promise<{ sent: boolean; reason: 'sent' | 'opted_out' | 'no_recipient' | 'no_email' | 'error' }> {
  try {
    const member = await CommunityMember.findByPk(input.recipientMemberId);
    if (!member) return { sent: false, reason: 'no_recipient' };

    const enrollment = await Enrollment.findByPk(member.enrollment_id);
    const to = enrollment?.email;
    if (!to) return { sent: false, reason: 'no_email' };

    const intake = (enrollment as any)?.intake_data_json;
    const prefs = intake && typeof intake === 'object' ? intake.preferences : null;
    if (!wantsReplyEmail(prefs)) return { sent: false, reason: 'opted_out' };

    await sendCommunityReplyEmail({
      to,
      recipientName: member.display_name,
      actorName: input.actorDisplayName,
      preview: previewOf(input.commentBody),
      postId: input.postId,
      onOwnPost: input.onOwnPost,
      // The comment id is the business event: Mandrill dedup plus our own log
      // key both hang off it, so this comment can only ever mail once.
      eventId: input.commentId,
    });
    return { sent: true, reason: 'sent' };
  } catch (err: any) {
    // Never let a mail failure break the reply that triggered it.
    console.warn(JSON.stringify({
      level: 'warn', service: 'community', event: 'reply_email_failed',
      error_class: err?.name || 'Error', comment_id: input.commentId,
      context: { message: String(err?.message || '').slice(0, 200) },
    }));
    return { sent: false, reason: 'error' };
  }
}
