/**
 * The intro video's rules, kept out of the components so they are testable without a camera
 * (kit §3.2): the three prompts, the 90-second recording cap, which recording format this browser
 * can make, and what an upload may be before it is sent.
 */

export const PROMPTS = [
  'Who you are, and the role you want next.',
  'One problem you solved, and what changed because of it.',
  'What you would do in your first 30 days on a new team.',
] as const;

export const MAX_RECORD_SECONDS = 90;
/** Matches HIRE_VIDEO_MAX_BYTES on the server and the edge limit in front of it. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
/** Below this a recording holds no frames at all (a second of real video is tens of KB). */
export const MIN_TAKE_BYTES = 4 * 1024;

/** "0:42". */
export const recClock = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * The first type this browser's MediaRecorder can produce. Chrome and Firefox make WebM; Safari
 * makes MP4. `null` means recording is not possible here, and the studio offers upload instead.
 */
export function pickRecorderType(isSupported: ((t: string) => boolean) | undefined): string | null {
  if (!isSupported) return null;
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return types.find((t) => { try { return isSupported(t); } catch { return false; } }) ?? null;
}

/** The file name a recording is uploaded under; the server only reads its extension. */
export const recordingName = (type: string): string => (type.startsWith('video/mp4') ? 'intro.mp4' : 'intro.webm');

/** A sentence for a file we already know the server will refuse, or null. */
export function uploadProblem(file: { size: number; type: string; name: string }): string | null {
  const isVideo = /^video\//i.test(file.type) || /\.(mp4|m4v|mov|webm|mkv)$/i.test(file.name);
  if (!isVideo) return 'That file is not a video. Try an MP4, MOV or WebM.';
  if (file.size > MAX_UPLOAD_BYTES) return 'That file is over 100 MB. A 90-second video is usually far smaller.';
  if (file.size === 0) return 'That file is empty.';
  return null;
}

/** Which prompt to show at a given point of a recording, when the candidate has not moved on by hand. */
export const promptAt = (index: number): string => PROMPTS[Math.min(Math.max(index, 0), PROMPTS.length - 1)];
