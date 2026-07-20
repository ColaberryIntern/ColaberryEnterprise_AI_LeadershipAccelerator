import { Op } from 'sequelize';
import CommunityRoom from '../../models/CommunityRoom';
import RoomBooking from '../../models/RoomBooking';
import RoomBookingAttendee from '../../models/RoomBookingAttendee';
import RoomMessage from '../../models/RoomMessage';
import RoomReport from '../../models/RoomReport';
import RoomOutboxEvent from '../../models/RoomOutboxEvent';

// Admin community-health view (spec §13) — meaningful participation, not raw
// message volume. Deliberately cheap COUNT queries; safe to poll.

export interface CommunityRoomsHealth {
  active_rooms: number;
  bookings_by_state: Record<string, number>;
  rsvp_going: number;
  attended: number;
  rsvp_to_attendance_pct: number;
  unanswered_questions: number;
  open_reports: number;
  outbox_backlog: number;
  outbox_dead_letter: number;
  generated_at: string;
}

export async function getCommunityRoomsHealth(): Promise<CommunityRoomsHealth> {
  const [
    activeRooms,
    bookingRows,
    rsvpGoing,
    attended,
    unansweredQuestions,
    openReports,
    outboxBacklog,
    outboxDead,
  ] = await Promise.all([
    CommunityRoom.count({ where: { status: 'active' } }),
    RoomBooking.findAll({ attributes: ['state'] }),
    RoomBookingAttendee.count({ where: { rsvp_state: 'going' } }),
    RoomBookingAttendee.count({ where: { attended: true } }),
    RoomMessage.count({
      where: { kind: 'question', [Op.or]: [{ question_status: null }, { question_status: 'open' }] },
    }),
    RoomReport.count({ where: { status: 'open' } }),
    RoomOutboxEvent.count({ where: { status: { [Op.in]: ['pending', 'failed'] } } }),
    RoomOutboxEvent.count({ where: { status: 'dead' } }),
  ]);

  const bookingsByState: Record<string, number> = {};
  for (const b of bookingRows) {
    bookingsByState[b.state] = (bookingsByState[b.state] || 0) + 1;
  }

  return {
    active_rooms: activeRooms,
    bookings_by_state: bookingsByState,
    rsvp_going: rsvpGoing,
    attended,
    rsvp_to_attendance_pct: rsvpGoing > 0 ? Math.round((attended / rsvpGoing) * 100) : 0,
    unanswered_questions: unansweredQuestions,
    open_reports: openReports,
    outbox_backlog: outboxBacklog,
    outbox_dead_letter: outboxDead,
    generated_at: new Date().toISOString(),
  };
}
