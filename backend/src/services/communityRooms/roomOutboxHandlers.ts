import RoomOutboxEvent from '../../models/RoomOutboxEvent';
import RoomBooking from '../../models/RoomBooking';
import { ROOM_EVENTS } from './roomEvents';
import { getMeetingProvider } from './meetingProvider';

// Side-effect handlers for community-room domain events. EVERY handler must be
// idempotent — the outbox may deliver the same event more than once. A handler
// that throws is retried with backoff (see roomOutboxService); a handler that
// returns marks the event processed.

export async function handleRoomEvent(event: RoomOutboxEvent): Promise<void> {
  switch (event.event_type) {
    case ROOM_EVENTS.SessionScheduled:
    case ROOM_EVENTS.BookingApproved:
      await ensureBookingMeeting(event.aggregate_id);
      return;

    // Observational for this release — reserved hooks for reminders / feed
    // fan-out / timeline publication (added in later phases). No-op = processed.
    case ROOM_EVENTS.RoomCreated:
    case ROOM_EVENTS.RoomAccessChanged:
    case ROOM_EVENTS.BookingRequested:
    case ROOM_EVENTS.TimelinePublished:
    case ROOM_EVENTS.RsvpChanged:
    case ROOM_EVENTS.SessionStartingSoon:
    case ROOM_EVENTS.SessionWentLive:
    case ROOM_EVENTS.MemberJoinedSession:
    case ROOM_EVENTS.SessionCompleted:
    case ROOM_EVENTS.RecordingAttached:
    case ROOM_EVENTS.RecapApproved:
    case ROOM_EVENTS.ArtifactShared:
    case ROOM_EVENTS.ContributionVerified:
    default:
      return;
  }
}

// Provision the Google Meet (or configured provider) conference for a booking.
// Idempotent: skips if a link already exists, if the provider is external/text,
// or if the booking has no scheduled window yet. requestId = booking.id so a
// retry reuses the same conference rather than spawning a duplicate.
async function ensureBookingMeeting(bookingId: string): Promise<void> {
  const booking = await RoomBooking.findByPk(bookingId);
  if (!booking) return; // aggregate removed — nothing to do
  if (booking.meeting_link) return; // already provisioned
  if (booking.meeting_provider === 'external' || booking.meeting_provider === 'text_only') return;
  if (!booking.start_at || !booking.end_at) return; // not yet scheduled

  const provider = getMeetingProvider(booking.meeting_provider);
  const result = await provider.createMeeting({
    title: booking.title,
    description: booking.description || undefined,
    startAt: booking.start_at,
    endAt: booking.end_at,
    timezone: booking.timezone || undefined,
    requestId: booking.id,
  });
  await booking.update({
    meeting_link: result.joinUrl,
    google_event_id: result.providerEventId,
  });
}
