import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import type { Transaction } from 'sequelize';
import { sequelize } from '../config/database';
import LiveSession from '../models/LiveSession';
import RoomBooking from '../models/RoomBooking';
import RoomResource from '../models/RoomResource';
import { ROOM_RECORDING_DIR, MAX_ROOM_RECORDING_SIZE } from '../config/upload';
import { ensureRoomForSession } from './communityRooms/roomService';
import { emitRoomEvent } from './communityRooms/roomOutboxService';
import { ROOM_EVENTS } from './communityRooms/roomEvents';
import { log } from './communityRooms/roomShared';
import { findRecordingForSession as findDriveRecording, streamDriveFile, DriveRecordingMatch } from './driveService';
import {
  findRecordingForSession as findZoomRecording,
  findRecordingByMeetingId as findZoomRecordingByMeetingId,
  streamZoomFile,
  ZoomRecordingMatch,
} from './zoomService';

// Bridges the accelerator's LiveSession lifecycle (official class sessions)
// AND the general Rooms domain (RoomBooking — the "+ Book a session" flow)
// to a downloadable "recording" RoomResource, automatically. Two entry
// points share the same download/attach core below:
//   ingestRecordingForSession — official LiveSession-backed classes, both
//     Google Meet/Drive and Zoom providers.
//   ingestRecordingForBooking — general Room bookings. Zoom-only (all new
//     bookings default to Zoom as of the provider migration; building this
//     for legacy Google Meet ad-hoc bookings isn't worth it). Deliberately
//     does NOT cover the always-open persistent video rooms (Grape Gallery
//     etc.) — those reuse the same Zoom meeting ID indefinitely with no
//     single-session boundary, so "one meeting = one recording" doesn't
//     hold; that's a different feature, not built here.

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
async function attachRecordingToBooking(
  booking: RoomBooking,
  match: RecordingMatch,
  streamFile: (match: RecordingMatch) => Promise<Readable>,
  resourceTitle: string,
  eventPayloadExtra: Record<string, unknown>,
  onCreated?: (resource: RoomResource, transaction: Transaction) => Promise<void>,
): Promise<IngestResult> {
  if (match.sizeBytes && match.sizeBytes > MAX_ROOM_RECORDING_SIZE) {
    log('warn', 'recording_exceeds_size_cap', { booking_id: booking.id, size: match.sizeBytes, cap: MAX_ROOM_RECORDING_SIZE });
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
        room_id: booking.room_id,
        booking_id: booking.id,
        resource_type: 'recording',
        title: resourceTitle,
        url: null,
        mime_type: match.mimeType,
        size_bytes: sizeBytes,
        storage_key: storageKey,
        created_by_enrollment_id: null,
      },
      { transaction: t },
    );
    if (onCreated) await onCreated(resource, t);
    await t.commit();

    await emitRoomEvent({
      eventType: ROOM_EVENTS.RecordingAttached,
      aggregateType: 'resource',
      aggregateId: resource.id,
      payload: { room_id: booking.room_id, booking_id: booking.id, resource_type: 'recording', ...eventPayloadExtra },
    });
    log('info', 'recording_ingested', { booking_id: booking.id, resource_id: resource.id, size_bytes: sizeBytes });
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

  const existing = await RoomResource.findOne({
    where: { booking_id: booking.id, resource_type: 'recording' },
  });
  if (existing) return { status: 'already_present', resourceId: existing.id };

  const provider = PROVIDERS[session.meeting_provider || 'google_meet'];
  if (!provider) return { status: 'not_found' };

  const match = preResolvedMatch ?? await provider.findRecording(session);
  if (!match) return { status: 'not_found' };

  return attachRecordingToBooking(
    booking,
    match,
    provider.streamFile,
    session.title || `Session ${session.session_number} recording`,
    { session_id: session.id },
    // Kept in sync for the existing Portal "Watch Recording" button
    // (PortalSessionDetailPage.tsx), which reads LiveSession.recording_url —
    // point it at the same authenticated download route rather than a raw
    // provider link, since the file is now hosted on our own disk. Runs in
    // the same transaction as the resource insert — see attachRecordingToBooking's
    // own comment for why that matters.
    async (resource, transaction) => {
      await session.update(
        { recording_url: `/api/portal/community/rooms/${booking.room_id}/resources/${resource.id}/download` },
        { transaction },
      );
    },
  );
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

  return attachRecordingToBooking(
    booking,
    match,
    (m) => streamZoomFile(m as ZoomRecordingMatch),
    booking.title || 'Room session recording',
    { booking_id: booking.id },
  );
}
