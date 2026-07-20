import { Op } from 'sequelize';
import RoomBooking from '../../models/RoomBooking';
import RoomBookingAttendee from '../../models/RoomBookingAttendee';
import { emitRoomEvent } from './roomOutboxService';
import { postSystemMessage } from './roomMessageService';
import { getOrCreateMember } from '../communityService';
import { ROOM_EVENTS } from './roomEvents';
import { log } from './roomShared';

// Phase B #5 — RSVP reminders + waitlist promotion.
//   • sweepReminders(): a cron enqueues a "starting soon" reminder into the
//     outbox as each scheduled session enters the 24h / 1h window. The outbox
//     de-dups on (event, booking, window), so each reminder fires at most once.
//   • promoteWaitlist(): when a "going" seat frees up, the earliest waitlisted
//     attendee is promoted and notified. Idempotent — only promotes while
//     going < capacity, and promoting an already-going attendee is a no-op.

const HOUR_MS = 60 * 60 * 1000;
const DEAD_STATES = ['cancelled', 'completed', 'archived', 'removed'];

export async function promoteWaitlist(bookingId: string): Promise<number> {
  const booking = await RoomBooking.findByPk(bookingId);
  if (!booking || booking.capacity == null) return 0; // uncapped sessions never waitlist
  if (DEAD_STATES.includes(booking.state)) return 0;

  let promoted = 0;
  // Bounded loop (never exceeds a sane waitlist length) so a data anomaly can't
  // spin forever — see the infinite-retry prohibition in CLAUDE.md.
  for (let i = 0; i < 500; i++) {
    const going = await RoomBookingAttendee.count({ where: { booking_id: bookingId, rsvp_state: 'going' } });
    if (going >= booking.capacity) break;

    const next = await RoomBookingAttendee.findOne({
      where: { booking_id: bookingId, rsvp_state: 'waitlisted' },
      order: [['waitlist_position', 'ASC'], ['created_at', 'ASC']],
    });
    if (!next) break;

    await next.update({ rsvp_state: 'going', waitlist_position: null });
    promoted += 1;
    await emitRoomEvent({
      eventType: ROOM_EVENTS.RsvpChanged,
      aggregateType: 'attendee',
      aggregateId: next.id,
      discriminator: 'promoted',
      payload: { booking_id: bookingId, state: 'going', promoted: true },
    });
    try {
      const member = await getOrCreateMember(next.enrollment_id);
      await postSystemMessage(
        booking.room_id,
        `🎟️ ${member.display_name} — a spot opened up, you're in for "${booking.title}"!`,
        { marker: `promotion:${next.id}`, bookingId },
      );
    } catch (e) {
      log('warn', 'waitlist_promote_notify_failed', { booking_id: bookingId, attendee_id: next.id, message: (e as Error)?.message });
    }
    log('info', 'waitlist_promoted', { booking_id: bookingId, attendee_id: next.id, enrollment_id: next.enrollment_id });
  }
  return promoted;
}

export async function sweepReminders(): Promise<{ within1h: number; within24h: number }> {
  const now = Date.now();

  const within1h = await RoomBooking.findAll({
    where: { state: 'scheduled', start_at: { [Op.gt]: new Date(now), [Op.lte]: new Date(now + HOUR_MS) } },
    limit: 500,
  });
  for (const b of within1h) {
    await emitRoomEvent({
      eventType: ROOM_EVENTS.SessionStartingSoon,
      aggregateType: 'booking',
      aggregateId: b.id,
      discriminator: '1h',
      payload: { window: '1h' },
    });
  }

  const within24h = await RoomBooking.findAll({
    where: { state: 'scheduled', start_at: { [Op.gt]: new Date(now + HOUR_MS), [Op.lte]: new Date(now + 24 * HOUR_MS) } },
    limit: 500,
  });
  for (const b of within24h) {
    await emitRoomEvent({
      eventType: ROOM_EVENTS.SessionStartingSoon,
      aggregateType: 'booking',
      aggregateId: b.id,
      discriminator: '24h',
      payload: { window: '24h' },
    });
  }

  log('info', 'reminder_sweep', { within_1h: within1h.length, within_24h: within24h.length });
  return { within1h: within1h.length, within24h: within24h.length };
}
