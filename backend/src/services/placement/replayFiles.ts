import type { Readable } from 'stream';
import { downloadTranscriptBody, getRecordingDetail, isScopeError, parseVtt, pickTranscriptFile, type VttCue } from '../zoom/zoomTranscripts';

/**
 * Career Prep v27, CP9.2 (kit F5 "replay"): what Zoom holds for a held interview's meeting, through the platform's REAL
 * transcript path (zoom/zoomTranscripts.ts) and zoomService's recording match and stream (never
 * ZoomMeetAdapter.getRecording, which answers null). roomProvider.ts exposes these as transcript / recordingFile /
 * streamRecording; replayJob.ts is the only caller of the first two, the replay recording route of the third.
 *
 *   transcript     GET /meetings/{id}/recordings, its TRANSCRIPT file (the CC track only as a fallback), downloaded with
 *                  the server-to-server token and parsed into cues. null = Zoom has no transcript for it (yet).
 *   recordingFile  zoomService.findRecordingByMeetingId over the interview's date: the MP4's download location, kept on
 *                  the server (interview_replays.recording) and NEVER sent to a browser. null = no MP4 (yet).
 *   streamRecording  zoomService.streamZoomFile for that stored location, bounded: no answer from Zoom in 30 seconds is a
 *                  TimeoutError (the bytes then stream as they come). Playback only: the video is never analyzed.
 * A missing Zoom permission surfaces as ReplayScopeError (isScopeError on Zoom's message), so the job records
 * "replay unavailable: Zoom permission" once instead of retrying. "Not there yet" (Zoom's 404 / code 3301) is null.
 * zoomService is loaded only here, lazily: it pulls in the app's models.
 */
export interface StoredRecording { downloadUrl: string; sizeBytes: number | null; providerFileId: string | null }
export interface ReplayTranscript { cues: VttCue[]; kind: 'TRANSCRIPT' | 'CC' }

export const STREAM_CONNECT_MS = 30_000;

export class ReplayScopeError extends Error {
  constructor(message: string) { super(message); this.name = 'ReplayScopeError'; }
}

const notThereYet = (err: unknown): boolean => /^Zoom (?:API|transcript download) error 404\b|"code":\s*3301\b/.test(err instanceof Error ? err.message : String(err));

/** Zoom's permission error as ReplayScopeError; "not there yet" as null; anything else is thrown as it came. */
async function guarded<T>(call: () => Promise<T>): Promise<T | null> {
  try {
    return await call();
  } catch (err) {
    if (isScopeError(err)) throw new ReplayScopeError((err as Error).message);
    if (notThereYet(err)) return null;
    throw err;
  }
}

export async function fetchTranscript(meetingId: string): Promise<ReplayTranscript | null> {
  const detail = await guarded(() => getRecordingDetail(meetingId));
  const picked = pickTranscriptFile(detail?.recording_files);
  if (!picked) return null;
  const body = await guarded(() => downloadTranscriptBody(picked.file));
  if (body === null) return null;
  return { cues: parseVtt(body), kind: picked.kind };
}

/** The interview's UTC date: findRecordingByMeetingId lists that day and the next, so a late Central start is covered. */
export const recordingDateHint = (startsAt: Date): string => startsAt.toISOString().slice(0, 10);

export async function fetchRecordingFile(meetingId: string, startsAt: Date): Promise<StoredRecording | null> {
  const { findRecordingByMeetingId } = await import('../zoomService');
  const match = await guarded(() => findRecordingByMeetingId(String(meetingId), recordingDateHint(startsAt)));
  if (!match) return null;
  return { downloadUrl: match.downloadUrl, sizeBytes: match.sizeBytes ?? null, providerFileId: match.providerFileId ?? null };
}

export async function streamStoredRecording(rec: StoredRecording, connectMs = STREAM_CONNECT_MS): Promise<Readable> {
  const { streamZoomFile } = await import('../zoomService');
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('Zoom did not answer the recording request in time'), { name: 'TimeoutError' })), connectMs);
  });
  try {
    return await Promise.race([
      streamZoomFile({ downloadUrl: rec.downloadUrl, name: 'interview.mp4', mimeType: 'video/mp4', sizeBytes: rec.sizeBytes }),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
