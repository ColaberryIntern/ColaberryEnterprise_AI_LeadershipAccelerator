import { google } from 'googleapis';
import type { drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import { env } from '../config/env';
import LiveSession from '../models/LiveSession';

// Read-only Google Drive access for locating Meet recordings. Mirrors the
// impersonation pattern proven in calendarService.ts's getCalendarClient() —
// a bare service-account JWT cannot see another user's Drive; it must
// impersonate the calendar owner via the SAME domain-wide delegation already
// authorized for Calendar, extended to include drive.readonly.
function getAuthClient() {
  if (!env.googleServiceAccountEmail || !env.googlePrivateKey) {
    throw new Error('Google Drive not configured');
  }
  return new google.auth.JWT({
    email: env.googleServiceAccountEmail,
    key: env.googlePrivateKey,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    subject: env.googleCalendarOwnerEmail || undefined,
  });
}

export interface DriveRecordingMatch {
  fileId: string;
  name: string;
  mimeType: string;
  sizeBytes: number | null;
  createdTime: string;
}

// Meet recordings land in the organizer's "Meet Recordings" Drive folder,
// named like "<meeting title> (YYYY/MM/DD HH:MM TZ) - Recording". There is no
// per-session Calendar event to key off (classes share one persistent room
// event), so we match by proximity: the recording's createdTime should fall
// shortly after the session's scheduled end (allowing for Meet's processing
// lag), within a generous window.
const MATCH_WINDOW_BEFORE_MS = 15 * 60 * 1000; // session could start recording a few min early
const MATCH_WINDOW_AFTER_MS = 6 * 60 * 60 * 1000; // Meet can take hours to finish processing

function sessionWindow(session: LiveSession): { start: Date; end: Date } {
  const start = new Date(`${session.session_date}T${session.start_time}`);
  const end = new Date(`${session.session_date}T${session.end_time}`);
  return {
    start: new Date(start.getTime() - MATCH_WINDOW_BEFORE_MS),
    end: new Date(end.getTime() + MATCH_WINDOW_AFTER_MS),
  };
}

async function findMeetRecordingsFolderId(drive: drive_v3.Drive): Promise<string | null> {
  const res = await drive.files.list({
    q: "name = 'Meet Recordings' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
    fields: 'files(id, name)',
    pageSize: 1,
  });
  return res.data.files?.[0]?.id || null;
}

// Returns the best-matching recording for a session, or null if none is found
// (which is a normal outcome — recording is a manual toggle a host may not
// have used). Never throws for "not found"; only for real API/config failures.
export async function findRecordingForSession(session: LiveSession): Promise<DriveRecordingMatch | null> {
  const auth = getAuthClient();
  const drive = google.drive({ version: 'v3', auth });
  const { start, end } = sessionWindow(session);

  const folderId = await findMeetRecordingsFolderId(drive);
  const q = folderId
    ? `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`
    : "mimeType contains 'video/' and trashed = false and name contains 'Recording'";

  const res = await drive.files.list({
    q,
    fields: 'files(id, name, mimeType, size, createdTime)',
    orderBy: 'createdTime desc',
    pageSize: 50,
  });

  const candidates = (res.data.files || []).filter((f) => {
    if (!f.createdTime) return false;
    const created = new Date(f.createdTime);
    return created >= start && created <= end;
  });
  if (!candidates.length) return null;

  // Closest to the session's actual end time wins when more than one file
  // falls in the window (e.g. two classes back-to-back in the same room).
  const sessionEnd = new Date(`${session.session_date}T${session.end_time}`).getTime();
  candidates.sort((a, b) => {
    const da = Math.abs(new Date(a.createdTime as string).getTime() - sessionEnd);
    const db = Math.abs(new Date(b.createdTime as string).getTime() - sessionEnd);
    return da - db;
  });

  const best = candidates[0];
  return {
    fileId: best.id as string,
    name: best.name || 'recording.mp4',
    mimeType: best.mimeType || 'video/mp4',
    sizeBytes: best.size ? Number(best.size) : null,
    createdTime: best.createdTime as string,
  };
}

// Streams a Drive file's bytes — never buffers the whole file in memory (the
// backend process runs with a 512MB heap cap; a multi-hundred-MB recording
// would risk crashing it if loaded as a single buffer).
export async function streamDriveFile(fileId: string): Promise<Readable> {
  const auth = getAuthClient();
  const drive = google.drive({ version: 'v3', auth });
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' },
  );
  return res.data as unknown as Readable;
}
