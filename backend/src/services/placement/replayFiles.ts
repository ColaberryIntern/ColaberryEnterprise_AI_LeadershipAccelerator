import { Readable } from 'stream';
import { downloadTranscriptBody, getRecordingDetail, isScopeError, parseVtt, pickTranscriptFile, type VttCue } from '../zoom/zoomTranscripts';
import { getZoomAccessToken } from '../zoom/zoomApiClient';

/**
 * Career Prep v27, CP9.2 (kit F5 "replay"): what Zoom holds for a held interview's meeting, through the platform's REAL
 * transcript path (zoom/zoomTranscripts.ts), never ZoomMeetAdapter.getRecording (which answers null). roomProvider.ts
 * exposes these as replayFiles / streamRecording; replayJob.ts calls the first, the replay recording route the second.
 *
 *   replayFiles    ONE GET /meetings/{id}/recordings: the transcript (TRANSCRIPT, the CC track only as a fallback) AND the
 *                  MP4 come from the file list of that SAME recording (zoomService.pickBestMp4 over it), so the video
 *                  played back is always the recording the transcript was scored from (T24 fold 3; a host-wide listing
 *                  such as findRecordingByMeetingId could hand back another instance of the meeting). The MP4's location
 *                  is kept on the server (interview_replays.recording) and NEVER sent to a browser.
 *   streamRecording  the stored file, with the server-to-server token, forwarding a byte Range (206 + Content-Range when
 *                  Zoom honors it), bounded: no answer from Zoom in 30 seconds ABORTS the request (AbortController) and is
 *                  a TimeoutError; the caller may abort it too (the viewer left). Playback only: never analyzed.
 * A missing Zoom permission surfaces as ReplayScopeError (isScopeError on Zoom's message), so the job records
 * "replay unavailable: Zoom permission" once instead of retrying. "Not there yet" (Zoom's 404 / code 3301) is null.
 * zoomService is loaded only here, lazily: it pulls in the app's models.
 */
export interface StoredRecording { downloadUrl: string; sizeBytes: number | null; providerFileId: string | null; recordingId?: string | null }
export interface ReplayTranscript { cues: VttCue[]; kind: 'TRANSCRIPT' | 'CC' }
export interface ReplayFiles { transcript: ReplayTranscript | null; recording: StoredRecording | null }
export interface RecordingStream { status: 200 | 206; headers: Record<string, string>; body: Readable }

export const STREAM_CONNECT_MS = 30_000;
export const RANGE = /^bytes=\d*-\d*$/;

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

export async function fetchReplayFiles(meetingId: string): Promise<ReplayFiles> {
  const detail = await guarded(() => getRecordingDetail(meetingId));
  if (!detail) return { transcript: null, recording: null };
  const { pickBestMp4 } = await import('../zoomService');
  type File = { id?: string; download_url: string; file_type: string; file_size: number; recording_type?: string };
  const mp4 = pickBestMp4<File>((detail.recording_files ?? []).map((f) => ({ ...f, file_size: f.file_size ?? 0 })) as readonly File[]);
  const recording: StoredRecording | null = mp4 ? { downloadUrl: mp4.download_url, sizeBytes: mp4.file_size || null, providerFileId: mp4.id ?? null, recordingId: detail.uuid ?? null } : null;
  const picked = pickTranscriptFile(detail.recording_files);
  if (!picked) return { transcript: null, recording };
  const body = await guarded(() => downloadTranscriptBody(picked.file));
  return { transcript: body === null ? null : { cues: parseVtt(body), kind: picked.kind }, recording };
}

const timeoutError = () => Object.assign(new Error('Zoom did not answer the recording request in time'), { name: 'TimeoutError' });

/** The stored MP4 through our server. `range` is forwarded only when it is a plain bytes range. */
export async function streamStoredRecording(rec: StoredRecording, opts: { range?: string; connectMs?: number; signal?: AbortSignal } = {}): Promise<RecordingStream> {
  const controller = new AbortController();
  const onCallerAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onCallerAbort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, opts.connectMs ?? STREAM_CONNECT_MS);
  try {
    const token = await getZoomAccessToken();
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (opts.range && RANGE.test(opts.range)) headers.Range = opts.range;
    const res = await fetch(rec.downloadUrl, { headers, signal: controller.signal });
    if (!(res.ok || res.status === 206) || !res.body) throw Object.assign(new Error(`Zoom recording download error ${res.status}`), { name: 'UpstreamUnavailable' });
    const out: Record<string, string> = { 'Content-Type': 'video/mp4', 'Accept-Ranges': res.headers.get('accept-ranges') === 'bytes' || res.status === 206 ? 'bytes' : 'none' };
    const len = res.headers.get('content-length') ?? (res.status === 200 && rec.sizeBytes ? String(rec.sizeBytes) : null);
    if (len) out['Content-Length'] = len;
    const cr = res.headers.get('content-range');
    if (res.status === 206 && cr) out['Content-Range'] = cr;
    return { status: res.status === 206 && cr ? 206 : 200, headers: out, body: Readable.fromWeb(res.body as never) };
  } catch (err) {
    if (timedOut) throw timeoutError();
    throw err;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onCallerAbort);
  }
}
