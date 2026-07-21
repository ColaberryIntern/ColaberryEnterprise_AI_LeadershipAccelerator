import CommunityNotification, { CommunityNotificationType, CommunityNotificationSourceType } from '../models/CommunityNotification';
import CommunityMember from '../models/CommunityMember';
import { getOrCreateMember } from './communityService';

export interface NotificationItem {
  id: string;
  // Mirrors the model's union — kept as the model type so widening the
  // notification kinds can't drift this DTO out of sync again.
  notification_type: CommunityNotificationType;
  source_type: CommunityNotificationSourceType;
  source_id: string;
  read: boolean;
  created_at: Date;
  actor: { id: string; display_name: string; avatar_url: string | null } | null;
}

/**
 * Emit an in-app notification. Translates enrollment ids -> member ids. Never
 * notifies you of your own action. Callers wrap this in try/catch — a
 * notification must never fail the underlying action (friend request, message).
 */
export async function createNotification(
  recipientEnrollmentId: string,
  actorEnrollmentId: string | null,
  type: CommunityNotificationType,
  sourceType: CommunityNotificationSourceType,
  sourceId: string,
): Promise<void> {
  const recipient = await getOrCreateMember(recipientEnrollmentId);
  const actor = actorEnrollmentId ? await getOrCreateMember(actorEnrollmentId) : null;
  if (actor && recipient.id === actor.id) return;
  await CommunityNotification.create({
    member_id: recipient.id,
    actor_member_id: actor?.id ?? null,
    notification_type: type,
    source_type: sourceType,
    source_id: sourceId,
  });
}

function notFoundError(message: string): Error {
  return Object.assign(new Error(message), { error_class: 'NotFoundError' });
}

function forbiddenError(message: string): Error {
  return Object.assign(new Error(message), { error_class: 'ForbiddenError' });
}

export async function listNotifications(enrollmentId: string): Promise<NotificationItem[]> {
  const member = await getOrCreateMember(enrollmentId);

  const notifications = await CommunityNotification.findAll({
    where: { member_id: member.id },
    include: [{ model: CommunityMember, as: 'actor', attributes: ['id', 'display_name', 'avatar_url'] }],
    order: [['created_at', 'DESC']],
    limit: 50,
  });

  return notifications.map((n: any) => ({
    id: n.id,
    notification_type: n.notification_type,
    source_type: n.source_type,
    source_id: n.source_id,
    read: n.read_at !== null,
    created_at: n.created_at,
    actor: n.actor ? { id: n.actor.id, display_name: n.actor.display_name, avatar_url: n.actor.avatar_url } : null,
  }));
}

// Lightweight unread count for the topbar bell badge (polled). Cheaper than
// fetching the whole list just to count.
export async function unreadNotificationCount(enrollmentId: string): Promise<number> {
  const member = await getOrCreateMember(enrollmentId);
  return CommunityNotification.count({ where: { member_id: member.id, read_at: null } });
}

// Mark every unread notification read (the bell's "mark all read"). Idempotent.
export async function markAllNotificationsRead(enrollmentId: string): Promise<{ updated: number }> {
  const member = await getOrCreateMember(enrollmentId);
  const [updated] = await CommunityNotification.update(
    { read_at: new Date() },
    { where: { member_id: member.id, read_at: null } }
  );
  return { updated };
}

// Idempotent — marking an already-read notification read again is a no-op.
export async function markNotificationRead(enrollmentId: string, notificationId: string): Promise<NotificationItem> {
  const member = await getOrCreateMember(enrollmentId);

  const notification = await CommunityNotification.findByPk(notificationId, {
    include: [{ model: CommunityMember, as: 'actor', attributes: ['id', 'display_name', 'avatar_url'] }],
  });
  if (!notification) {
    throw notFoundError('Notification not found');
  }
  if ((notification as any).member_id !== member.id) {
    throw forbiddenError('This notification belongs to a different member');
  }

  if (notification.read_at === null) {
    await notification.update({ read_at: new Date() });
  }

  const actor = (notification as any).actor;
  return {
    id: notification.id,
    notification_type: notification.notification_type,
    source_type: notification.source_type,
    source_id: notification.source_id,
    read: true,
    created_at: notification.created_at,
    actor: actor ? { id: actor.id, display_name: actor.display_name, avatar_url: actor.avatar_url } : null,
  };
}
