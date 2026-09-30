import { Op } from 'sequelize';
import RoomMembership from '../../models/RoomMembership';
import CommunityRoom from '../../models/CommunityRoom';
import RoomMessage from '../../models/RoomMessage';
import { getReeseEnrollmentId } from '../reese/reeseIdentitySeed';
import { PreviousReeseCommunicationsValue, SnapshotField } from './types';

/**
 * The real DM room between THIS student and Reese specifically — found by
 * intersecting the student's own room_type:'dm' memberships with Reese's
 * real enrollment id (getReeseEnrollmentId(), the same identity
 * reeseReplyService.ts's own loop guard resolves), not just "any DM room."
 * A student with no Reese conversation yet gets an honest empty result,
 * never another agent's/staff member's messages.
 */
export async function getPreviousReeseCommunicationsField(enrollmentId: string): Promise<SnapshotField<PreviousReeseCommunicationsValue>> {
  const reeseEnrollmentId = await getReeseEnrollmentId();
  if (!reeseEnrollmentId) {
    return {
      value: { messageCount: 0, lastMessageAt: null, recentMessages: [] },
      status: 'unknown',
      sourceSystem: 'room_messages',
      sourceRecordIds: [],
      observedAt: null,
      freshnessPolicy: 'real-time',
      reliabilityState: 'healthy',
      reliabilityReason: "Reese's own enrollment identity could not be resolved.",
    };
  }

  const [studentMemberships, reeseMemberships] = await Promise.all([
    RoomMembership.findAll({ where: { enrollment_id: enrollmentId } }),
    RoomMembership.findAll({ where: { enrollment_id: reeseEnrollmentId } }),
  ]);

  const reeseRoomIds = new Set(reeseMemberships.map((m: any) => m.room_id));
  const sharedRoomIds = studentMemberships.map((m: any) => m.room_id).filter((id: string) => reeseRoomIds.has(id));
  if (sharedRoomIds.length === 0) {
    return {
      value: { messageCount: 0, lastMessageAt: null, recentMessages: [] },
      status: 'known',
      sourceSystem: 'room_messages',
      sourceRecordIds: [],
      observedAt: new Date(),
      freshnessPolicy: 'real-time',
      reliabilityState: 'healthy',
    };
  }

  const dmRooms = await CommunityRoom.findAll({ where: { id: { [Op.in]: sharedRoomIds }, room_type: 'dm' } });
  const dmRoomIds = dmRooms.map((r: any) => r.id);

  const messages = await RoomMessage.findAll({
    where: { room_id: { [Op.in]: dmRoomIds } },
    order: [['created_at', 'DESC']],
    limit: 20,
  });

  return {
    value: {
      messageCount: messages.length,
      lastMessageAt: messages[0] ? (messages[0] as any).created_at?.toISOString() ?? null : null,
      recentMessages: messages.slice(0, 5).map((m: any) => ({
        enrollmentId: m.enrollment_id,
        isFromReese: m.enrollment_id === reeseEnrollmentId,
        createdAt: m.created_at?.toISOString() ?? null,
      })),
    },
    status: 'known',
    sourceSystem: 'room_messages',
    sourceRecordIds: messages.map((m: any) => m.id),
    observedAt: new Date(),
    freshnessPolicy: 'real-time',
    reliabilityState: 'healthy',
  };
}
