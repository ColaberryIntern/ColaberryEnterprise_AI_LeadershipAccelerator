import { Op } from 'sequelize';
import Cohort from '../../../models/Cohort';
import CommunityMember from '../../../models/CommunityMember';
import CommunityNotification from '../../../models/CommunityNotification';
import Enrollment from '../../../models/Enrollment';
import { createNotification } from '../../communityNotificationService';
import { ensureTeamIdentity } from './teamIdentity';
import { ConnectorPermanentError, type Connector, type ConnectorDelivery, type ConnectorResult } from './types';

/**
 * In-app notification connector (CH7.1). Writes one 'announcement' notification per member of the
 * audience through communityNotificationService.createNotification, with Colaberry Team as the actor.
 * source_id is the message id, so the bell can show the message's own words (listNotifications).
 *
 * Audience (destination target_id):
 *  - 'all_members': everyone in the program, meaning active, portal-enabled enrollments in an OPEN
 *    cohort (Explorer included);
 *  - a cohort id: that cohort's active, portal-enabled enrollments.
 * Only people who already have a community profile are notified: createNotification would otherwise
 * create profiles for hundreds of people who have never opened the community (they still see the
 * feed post). Agent and team identities have no cohort and portal access off, so they never match.
 *
 * Retry safety and overlap: anyone who already has this message's announcement is skipped, so a
 * retry writes only the ones a crash missed, and someone in two audiences of one message (all
 * members and their cohort) is notified once.
 */
export const ALL_MEMBERS = 'all_members';

export async function audienceEnrollmentIds(targetId: string): Promise<string[]> {
  let cohortIds: string[];
  if (targetId === ALL_MEMBERS) {
    cohortIds = (await Cohort.findAll({ where: { status: 'open' }, attributes: ['id'] })).map((c) => c.id);
  } else {
    const cohort = await Cohort.findByPk(targetId);
    if (!cohort) throw new ConnectorPermanentError('That cohort no longer exists.', 'cohort_missing');
    cohortIds = [cohort.id];
  }
  if (cohortIds.length === 0) return [];
  const enrollments = await Enrollment.findAll({
    where: { cohort_id: { [Op.in]: cohortIds }, status: 'active', portal_enabled: true },
    attributes: ['id'],
  });
  if (enrollments.length === 0) return [];
  const members = await CommunityMember.findAll({ where: { enrollment_id: { [Op.in]: enrollments.map((e) => e.id) } }, attributes: ['enrollment_id'] });
  return members.map((m) => m.enrollment_id);
}

export const inAppConnector: Connector = {
  channel: 'in_app',
  async send(d: ConnectorDelivery): Promise<ConnectorResult> {
    if (d.destination.target_type !== 'in_app_audience') {
      throw new ConnectorPermanentError(`An in-app notification goes to an audience, not ${d.destination.target_type}.`, 'bad_destination');
    }
    if (!d.draft.body.trim() && !(d.draft.title ?? '').trim()) throw new ConnectorPermanentError('The in-app notification is empty.', 'empty_body');
    const team = await ensureTeamIdentity();
    const audience = await audienceEnrollmentIds(d.destination.target_id);
    if (audience.length === 0) return { provider_message_id: d.messageId, reached: 0, already_done: false };

    const members = await CommunityMember.findAll({ where: { enrollment_id: { [Op.in]: audience } }, attributes: ['id', 'enrollment_id'] });
    const have = new Set((await CommunityNotification.findAll({
      where: { notification_type: 'announcement', source_type: 'comms_hub', source_id: d.messageId, member_id: { [Op.in]: members.map((m) => m.id) } },
      attributes: ['member_id'],
    })).map((n) => n.member_id));
    const todo = members.filter((m) => !have.has(m.id));
    for (const m of todo) {
      await createNotification(m.enrollment_id, team.enrollmentId, 'announcement', 'comms_hub', d.messageId);
    }
    return { provider_message_id: d.messageId, reached: todo.length, already_done: todo.length === 0 && members.length > 0 };
  },
};
