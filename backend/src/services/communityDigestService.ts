import { Op } from 'sequelize';
import CommunityMember from '../models/CommunityMember';
import CommunityPost from '../models/CommunityPost';
import CommunityNotification from '../models/CommunityNotification';
import CommunityDigestLog from '../models/CommunityDigestLog';
import Enrollment from '../models/Enrollment';
import { getUpcomingEvents, CalendarEvent } from './communityCalendarService';
import { sendCommunityDigestEmail } from './emailService';

function log(level: 'info' | 'warn' | 'error', event: string, ctx: Record<string, unknown>): void {
  console[level](JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'community-digest', event, ...ctx }));
}

export interface DigestContent {
  unread_notification_count: number;
  unread_dm_count: number;
  new_post_count: number;
  upcoming_events: CalendarEvent[];
}

// unread_notification_count deliberately EXCLUDES 'new_message' notifications
// (offline-DM-notification fix) — its email label describes "mentions/
// replies", which would become inaccurate if DM notifications silently
// inflated it. DMs get their own dedicated count/line instead, queried
// separately below.
async function buildDigestContent(member: CommunityMember, since: Date): Promise<DigestContent> {
  const [unreadNotifications, unreadDms, newPosts, upcomingEvents] = await Promise.all([
    CommunityNotification.count({
      where: { member_id: member.id, read_at: null, notification_type: { [Op.ne]: 'new_message' } },
    }),
    CommunityNotification.count({
      where: { member_id: member.id, read_at: null, notification_type: 'new_message' },
    }),
    CommunityPost.count({
      where: {
        cohort_id: (member as any).enrollment?.cohort_id,
        status: 'visible',
        member_id: { [Op.ne]: member.id },
        created_at: { [Op.gte]: since },
      },
    }),
    getUpcomingEvents((member as any).enrollment_id),
  ]);

  return {
    unread_notification_count: unreadNotifications,
    unread_dm_count: unreadDms,
    new_post_count: newPosts,
    upcoming_events: upcomingEvents,
  };
}

/**
 * Who is still owed a daily digest.
 *
 * ── WHAT THIS CLOSES ────────────────────────────────────────────────────────
 *
 * The recipient query had NO filter. It selected every community member with an
 * enrollment and mailed all of them, and it did not even load `status` or
 * `notifications_paused_at`, so neither could have been consulted. On
 * 2026-10-01 that was 315 people, 29 of whom should not have been mailed: 26
 * WITHDRAWN — people who had left and were still getting a daily email — one
 * suspended, and two who had explicitly asked for notifications to stop.
 *
 * A member who paused at her own request kept receiving it for three days and
 * had to write in twice. "I am still receiving the automated class emails,
 * please suspend these" is the clearest possible statement that a pause the
 * platform recorded did not reach the thing the member actually sees.
 *
 * Pausing notifications has to mean ALL of them. A pause honoured by some
 * senders and ignored by others is not a pause, it is a lottery — and the
 * member cannot tell which senders were told, so every arriving email reads as
 * the request being ignored.
 *
 * Exported and checked in the loop, not only in the query, deliberately: the
 * query filter is an optimisation that a later refactor can drop without any
 * test noticing, whereas this is the gate the send actually passes through.
 */
export function isDigestEligible(enrollment: {
  status?: string | null;
  notifications_paused_at?: Date | string | null;
} | null | undefined): boolean {
  if (!enrollment) return false;
  if (enrollment.status !== 'active') return false;
  return !enrollment.notifications_paused_at;
}

// Idempotent by construction (REQ-C6 trust control: "keyed on (date, member)
// so re-runs never double-send"): CommunityDigestLog.findOrCreate on
// (member_id, digest_date) happens BEFORE any email send — `created: false`
// means today's digest already went out, and the member is skipped entirely.
export async function runDailyDigest(now: Date = new Date()): Promise<{ sent: number; skipped: number; errors: number }> {
  const digestDate = now.toISOString().split('T')[0];
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const members = await CommunityMember.findAll({
    include: [{
      model: Enrollment,
      as: 'enrollment',
      // `status` and `notifications_paused_at` are SELECTED because the loop
      // below reads them. Omitting them is how the original query made the
      // mistake unobservable rather than merely unmade.
      attributes: ['id', 'cohort_id', 'email', 'full_name', 'status', 'notifications_paused_at'],
      required: true,
      where: { status: 'active', notifications_paused_at: null },
    }],
  });

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const member of members) {
    const enrollment = (member as any).enrollment;
    if (!isDigestEligible(enrollment)) {
      // BEFORE findOrCreate on purpose. Claiming the idempotency row for a
      // member we are not going to mail would write a log entry asserting a
      // digest for someone who should never have been in the batch.
      skipped++;
      continue;
    }

    try {
      const [logRow, created] = await CommunityDigestLog.findOrCreate({
        where: { member_id: member.id, digest_date: digestDate },
        defaults: { member_id: member.id, digest_date: digestDate },
      });

      if (!created) {
        skipped++;
        continue;
      }

      const content = await buildDigestContent(member, since);
      await sendCommunityDigestEmail({
        to: enrollment.email,
        fullName: enrollment.full_name,
        digestDate,
        unreadNotificationCount: content.unread_notification_count,
        unreadDmCount: content.unread_dm_count,
        newPostCount: content.new_post_count,
        upcomingEvents: content.upcoming_events,
      });
      await logRow.update({ sent_at: new Date() });
      sent++;
    } catch (err: any) {
      errors++;
      log('error', 'digest_send_failed', { member_id: member.id, error: err.message, error_class: err.name || 'UnknownError' });
    }
  }

  log('info', 'digest_batch_complete', { digest_date: digestDate, sent, skipped, errors });
  return { sent, skipped, errors };
}
