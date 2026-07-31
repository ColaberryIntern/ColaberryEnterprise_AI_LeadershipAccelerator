import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { sequelize } from '../config/database';
import LiveSession from '../models/LiveSession';
import RoomBooking from '../models/RoomBooking';
import RoomResource from '../models/RoomResource';
import { ROOM_RECORDING_DIR, MAX_ROOM_RECORDING_SIZE } from '../config/upload';
import { ensureRoomForSession } from './communityRooms/roomService';
import { emitRoomEvent } from './communityRooms/roomOutboxService';
import { ROOM_EVENTS } from './communityRooms/roomEvents';
import { log } from './communityRooms/roomShared';
import { findRecordingForSession, streamDriveFile } from './driveService';

// Bridges the accelerator's LiveSession lifecycle to the Rooms domain's
// RoomResource/RoomBooking, so a completed class's Google Meet recording ends
// up as a downloadable resource in that class's room — automatically.

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

// No-op-safe: running this twice for the same session never re-downloads or
// duplicates a resource (checks for an existing recording first), and a
// "not found" result is a normal outcome — Meet recording is a manual toggle
// a host may not have used for a given class.
export async function ingestRecordingForSession(session: LiveSession): Promise<IngestResult> {
  const booking = await ensureBookingForSession(session);

  const existing = await RoomResource.findOne({
    where: { booking_id: booking.id, resource_type: 'recording' },
  });
  if (existing) return { status: 'already_present', resourceId: existing.id };

  const match = await findRecordingForSession(session);
  if (!match) return { status: 'not_found' };

  if (match.sizeBytes && match.sizeBytes > MAX_ROOM_RECORDING_SIZE) {
    log('warn', 'recording_exceeds_size_cap', { session_id: session.id, size: match.sizeBytes, cap: MAX_ROOM_RECORDING_SIZE });
    return { status: 'not_found' };
  }

  const ext = path.extname(match.name) || '.mp4';
  const storageKey = `${crypto.randomUUID()}${ext}`;
  const destPath = path.join(ROOM_RECORDING_DIR, storageKey);

  // Stream Drive -> disk directly; never buffer the file in memory (this
  // process runs with a 512MB heap cap).
  const source = await streamDriveFile(match.fileId);
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
        title: session.title || `Session ${session.session_number} recording`,
        url: null,
        mime_type: match.mimeType,
        size_bytes: sizeBytes,
        storage_key: storageKey,
        created_by_enrollment_id: null,
      },
      { transaction: t },
    );
    // Kept in sync for the existing Portal "Watch Recording" button
    // (PortalSessionDetailPage.tsx), which reads LiveSession.recording_url —
    // point it at the same authenticated download route rather than a raw
    // Drive link, since the file is now hosted on our own disk.
    await session.update(
      { recording_url: `/api/portal/community/rooms/${booking.room_id}/resources/${resource.id}/download` },
      { transaction: t },
    );
    await t.commit();

    await emitRoomEvent({
      eventType: ROOM_EVENTS.RecordingAttached,
      aggregateType: 'resource',
      aggregateId: resource.id,
      payload: { room_id: booking.room_id, booking_id: booking.id, resource_type: 'recording', session_id: session.id },
    });
    log('info', 'recording_ingested', { session_id: session.id, resource_id: resource.id, size_bytes: sizeBytes });
    return { status: 'ingested', resourceId: resource.id };
  } catch (err) {
    await t.rollback();
    // Clean up the downloaded file on failure so a retry doesn't orphan disk space.
    try { fs.unlinkSync(destPath); } catch { /* best-effort */ }
    throw err;
  }
}
