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
  /**
   * People who pressed "join". That is an INTENT, not evidence anyone was in the
   * room: the click is recorded the moment the link is handed over, before the
   * meeting is even opened, and nothing later retracts it if they never arrive.
   */
  join_intent: number;
  /**
   * Attendance from a provider report rather than a click.
   *
   * This is 0 today, and that is honest rather than broken: no reconciliation
   * against Zoom's participant report exists yet (it lands with recording
   * ingestion). Reporting it as a separate, visibly-zero number is the point —
   * folding intent into it would manufacture an attendance figure out of clicks.
   */
  attended_confirmed: number;
  /** Of those who said they were coming, how many pressed join. Not attendance. */
  rsvp_to_intent_pct: number;
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
    joinIntent,
    attendedConfirmed,
    unansweredQuestions,
    openReports,
    outboxBacklog,
    outboxDead,
  ] = await Promise.all([
    CommunityRoom.count({ where: { status: 'active' } }),
    RoomBooking.findAll({ attributes: ['state'] }),
    RoomBookingAttendee.count({ where: { rsvp_state: 'going' } }),
    RoomBookingAttendee.count({ where: { attendance_source: 'intent' } }),
    // Anything NOT sourced from a click. `attended` alone would count every
    // join-intent row, which is how a click becomes an attendance statistic.
    RoomBookingAttendee.count({
      where: { attended: true, attendance_source: { [Op.ne]: 'intent' } },
    }),
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
    join_intent: joinIntent,
    attended_confirmed: attendedConfirmed,
    rsvp_to_intent_pct: rsvpGoing > 0 ? Math.round((joinIntent / rsvpGoing) * 100) : 0,
    unanswered_questions: unansweredQuestions,
    open_reports: openReports,
    outbox_backlog: outboxBacklog,
    outbox_dead_letter: outboxDead,
    generated_at: new Date().toISOString(),
  };
}
