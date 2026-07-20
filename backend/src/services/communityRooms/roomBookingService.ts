import RoomBooking, { RoomBookingState, RoomBookingVariant } from '../../models/RoomBooking';
import RoomBookingAttendee, { RoomRsvpState } from '../../models/RoomBookingAttendee';
import CommunityRoom, { RoomPrivacy } from '../../models/CommunityRoom';
import RoomMembership from '../../models/RoomMembership';
import { RoomAccessContext, canModerate, canJoinMeeting, isEligible } from './roomEntitlementService';
import { assertTransition } from './roomStateMachine';
import { emitRoomEvent } from './roomOutboxService';
import { ROOM_EVENTS } from './roomEvents';
import { createRoom } from './roomService';
import { recordContribution } from './roomRecognitionService';
import { notFoundError, forbiddenError, validationError, conflictError, log } from './roomShared';

// Booking lifecycle (spec §5 wizard + §11 state machine): create → publish →
// RSVP/waitlist → join (server-side re-checked) → complete. Every RSVP/join is
// idempotent; every state change goes through the state machine.

function toDate(v: string | Date | undefined | null): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

async function loadBookingWithRoom(bookingId: string): Promise<{ booking: RoomBooking; room: CommunityRoom }> {
  const booking = await RoomBooking.findByPk(bookingId);
  if (!booking) throw notFoundError('Booking not found');
  const room = await CommunityRoom.findByPk(booking.room_id);
  if (!room) throw notFoundError('Room not found');
  return { booking, room };
}

function membershipFor(roomId: string, enrollmentId: string): Promise<RoomMembership | null> {
  return RoomMembership.findOne({ where: { room_id: roomId, enrollment_id: enrollmentId } });
}

export interface CreateBookingInput {
  room_id?: string;
  variant?: RoomBookingVariant;
  title: string;
  description?: string;
  outcome?: string;
  agenda?: string;
  start_at?: string | Date;
  end_at?: string | Date;
  timezone?: string;
  privacy?: RoomPrivacy;
  capacity?: number;
  approval_required?: boolean;
  meeting_provider?: string;
  related_module_id?: string;
  related_live_session_id?: string;
  related_project_id?: string;
  skill_tags?: string[];
  co_hosts?: string[];
  rsvp_deadline?: string | Date;
  reflection_prompt?: string;
  artifact_prompt?: string;
  idempotency_key?: string;
}

export async function createBooking(ctx: RoomAccessContext, input: CreateBookingInput): Promise<RoomBooking> {
  if (!input.title || !input.title.trim()) throw validationError('A booking title is required');

  // Dedup on the client-supplied idempotency key (double-submit safe).
  if (input.idempotency_key) {
    const dup = await RoomBooking.findOne({ where: { idempotency_key: input.idempotency_key } });
    if (dup) return dup;
  }

  // Book into an existing room (host/moderator only) or spin up a new room.
  let roomId = input.room_id;
  if (roomId) {
    const room = await CommunityRoom.findByPk(roomId);
    if (!room) throw notFoundError('Room not found');
    const membership = await membershipFor(roomId, ctx.enrollmentId);
    if (!canModerate(ctx, membership) && room.owner_enrollment_id !== ctx.enrollmentId) {
      throw forbiddenError('Not authorized to schedule in this room');
    }
  } else {
    const room = await createRoom(ctx, {
      name: input.title,
      privacy: input.privacy || 'public',
      category: 'demos_events',
    });
    roomId = room.id;
  }

  const approvalRequired = input.approval_required === true;
  const state: RoomBookingState = approvalRequired ? 'pending_approval' : 'scheduled';

  const booking = await RoomBooking.create({
    room_id: roomId,
    variant: input.variant || 'study',
    title: input.title.trim(),
    description: input.description ?? null,
    outcome: input.outcome ?? null,
    agenda: input.agenda ?? null,
    host_enrollment_id: ctx.enrollmentId,
    co_hosts: input.co_hosts ?? [],
    start_at: toDate(input.start_at),
    end_at: toDate(input.end_at),
    timezone: input.timezone ?? null,
    privacy: input.privacy || 'public',
    capacity: input.capacity ?? null,
    approval_required: approvalRequired,
    meeting_provider: input.meeting_provider || 'google_meet',
    related_module_id: input.related_module_id ?? null,
    related_live_session_id: input.related_live_session_id ?? null,
    related_project_id: input.related_project_id ?? null,
    skill_tags: input.skill_tags ?? [],
    rsvp_deadline: toDate(input.rsvp_deadline),
    reflection_prompt: input.reflection_prompt ?? null,
    artifact_prompt: input.artifact_prompt ?? null,
    state,
    created_by_enrollment_id: ctx.enrollmentId,
    idempotency_key: input.idempotency_key ?? null,
  });

  await emitRoomEvent({ eventType: ROOM_EVENTS.BookingRequested, aggregateType: 'booking', aggregateId: booking.id });
  if (state === 'scheduled') {
    // Provisions the meeting link via the idempotent outbox handler.
    await emitRoomEvent({ eventType: ROOM_EVENTS.SessionScheduled, aggregateType: 'booking', aggregateId: booking.id });
  }
  log('info', 'booking_created', { booking_id: booking.id, room_id: roomId, state, by: ctx.enrollmentId });
  return booking;
}

// Approve + publish a booking (host/moderator). Moves pending/draft → scheduled,
// flags it for timeline publication, and provisions the meeting.
export async function publishBooking(ctx: RoomAccessContext, bookingId: string): Promise<RoomBooking> {
  const { booking, room } = await loadBookingWithRoom(bookingId);
  const membership = await membershipFor(room.id, ctx.enrollmentId);
  if (!canModerate(ctx, membership) && booking.host_enrollment_id !== ctx.enrollmentId) {
    throw forbiddenError('Not authorized to publish this booking');
  }
  assertTransition(booking.state, 'scheduled');
  await booking.update({ state: 'scheduled', timeline_published: booking.privacy !== 'private' && booking.privacy !== 'invite_only' });
  await emitRoomEvent({ eventType: ROOM_EVENTS.BookingApproved, aggregateType: 'booking', aggregateId: booking.id });
  await emitRoomEvent({ eventType: ROOM_EVENTS.SessionScheduled, aggregateType: 'booking', aggregateId: booking.id });
  if (booking.timeline_published) {
    await emitRoomEvent({ eventType: ROOM_EVENTS.TimelinePublished, aggregateType: 'booking', aggregateId: booking.id });
  }
  return booking;
}

async function goingCount(bookingId: string): Promise<number> {
  return RoomBookingAttendee.count({ where: { booking_id: bookingId, rsvp_state: 'going' } });
}

// RSVP with capacity + waitlist. Idempotent on (booking_id, enrollment_id).
export async function rsvp(
  ctx: RoomAccessContext,
  bookingId: string,
  desired: RoomRsvpState,
): Promise<RoomBookingAttendee> {
  const { booking, room } = await loadBookingWithRoom(bookingId);
  const membership = await membershipFor(room.id, ctx.enrollmentId);
  if (!isEligible(room, ctx, membership)) throw forbiddenError('You are not eligible for this session');
  if (booking.rsvp_deadline && new Date() > booking.rsvp_deadline && desired === 'going') {
    throw conflictError('RSVP has closed for this session');
  }

  let effective: RoomRsvpState = desired;
  let waitlistPosition: number | null = null;
  if (desired === 'going' && booking.capacity != null) {
    const current = await goingCount(bookingId);
    // Count the seat only if this enrollment isn't already 'going'.
    const already = await RoomBookingAttendee.findOne({ where: { booking_id: bookingId, enrollment_id: ctx.enrollmentId } });
    const alreadyGoing = already?.rsvp_state === 'going';
    if (!alreadyGoing && current >= booking.capacity) {
      effective = 'waitlisted';
      waitlistPosition = (await RoomBookingAttendee.count({ where: { booking_id: bookingId, rsvp_state: 'waitlisted' } })) + 1;
    }
  }

  const [attendee] = await RoomBookingAttendee.findOrCreate({
    where: { booking_id: bookingId, enrollment_id: ctx.enrollmentId },
    defaults: {
      booking_id: bookingId,
      enrollment_id: ctx.enrollmentId,
      rsvp_state: effective,
      waitlist_position: waitlistPosition,
    },
  });
  if (attendee.rsvp_state !== effective) {
    await attendee.update({ rsvp_state: effective, waitlist_position: waitlistPosition });
  }
  await emitRoomEvent({
    eventType: ROOM_EVENTS.RsvpChanged,
    aggregateType: 'attendee',
    aggregateId: attendee.id,
    payload: { booking_id: bookingId, state: effective },
  });
  return attendee;
}

// SECURITY-critical join: re-checks entitlement server-side EVERY time, records
// an attendance-intent event, and returns the meeting link only to an authorized
// participant. Meeting links are never exposed in list/detail payloads.
export async function joinBooking(
  ctx: RoomAccessContext,
  bookingId: string,
): Promise<{ join_url: string | null; state: RoomBookingState }> {
  const { booking, room } = await loadBookingWithRoom(bookingId);
  const membership = await membershipFor(room.id, ctx.enrollmentId);
  if (!canJoinMeeting(room, ctx, membership)) {
    throw forbiddenError('You are not authorized to join this session');
  }
  // Record attendance intent (idempotent) — real attendance is reconciled later.
  const [attendee] = await RoomBookingAttendee.findOrCreate({
    where: { booking_id: bookingId, enrollment_id: ctx.enrollmentId },
    defaults: {
      booking_id: bookingId,
      enrollment_id: ctx.enrollmentId,
      rsvp_state: 'going',
      attended: true,
      attendance_source: 'intent',
      joined_at: new Date(),
    },
  });
  if (!attendee.attended) {
    await attendee.update({ attended: true, attendance_source: 'intent', joined_at: attendee.joined_at || new Date() });
  }
  await emitRoomEvent({
    eventType: ROOM_EVENTS.MemberJoinedSession,
    aggregateType: 'attendee',
    aggregateId: attendee.id,
    discriminator: 'join',
    payload: { booking_id: bookingId, enrollment_id: ctx.enrollmentId },
  });
  log('info', 'booking_join', { booking_id: bookingId, enrollment_id: ctx.enrollmentId, outcome: 'authorized' });
  // Recognition: showing up counts (Reliable Study Partner), once per session.
  try {
    await recordContribution(ctx.enrollmentId, {
      category: 'reliable_study_partner', action: 'attended', points: 5,
      roomId: room.id, bookingId: booking.id, idempotencyKey: `attend:${booking.id}:${ctx.enrollmentId}`,
    });
  } catch (e) { log('warn', 'recognition_attend_failed', { booking_id: bookingId, message: (e as Error)?.message }); }
  return { join_url: booking.meeting_link, state: booking.state };
}

export async function completeBooking(ctx: RoomAccessContext, bookingId: string): Promise<RoomBooking> {
  const { booking, room } = await loadBookingWithRoom(bookingId);
  const membership = await membershipFor(room.id, ctx.enrollmentId);
  if (!canModerate(ctx, membership) && booking.host_enrollment_id !== ctx.enrollmentId) {
    throw forbiddenError('Not authorized to complete this booking');
  }
  assertTransition(booking.state, 'completed');
  await booking.update({ state: 'completed' });
  await emitRoomEvent({ eventType: ROOM_EVENTS.SessionCompleted, aggregateType: 'booking', aggregateId: booking.id });
  // Recognition: the host earns Community Host credit for a completed session.
  if (booking.host_enrollment_id) {
    try {
      await recordContribution(booking.host_enrollment_id, {
        category: 'community_host', action: 'hosted_session', points: 25,
        roomId: room.id, bookingId: booking.id, idempotencyKey: `host_complete:${booking.id}`,
      });
    } catch (e) { log('warn', 'recognition_host_failed', { booking_id: booking.id, message: (e as Error)?.message }); }
  }
  return booking;
}

export async function cancelBooking(ctx: RoomAccessContext, bookingId: string): Promise<RoomBooking> {
  const { booking, room } = await loadBookingWithRoom(bookingId);
  const membership = await membershipFor(room.id, ctx.enrollmentId);
  if (!canModerate(ctx, membership) && booking.host_enrollment_id !== ctx.enrollmentId) {
    throw forbiddenError('Not authorized to cancel this booking');
  }
  assertTransition(booking.state, 'cancelled');
  await booking.update({ state: 'cancelled' });
  return booking;
}
