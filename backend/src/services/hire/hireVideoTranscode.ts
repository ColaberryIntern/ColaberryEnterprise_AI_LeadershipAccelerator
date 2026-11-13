/**
 * hireVideoTranscode - turns whatever the candidate recorded or uploaded into one web rendition
 * and a poster frame (kit §3.2): H.264/AAC MP4 at most 720 px tall with `+faststart` (so playback
 * starts before the file is fully fetched), and a JPEG taken from the opening seconds.
 *
 * ffmpeg is already in the backend image (backend/Dockerfile). Every call goes through execFile
 * with an argument array - never a shell string - and an explicit timeout, so a hostile file can
 * neither inject a command nor hang a worker.
 *
 * DURATION IS MEASURED ON THE OUTPUT. A Chrome MediaRecorder WebM carries no duration in its
 * header (ffprobe says "N/A"), so probing the input is unreliable. Instead the transcode is cut at
 * MAX_SECONDS + 1 (bounding the work), and the rendition is probed: longer than MAX_SECONDS is
 * refused, anything under MIN_SECONDS is refused.
 */
import { execFile } from 'child_process';
import path from 'path';
import { VIDEO_FILES } from './hireVideoFiles';

/** The kit's target is 90 seconds; the coaching says when a video runs over. This is the hard stop. */
export const TARGET_SECONDS = 90;
export const MAX_SECONDS = 180;
export const MIN_SECONDS = 3;

const TRANSCODE_TIMEOUT_MS = 180_000;
const PROBE_TIMEOUT_MS = 15_000;
const POSTER_TIMEOUT_MS = 30_000;

export type Runner = (cmd: string, args: readonly string[], timeoutMs: number) => Promise<string>;

export const execRunner: Runner = (cmd, args, timeoutMs) => new Promise((resolve, reject) => {
  execFile(cmd, [...args], { timeout: timeoutMs, maxBuffer: 1024 * 1024, windowsHide: true }, (err, stdout) => {
    if (err) reject(err); else resolve(String(stdout));
  });
});

/** A refusal the candidate can act on, answered as 400 with this sentence. */
export class VideoRejectedError extends Error {
  readonly status = 400;
  readonly error_class = 'ValidationError';
  constructor(message: string) { super(message); this.name = 'VideoRejectedError'; }
}

export function transcodeArgs(input: string, output: string): string[] {
  return [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-t', String(MAX_SECONDS + 1),
    '-map', '0:v:0', '-map', '0:a:0?',
    '-vf', "scale=w=-2:h='min(720,ih)'",
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', output,
  ];
}

export const probeArgs = (file: string): string[] =>
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file];

export const posterArgs = (stream: string, poster: string, atSeconds: number): string[] =>
  ['-hide_banner', '-loglevel', 'error', '-y', '-ss', atSeconds.toFixed(2), '-i', stream, '-frames:v', '1', '-q:v', '3', poster];

export interface Rendition { readonly seconds: number }

/** Writes stream.mp4 and poster.jpg into `dir`. Throws VideoRejectedError for a file we will not keep. */
export async function makeRendition(input: string, dir: string, run: Runner = execRunner): Promise<Rendition> {
  const stream = path.join(dir, VIDEO_FILES.stream.name);
  try {
    await run('ffmpeg', transcodeArgs(input, stream), TRANSCODE_TIMEOUT_MS);
  } catch {
    throw new VideoRejectedError('We could not read that file as a video. Try an MP4, MOV or WebM.');
  }
  const seconds = Number.parseFloat((await run('ffprobe', probeArgs(stream), PROBE_TIMEOUT_MS)).trim());
  if (!Number.isFinite(seconds) || seconds < MIN_SECONDS) {
    throw new VideoRejectedError('That video is too short. Aim for about 90 seconds.');
  }
  if (seconds > MAX_SECONDS + 0.5) {
    throw new VideoRejectedError(`That video is over ${MAX_SECONDS / 60} minutes. Aim for about 90 seconds.`);
  }
  await run('ffmpeg', posterArgs(stream, path.join(dir, VIDEO_FILES.poster.name), Math.min(1.5, seconds / 3)), POSTER_TIMEOUT_MS);
  return { seconds: Math.round(seconds) };
}
