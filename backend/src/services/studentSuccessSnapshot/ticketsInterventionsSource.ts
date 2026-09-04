import { Op } from 'sequelize';
import RoomMembership from '../../models/RoomMembership';
import CommunityRoom from '../../models/CommunityRoom';
// Direct import, not the '../../models' barrel — the barrel triggers the
// full association graph at load time, which has broken 3 separate test
// files elsewhere in this session (agentRecentActivitySummary.ts,
// managerReliabilityIntentService.ts x2). Same fix, applied proactively
// here instead of discovered via a CI failure.
import Ticket from '../../models/Ticket';
import { SnapshotField, TicketsInterventionsValue } from './types';

/**
 * There is no direct enrollment -> Ticket FK anywhere in this platform
 * (confirmed at Checkpoint A discovery) — the only real join path is
 * enrollment -> RoomMembership -> a room_type:'dm' CommunityRoom ->
 * Ticket(entity_type:'community_room', entity_id: room.id), the exact
 * pairing reeseTicketLinkService.ts already uses to link Reese's own
 * conversation tickets. A student can have more than one DM room (Reese,
 * other staff); every one is checked, not just the first found.
 */
export async function getTicketsInterventionsField(enrollmentId: string): Promise<SnapshotField<TicketsInterventionsValue>> {
  const memberships = await RoomMembership.findAll({ where: { enrollment_id: enrollmentId } });
  if (memberships.length === 0) {
    return {
      value: { openCount: 0, totalCount: 0, recentTickets: [] },
      status: 'known',
      sourceSystem: 'tickets_via_community_room',
      sourceRecordIds: [],
      observedAt: new Date(),
      freshnessPolicy: 'real-time',
      reliabilityState: 'healthy',
    };
  }

  const roomIds = memberships.map((m: any) => m.room_id);
  const dmRooms = await CommunityRoom.findAll({ where: { id: { [Op.in]: roomIds }, room_type: 'dm' } });
  if (dmRooms.length === 0) {
    return {
      value: { openCount: 0, totalCount: 0, recentTickets: [] },
      status: 'known',
      sourceSystem: 'tickets_via_community_room',
      sourceRecordIds: [],
      observedAt: new Date(),
      freshnessPolicy: 'real-time',
      reliabilityState: 'healthy',
    };
  }

  const dmRoomIds = dmRooms.map((r: any) => r.id);
  const tickets = await Ticket.findAll({
    where: { entity_type: 'community_room', entity_id: { [Op.in]: dmRoomIds } },
    order: [['updated_at', 'DESC']],
    limit: 20,
  });

  const openCount = tickets.filter((t: any) => !['done', 'cancelled'].includes(t.status)).length;

  return {
    value: {
      openCount,
      totalCount: tickets.length,
      recentTickets: tickets.slice(0, 5).map((t: any) => ({ id: t.id, title: t.title, status: t.status, type: t.type, updatedAt: t.updated_at?.toISOString() ?? null })),
    },
    status: 'known',
    sourceSystem: 'tickets_via_community_room',
    sourceRecordIds: tickets.map((t: any) => t.id),
    observedAt: new Date(),
    freshnessPolicy: 'real-time',
    reliabilityState: 'healthy',
  };
}
