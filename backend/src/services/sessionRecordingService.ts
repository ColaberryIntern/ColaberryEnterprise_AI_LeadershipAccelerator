import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import type { Transaction } from 'sequelize';
import { sequelize } from '../config/database';
import { Op } from 'sequelize';
import LiveSession from '../models/LiveSession';
import RoomBooking from '../models/RoomBooking';
import RoomResource from '../models/RoomResource';
import CommunityRoom from '../models/CommunityRoom';
import { ROOM_RECORDING_DIR, MAX_ROOM_RECORDING_SIZE } from '../config/upload';
import { ensureRoomForSession } from './communityRooms/roomService';
import { emitRoomEvent } from './communityRooms/roomOutboxService';
import { ROOM_EVENTS } from './communityRooms/roomEvents';
import { log } from './communityRooms/roomShared';
import { findRecordingForSession as findDriveRecording, streamDriveFile, DriveRecordingMatch } from './driveService';
import {
  findRecordingForSession as findZoomRecording,
  findRecordingByMeetingId as findZoomRecordingByMeetingId,
  findClassRecordingInstances,
  extractZoomMeetingId,
  streamZoomFile,
  ZoomRecordingMatch,
} from './zoomService';
// From centralDate, NOT acceleratorService — the latter pulls in the whole
// Sequelize model graph, which breaks this module's unit tests.
import { classInstant } from './centralDate';

// Bridges the accelerator's LiveSession lifecycle (official class sessions),
// the general Rooms domain (RoomBooking — the "+ Book a session" flow), AND
// always-open persistent video Rooms (linked_cohort_id-scoped rooms like a
// cohort's main "class" room — is_video + always_open, one Zoom meeting
// reused indefinitely) to a downloadable "recording" RoomResource,
// automatically. Three entry points share the same download/attach core
// below:
//   ingestRecordingForSession — official LiveSession-backed classes, both
//     Google Meet/Drive and Zoom providers.
//   ingestRecordingForBooking — general Room bookings. Zoom-only (all new
//     bookings default to Zoom as of the provider migration; building this
//     for legacy Google Meet ad-hoc bookings isn't worth it).
//   ingestRecordingForRoom — always-open Rooms. Zoom-only. Unlike the two
//     above, there's no single "did this end" boundary and no per-booking
//     row to key idempotency off of, since the same meeting ID is reused
//     forever (found live 2026-08-05: a cohort's actual class room is one of
//     these, not a scheduled LiveSession — a wrong assumption in the initial
//     scope cut here excluded it). Idempotency instead keys off Zoom's own
//     per-recording instance uuid (distinct per start/stop even though the
//     numeric meeting id stays constant), stored in RoomResource.metadata.

type RecordingMatch = DriveRecordingMatch | ZoomRecordingMatch;

// Dispatches to the right source by LiveSession.meeting_provider. An object
// literal, not a class hierarchy — only 2 providers exist and no third is
// planned. Both match shapes already carry {name, mimeType, sizeBytes}
// directly, so the shared ingest logic below never needs to know which one
// it has beyond picking the right streamFile closure.
const PROVIDERS: Record<string, {
  findRecording: (session: LiveSession) => Promise<RecordingMatch | null>;
  streamFile: (match: RecordingMatch) => Promise<Readable>;
}> = {
  google_meet: {
    findRecording: findDriveRecording,
    streamFile: (match) => streamDriveFile((match as DriveRecordingMatch).fileId),
  },
  zoom: {
    findRecording: findZoomRecording,
    streamFile: (match) => streamZoomFile(match as ZoomRecordingMatch),
  },
};

/**
 * Which Room should hold a session's artefacts (recordings, Class Notes).
 *
 * NOT the booking's room. Every class booking points at the cohort's single
 * PERSISTENT room ("July 2026 - AI Systems Architect"), but each session also
 * has its own `scheduled` room, and that per-session room is what students
 * actually open — the portal's "YOUR CLASSES" list links there.
 *
 * Attaching to the booking room is why a session room's Recordings tab read
 * "No recordings yet" while that same session's banner offered a recording:
 * the file was real, just one level up from where anyone looks. It also meant
 * a class recorded in two parts exposed only the part the banner linked to,
 * with no way to reach the second.
 *
 * Falls back to the booking room when a session has no room of its own.
 */
export async function resolveSessionRoomId(session: LiveSession, bookingRoomId: string): Promise<string> {
  const sessionRoom = await CommunityRoom.findOne({
    where: { linked_live_session_id: session.id },
    attributes: ['id'],
  });
  return sessionRoom?.id || bookingRoomId;
}

// Idempotent findOrCreate of a RoomBooking for a session, mirroring the exact
// pattern ensureRoomForSession already uses for the room itself. A room must
// exist first (bookings belong to a room); ensureRoomForSession is itself
// idempotent, so calling it here is safe even if session creation already did.
export async function ensureBookingForSession(session: LiveSession): Promise<RoomBooking> {
  const room = await ensureRoomForSession(session);
  const [booking, created] = await RoomBooking.findOrCreate({
    where: { related_live_session_id: session.id },
    defaults: {
      room_id: room.id,
      variant: 'study',
      title: session.title || `Session ${session.session_number}`,
      description: session.description || null,
      start_at: new Date(`${session.session_date}T${session.start_time}`),
      end_at: new Date(`${session.session_date}T${session.end_time}`),
      timezone: 'America/Chicago',
      privacy: 'cohort',
      meeting_provider: session.meeting_provider || 'google_meet',
      meeting_link: session.meeting_link || null,
      related_live_session_id: session.id,
      state: 'completed',
      created_by_enrollment_id: null,
    },
  });
  if (created) log('info', 'booking_created_for_session', { booking_id: booking.id, session_id: session.id });
  return booking;
}

export interface IngestResult {
  status: 'ingested' | 'already_present' | 'not_found';
  resourceId?: string;
}

// Shared core: download a match to disk and attach it as a 'recording'
// RoomResource on the given booking. Never buffers the whole file in memory
// (this process runs with a 512MB heap cap) — streams provider -> disk
// directly. Callers have already done the "does a resource already exist"
// idempotency check; this function only handles the download+attach.
//
// onCreated runs INSIDE the same transaction as the RoomResource insert,
// before commit — this is how ingestRecordingForSession keeps
// LiveSession.recording_url in sync atomically with the resource being
// created. Without this, a session.update() run only after commit could
// succeed at creating the resource but fail to point recording_url at it,
// and — because the idempotency guard above short-circuits on "a resource
// already exists" — a retry would never revisit that update, permanently
// stranding the session pointing nowhere even though the recording exists.
//
// Takes roomId/bookingId as plain values, not a RoomBooking, so a bare
// always-open Room (no booking at all — ingestRecordingForRoom below) can
// share this same core with bookingId: null.
async function attachRecording(
  roomId: string,
  bookingId: string | null,
  match: RecordingMatch,
  streamFile: (match: RecordingMatch) => Promise<Readable>,
  resourceTitle: string,
  eventPayloadExtra: Record<string, unknown>,
  metadata?: Record<string, unknown>,
  onCreated?: (resource: RoomResource, transaction: Transaction) => Promise<void>,
): Promise<IngestResult> {
  if (match.sizeBytes && match.sizeBytes > MAX_ROOM_RECORDING_SIZE) {
    log('warn', 'recording_exceeds_size_cap', { room_id: roomId, booking_id: bookingId, size: match.sizeBytes, cap: MAX_ROOM_RECORDING_SIZE });
    return { status: 'not_found' };
  }

  const ext = path.extname(match.name) || '.mp4';
  const storageKey = `${crypto.randomUUID()}${ext}`;
  const destPath = path.join(ROOM_RECORDING_DIR, storageKey);

  const source = await streamFile(match);
  await new Promise<void>((resolve, reject) => {
    const dest = fs.createWriteStream(destPath);
    source.on('error', reject);
    dest.on('error', reject);
    dest.on('finish', resolve);
    source.pipe(dest);
  });

  const sizeBytes = fs.statSync(destPath).size;

  const t = await sequelize.transaction();
  try {
    const resource = await RoomResource.create(
      {
        room_id: roomId,
        booking_id: bookingId,
        resource_type: 'recording',
        title: resourceTitle,
        url: null,
        mime_type: match.mimeType,
        size_bytes: sizeBytes,
        storage_key: storageKey,
        created_by_enrollment_id: null,
        ...(metadata ? { metadata } : {}),
      },
      { transaction: t },
    );
    if (onCreated) await onCreated(resource, t);
    await t.commit();

    await emitRoomEvent({
      eventType: ROOM_EVENTS.RecordingAttached,
      aggregateType: 'resource',
      aggregateId: resource.id,
      payload: { room_id: roomId, booking_id: bookingId, resource_type: 'recording', ...eventPayloadExtra },
    });
    log('info', 'recording_ingested', { room_id: roomId, booking_id: bookingId, resource_id: resource.id, size_bytes: sizeBytes });
    return { status: 'ingested', resourceId: resource.id };
  } catch (err) {
    await t.rollback();
    // Clean up the downloaded file on failure so a retry doesn't orphan disk space.
    try { fs.unlinkSync(destPath); } catch { /* best-effort */ }
    throw err;
  }
}

// No-op-safe: running this twice for the same session never re-downloads or
// duplicates a resource (checks for an existing recording first), and a
// "not found" result is a normal outcome — recording is still effectively a
// per-meeting setting that could be off for a given class.
//
// preResolvedMatch lets a webhook handler (Zoom's recording.completed) skip
// the findRecording lookup entirely — the webhook payload already IS the
// found recording, so there's no reason to make a redundant list-API call.
// The polling/backfill cron (schedulerService.ts) omits it and lets the
// provider's own findRecording run, as a fallback for a missed webhook.
export async function ingestRecordingForSession(
  session: LiveSession,
  preResolvedMatch?: RecordingMatch,
): Promise<IngestResult> {
  const booking = await ensureBookingForSession(session);
  const provider = PROVIDERS[session.meeting_provider || 'google_meet'];
  if (!provider) return { status: 'not_found' };

  /*
   * Zoom sessions go through the window-aware, multi-instance path below.
   * A webhook-supplied match (preResolvedMatch) skips it: that payload already
   * IS one specific completed recording, so there is nothing to select.
   */
  if (!preResolvedMatch && session.meeting_provider === 'zoom' && session.zoom_meeting_id) {
    return ingestZoomRecordingsForSession(session, booking);
  }

  const existing = await RoomResource.findOne({
    where: { booking_id: booking.id, resource_type: 'recording' },
  });
  if (existing) return { status: 'already_present', resourceId: existing.id };

  const match = preResolvedMatch ?? await provider.findRecording(session);
  if (!match) return { status: 'not_found' };

  return attachRecording(
    booking.room_id,
    booking.id,
    match,
    provider.streamFile,
    session.title || `Session ${session.session_number} recording`,
    { session_id: session.id },
    undefined,
    // Kept in sync for the existing Portal "Watch Recording" button
    // (PortalSessionDetailPage.tsx), which reads LiveSession.recording_url —
    // point it at the same authenticated download route rather than a raw
    // provider link, since the file is now hosted on our own disk. Runs in
    // the same transaction as the resource insert — see attachRecording's
    // own comment for why that matters.
    async (resource, transaction) => {
      await session.update(
        { recording_url: `/api/portal/community/rooms/${booking.room_id}/resources/${resource.id}/download` },
        { transaction },
      );
    },
  );
}

/**
 * Zoom class recordings, selected by class window and ingested in full.
 *
 * Fixes three compounding faults behind the Week 2 Build Day incident
 * (2026-08-06), where students were served a 5-minute pre-class test as the
 * class while the real 93MB + 178MB recordings sat in Zoom, never ingested:
 *
 *  1. Ingest could run BEFORE the class finished. It fired at 5:33pm for a
 *     6:30pm class and grabbed the only recording that existed then — a test
 *     start. Now it refuses to run until the class window has closed.
 *  2. Selection took the first instance matching the meeting id, with no
 *     notion of when the class actually was. Now it uses
 *     findClassRecordingInstances (window overlap, see recordingOverlapsWindow).
 *  3. Idempotency keyed on "does ANY recording exist for this booking", so the
 *     first pick was pinned forever and later, better recordings were never
 *     collected. Now it keys per Zoom instance uuid — the same scheme
 *     ingestRecordingForRoom already used — so a class split across several
 *     recordings gets all of them, and a later sweep can still pick up a part
 *     that had not finished processing on the previous run.
 *
 * recording_url points at the EARLIEST part, so "Watch recording" starts at
 * the beginning of class; the rest are listed in the room's Recordings tab.
 */
async function ingestZoomRecordingsForSession(
  session: LiveSession,
  booking: RoomBooking,
): Promise<IngestResult> {
  // classInstant reads the stored Central wall-clock correctly on a UTC host —
  // a naive new Date(dateStr + 'T' + timeStr) is off by the UTC offset and has
  // caused a P0 on this exact data before.
  const windowStart = classInstant(session.session_date, session.start_time);
  const windowEnd = classInstant(session.session_date, session.end_time);

  if (Date.now() < windowEnd.getTime()) {
    log('info', 'recording_ingest_too_early', {
      session_id: session.id, window_end: windowEnd.toISOString(),
    });
    return { status: 'not_found' };
  }

  const instances = await findClassRecordingInstances(
    session.zoom_meeting_id as string,
    session.session_date,
    windowStart,
    windowEnd,
    session.title || undefined,
  );
  if (!instances.length) return { status: 'not_found' };

  // Session's own room, not the cohort room the booking points at — see
  // resolveSessionRoomId. Both parts of a split class must land where the
  // student actually browses, or only the banner-linked one is reachable.
  const roomId = await resolveSessionRoomId(session, booking.room_id);

  const multi = instances.length > 1;
  let firstResourceId: string | null = null;
  let ingestedAny = false;

  for (let idx = 0; idx < instances.length; idx++) {
    const inst = instances[idx];

    const existing = await RoomResource.findOne({
      where: {
        room_id: roomId,
        resource_type: 'recording',
        metadata: { [Op.contains]: { zoom_uuid: inst.uuid } } as unknown as Record<string, unknown>,
      },
    });
    if (existing) {
      if (!firstResourceId) firstResourceId = existing.id;
      continue;
    }

    const base = session.title || `Session ${session.session_number} recording`;
    const title = multi ? `${base} · Part ${idx + 1} of ${instances.length}` : base;

    const result = await attachRecording(
      roomId,
      booking.id,
      inst.match,
      (m) => streamZoomFile(m as ZoomRecordingMatch),
      title,
      { session_id: session.id },
      { zoom_uuid: inst.uuid, source: 'class_session', part: idx + 1, parts: instances.length },
    );
    if (result.resourceId) {
      ingestedAny = true;
      if (!firstResourceId) firstResourceId = result.resourceId;
    }
  }

  if (firstResourceId) {
    await session.update({
      recording_url: `/api/portal/community/rooms/${roomId}/resources/${firstResourceId}/download`,
    });
  }

  if (!ingestedAny) return { status: 'already_present', resourceId: firstResourceId ?? undefined };
  return { status: 'ingested', resourceId: firstResourceId ?? undefined };
}

// General Room bookings (the "+ Book a session" flow) — Zoom-only. See the
// file header for why: all new bookings default to Zoom, and legacy
// Google-Meet ad-hoc bookings aren't worth building this for. Skips
// (returns not_found, not an error) any booking whose provider isn't Zoom,
// or that's actually a class-session booking (related_live_session_id set —
// that path is owned by ingestRecordingForSession above and keys off
// LiveSession.zoom_meeting_id, not RoomBooking.google_event_id).
export async function ingestRecordingForBooking(
  booking: RoomBooking,
  preResolvedMatch?: ZoomRecordingMatch,
): Promise<IngestResult> {
  if (booking.meeting_provider !== 'zoom') return { status: 'not_found' };
  if (booking.related_live_session_id) return { status: 'not_found' };
  if (!booking.google_event_id) return { status: 'not_found' };

  const existing = await RoomResource.findOne({
    where: { booking_id: booking.id, resource_type: 'recording' },
  });
  if (existing) return { status: 'already_present', resourceId: existing.id };

  const dateHint = (booking.start_at || new Date()).toISOString().slice(0, 10);
  const match = preResolvedMatch ?? await findZoomRecordingByMeetingId(booking.google_event_id, dateHint, booking.title);
  if (!match) return { status: 'not_found' };

  return attachRecording(
    booking.room_id,
    booking.id,
    match,
    (m) => streamZoomFile(m as ZoomRecordingMatch),
    booking.title || 'Room session recording',
    { booking_id: booking.id },
  );
}

// Always-open persistent video Rooms (is_video + always_open — e.g. a
// cohort's main class room). Zoom-only, same as ingestRecordingForBooking.
// No RoomBooking exists for these at all, so idempotency can't key off a
// booking_id the way the other two paths do — it keys off Zoom's own
// per-recording-instance uuid instead (constant meeting id, distinct uuid
// per start/stop), stored in RoomResource.metadata.zoom_uuid. A JSONB
// containment query (not a dedicated column) because this is the one place
// in the schema that needs it; adding a column for a single query site isn't
// worth it.
export async function ingestRecordingForRoom(
  room: CommunityRoom,
  instanceUuid: string,
  match: ZoomRecordingMatch,
): Promise<IngestResult> {
  const existing = await RoomResource.findOne({
    where: {
      room_id: room.id,
      resource_type: 'recording',
      metadata: { [Op.contains]: { zoom_uuid: instanceUuid } } as unknown as Record<string, unknown>,
    },
  });
  if (existing) return { status: 'already_present', resourceId: existing.id };

  return attachRecording(
    room.id,
    null,
    match,
    (m) => streamZoomFile(m as ZoomRecordingMatch),
    `${room.name} — recording`,
    { room_id: room.id },
    { zoom_uuid: instanceUuid, source: 'always_open_room' },
  );
}

// Finds the always-open Room a Zoom meeting/webhook event belongs to, if
// any. Only is_video + always_open rooms are eligible — a scheduled class
// Room (room_type: 'scheduled', linked to one LiveSession) is handled by
// ingestRecordingForSession instead, keyed off LiveSession.zoom_meeting_id,
// never reached via this path.
export async function findAlwaysOpenRoomForZoomMeeting(meetingId: string): Promise<CommunityRoom | null> {
  const rooms = await CommunityRoom.findAll({
    where: { is_video: true, always_open: true, meeting_link: { [Op.ne]: null } },
  });
  return rooms.find((r) => extractZoomMeetingId(r.meeting_link) === meetingId) || null;
}
