// Community-room domain events (spec §11). These are the event_type values
// written to the room_outbox_events table and consumed by roomOutboxService's
// idempotent drain worker.

export const ROOM_EVENTS = {
  RoomCreated: 'RoomCreated',
  RoomAccessChanged: 'RoomAccessChanged',
  BookingRequested: 'BookingRequested',
  BookingApproved: 'BookingApproved',
  SessionScheduled: 'SessionScheduled',
  TimelinePublished: 'TimelinePublished',
  RsvpChanged: 'RsvpChanged',
  SessionStartingSoon: 'SessionStartingSoon',
  SessionWentLive: 'SessionWentLive',
  MemberJoinedSession: 'MemberJoinedSession',
  SessionCompleted: 'SessionCompleted',
  RecordingAttached: 'RecordingAttached',
  RecapApproved: 'RecapApproved',
  ArtifactShared: 'ArtifactShared',
  ContributionVerified: 'ContributionVerified',
} as const;

export type RoomEventType = (typeof ROOM_EVENTS)[keyof typeof ROOM_EVENTS];

// Deterministic idempotency key for an event so emitting the same logical event
// twice (retry, double-click, replayed webhook) is a single outbox row.
export function eventIdempotencyKey(
  eventType: RoomEventType,
  aggregateId: string,
  discriminator?: string,
): string {
  return [eventType, aggregateId, discriminator || ''].filter(Boolean).join(':');
}
