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
  new_post_count: number;
  upcoming_events: CalendarEvent[];
}

async function buildDigestContent(member: CommunityMember, since: Date): Promise<DigestContent> {
  const [unreadNotifications, newPosts, upcomingEvents] = await Promise.all([
    CommunityNotification.count({ where: { member_id: member.id, read_at: null } }),
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
    new_post_count: newPosts,
    upcoming_events: upcomingEvents,
  };
}

// Idempotent by construction (REQ-C6 trust control: "keyed on (date, member)
// so re-runs never double-send"): CommunityDigestLog.findOrCreate on
// (member_id, digest_date) happens BEFORE any email send — `created: false`
// means today's digest already went out, and the member is skipped entirely.
export async function runDailyDigest(now: Date = new Date()): Promise<{ sent: number; skipped: number; errors: number }> {
  const digestDate = now.toISOString().split('T')[0];
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const members = await CommunityMember.findAll({
    include: [{ model: Enrollment, as: 'enrollment', attributes: ['id', 'cohort_id', 'email', 'full_name'] }],
  });

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const member of members) {
    const enrollment = (member as any).enrollment;
    if (!enrollment) {
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
