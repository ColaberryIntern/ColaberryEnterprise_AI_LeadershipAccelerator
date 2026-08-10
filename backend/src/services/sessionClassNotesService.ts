import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Op } from 'sequelize';
import LiveSession from '../models/LiveSession';
import RoomResource from '../models/RoomResource';
import { ROOM_RESOURCE_DIR } from '../config/upload';
import { renderSessionKitDoc } from './sessionKitDocService';
// resolveSessionRoomId is shared with the recording path — recordings and
// notes must land in the SAME room as each other, and both had the same bug.
import { ensureBookingForSession, resolveSessionRoomId } from './sessionRecordingService';
import { emitRoomEvent } from './communityRooms/roomOutboxService';
import { ROOM_EVENTS } from './communityRooms/roomEvents';
import { log } from './communityRooms/roomShared';

/**
 * Class Notes — the standalone teaching deck, attached to the class Room after
 * the session ends.
 *
 * Why this exists: Sessions 1-4 were taught on Google Meet, whose recordings
 * are not recoverable (the account upgrade needed to retain them was not
 * bought, which is why the programme moved to Zoom). Those classes will never
 * have video. The deck that was actually taught from is the next best record
 * of what happened in the room, and it already exists — it is the same HTML the
 * admin "Present ▾ → Download standalone HTML" button produces
 * (renderSessionKitDoc in 'standalone' mode: live pulse off, self-contained,
 * openable offline).
 *
 * Stored as a normal `file` resource so it appears in the Room's Docs & Files
 * tab and downloads through the same Bearer-gated route as everything else —
 * no new surface, no new auth path.
 *
 * Deliberately a SNAPSHOT, not a live view: it is written once when the class
 * completes and then left alone, so "Class Notes" always reflects what was
 * taught that night rather than silently changing if the deck is edited later.
 * Pass `force` to deliberately re-snapshot.
 */

export interface ClassNotesResult {
  status: 'attached' | 'already_present' | 'not_found';
  resourceId?: string;
}

const CLASS_NOTES_SOURCE = 'class_notes';

/** The existing Class Notes snapshot for a session, if one has been taken. */
async function findExisting(roomId: string, sessionId: string): Promise<RoomResource | null> {
  return RoomResource.findOne({
    where: {
      room_id: roomId,
      resource_type: 'file',
      metadata: { [Op.contains]: { source: CLASS_NOTES_SOURCE, session_id: sessionId } } as unknown as Record<string, unknown>,
    },
  });
}

export async function attachClassNotesForSession(
  session: LiveSession,
  opts: { force?: boolean } = {},
): Promise<ClassNotesResult> {
  const booking = await ensureBookingForSession(session);
  const roomId = await resolveSessionRoomId(session, booking.room_id);

  const existing = await findExisting(roomId, session.id);
  if (existing && !opts.force) return { status: 'already_present', resourceId: existing.id };

  const html = await renderSessionKitDoc(session.id, 'standalone');
  if (!html) return { status: 'not_found' };

  const storageKey = `${crypto.randomUUID()}.html`;
  const destPath = path.join(ROOM_RESOURCE_DIR, storageKey);
  fs.mkdirSync(ROOM_RESOURCE_DIR, { recursive: true });
  fs.writeFileSync(destPath, html, 'utf8');
  const sizeBytes = Buffer.byteLength(html, 'utf8');

  const title = `Class Notes — ${session.title || `Session ${session.session_number}`}`;

  try {
    if (existing) {
      // force re-snapshot: point the SAME resource at the new file so any link
      // already shared with students keeps working, then drop the old bytes.
      const oldKey = existing.storage_key;
      await existing.update({ title, storage_key: storageKey, size_bytes: sizeBytes, mime_type: 'text/html' });
      if (oldKey && oldKey !== storageKey) {
        try { fs.unlinkSync(path.join(ROOM_RESOURCE_DIR, oldKey)); } catch { /* best-effort */ }
      }
      log('info', 'class_notes_refreshed', { session_id: session.id, resource_id: existing.id, size_bytes: sizeBytes });
      return { status: 'attached', resourceId: existing.id };
    }

    const resource = await RoomResource.create({
      room_id: roomId,
      booking_id: booking.id,
      resource_type: 'file',
      title,
      mime_type: 'text/html',
      size_bytes: sizeBytes,
      storage_key: storageKey,
      metadata: { source: CLASS_NOTES_SOURCE, session_id: session.id },
    } as any);

    // Best-effort, exactly like the recording path — a feed hiccup must never
    // undo a snapshot that is already on disk and in the table. Shape mirrors
    // attachRecording's emit; ArtifactShared is the resource-level event
    // (RecordingAttached is video-specific).
    try {
      await emitRoomEvent({
        eventType: ROOM_EVENTS.ArtifactShared,
        aggregateType: 'resource',
        aggregateId: resource.id,
        payload: { room_id: roomId, booking_id: booking.id, resource_type: 'file', title, source: CLASS_NOTES_SOURCE },
      });
    } catch (err: any) {
      log('warn', 'class_notes_event_failed', { session_id: session.id, message: err?.message });
    }

    log('info', 'class_notes_attached', { session_id: session.id, resource_id: resource.id, size_bytes: sizeBytes });
    return { status: 'attached', resourceId: resource.id };
  } catch (err) {
    // Never leave an orphan file behind if the row could not be written.
    try { fs.unlinkSync(destPath); } catch { /* best-effort */ }
    throw err;
  }
}

/**
 * Backfill/sweep: snapshot Class Notes for every completed session that has
 * none yet. Used both by the post-class cron and for the one-off backfill of
 * classes already taught. Never throws for a single bad session — one deck
 * failing to render must not stop the rest.
 */
export async function attachClassNotesForCompletedSessions(
  opts: { cohortId?: string; sinceDays?: number; force?: boolean } = {},
): Promise<{ attached: number; alreadyPresent: number; failed: number }> {
  const where: Record<string, unknown> = { status: 'completed' };
  if (opts.cohortId) where.cohort_id = opts.cohortId;
  if (opts.sinceDays) {
    where.session_date = {
      [Op.gte]: new Date(Date.now() - opts.sinceDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    };
  }

  const sessions = await LiveSession.findAll({ where, order: [['session_number', 'ASC']] });
  let attached = 0, alreadyPresent = 0, failed = 0;

  for (const session of sessions) {
    try {
      const result = await attachClassNotesForSession(session, { force: opts.force });
      if (result.status === 'attached') attached++;
      else if (result.status === 'already_present') alreadyPresent++;
    } catch (err: any) {
      failed++;
      log('warn', 'class_notes_failed', { session_id: session.id, message: err?.message });
    }
  }

  return { attached, alreadyPresent, failed };
}
