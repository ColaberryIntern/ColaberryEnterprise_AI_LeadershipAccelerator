import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { ROOM_RECORDING_DIR } from '../../config/upload';
import { sampleOffsets, pickBestFrame, type FrameCandidate } from './frameScore';

/**
 * A STILL WORTH SHOWING, PULLED OUT OF THE RECORDING ITSELF.
 *
 * The feed card used the frame at one second until Ali pointed out the hole: that
 * frame is black whenever the learner had their camera off, and a bare desktop
 * whenever the screen share had not started. `frameScore.ts` decides WHICH frame
 * is worth showing; this module is the part that has to touch ffmpeg and the disk.
 *
 * GENERATED ON DEMAND AND CACHED, not at ingest. Three reasons: every recording
 * that already exists gets a thumbnail without a backfill job; a failure costs one
 * cold card rather than a stuck ingest; and nothing is spent on takes nobody ever
 * publishes, which so far is most of them.
 *
 * NEVER ON THE REQUEST'S CRITICAL PATH FOR CORRECTNESS. A thumbnail that cannot be
 * made is a missing picture, never an error page — every failure here returns null
 * and the card falls back to the poster-less player it has today.
 *
 * EVERY ffmpeg INVOCATION IS ARGUMENT-ARRAY SPAWNED AND TIME-CAPPED. A learner
 * does not supply the path, but a filename reaching a shell is the kind of thing
 * that is safe until the day somebody changes how storage keys are built, and a
 * decoder handed a truncated upload can spin for a very long time.
 */

const FFMPEG_TIMEOUT_MS = 20_000;
const THUMB_WIDTH = 640;

/** Beside the recordings, in their own directory so a sweep can tell them apart. */
const THUMB_DIR = path.join(ROOM_RECORDING_DIR, '.thumbnails');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function thumbnailPathFor(recordingId: string): string {
  return path.join(THUMB_DIR, `${recordingId}.jpg`);
}

/** Run ffmpeg with an argument array and a hard timeout. Never a shell string. */
function runFfmpeg(args: string[], timeoutMs = FFMPEG_TIMEOUT_MS): Promise<{ ok: boolean; stdout: Buffer }> {
  return new Promise((resolve) => {
    let settled = false;
    const chunks: Buffer[] = [];
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'ignore'] });

    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve({ ok, stdout: Buffer.concat(chunks) });
    };

    const timer = setTimeout(() => {
      // A truncated or malformed file can keep a decoder busy indefinitely. Kill
      // it and report failure rather than holding a request open.
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      done(false);
    }, timeoutMs);

    child.stdout.on('data', (c: Buffer) => chunks.push(c));
    child.on('error', () => { clearTimeout(timer); done(false); });
    child.on('close', (code) => { clearTimeout(timer); done(code === 0); });
  });
}

/**
 * The grayscale histogram of one frame, as 256 counts.
 *
 * Decoded straight to raw 8-bit gray at a tiny size and counted in-process: the
 * score only needs tonal distribution, so a 64x36 sample answers the same question
 * as a full frame for a fraction of the work.
 */
async function histogramAt(filePath: string, atSeconds: number): Promise<number[] | null> {
  const { ok, stdout } = await runFfmpeg([
    // `-ss` BEFORE `-i` seeks by keyframe, which is approximate and enormously
    // faster. Approximate is correct here — the question is "is there anything on
    // screen around here", not "exactly this frame".
    '-ss', String(atSeconds),
    '-i', filePath,
    '-frames:v', '1',
    '-vf', 'scale=64:36',
    '-pix_fmt', 'gray',
    '-f', 'rawvideo',
    '-v', 'error',
    'pipe:1',
  ]);
  if (!ok || stdout.length === 0) return null;

  const hist = new Array(256).fill(0);
  for (let i = 0; i < stdout.length; i += 1) hist[stdout[i]] += 1;
  return hist;
}

export interface ThumbnailResult {
  path: string;
  atSeconds: number;
  score: number;
  /** True when this call produced it; false when a cached file was reused. */
  generated: boolean;
}

/**
 * Ensure a thumbnail exists for this recording, and say where it is.
 *
 * Returns null when there is no frame worth showing — a camera-off recording is
 * black from end to end, and the caller is expected to fall back to a generated
 * card rather than show a dark rectangle.
 */
export async function ensureThumbnail(
  recordingId: string,
  /**
   * The absolute path the playback resolver already produced. Taken rather than
   * re-derived: that resolver basename-guards the storage key, and deriving the
   * path twice means two places that must agree about what is safe.
   */
  source: string,
  durationSeconds: number | null,
): Promise<ThumbnailResult | null> {
  if (!UUID.test(recordingId)) return null;
  if (!source || !fs.existsSync(source)) return null;

  const out = thumbnailPathFor(recordingId);
  // Cached. The recording is immutable once ingested, so a thumbnail never goes
  // stale and there is nothing to invalidate.
  if (fs.existsSync(out)) {
    return { path: out, atSeconds: -1, score: -1, generated: false };
  }

  const offsets = sampleOffsets(durationSeconds);
  const candidates: FrameCandidate[] = [];
  for (const atSeconds of offsets) {
    const histogram = await histogramAt(source, atSeconds);
    if (histogram) candidates.push({ atSeconds, histogram });
  }

  const best = pickBestFrame(candidates);
  // Every frame blank. Null is the honest answer; see the module note.
  if (!best) return null;

  try { fs.mkdirSync(THUMB_DIR, { recursive: true }); } catch { /* exists */ }

  const { ok } = await runFfmpeg([
    '-ss', String(best.atSeconds),
    '-i', source,
    '-frames:v', '1',
    '-vf', `scale=${THUMB_WIDTH}:-2`,
    '-q:v', '4',
    '-v', 'error',
    '-y', out,
  ]);
  if (!ok || !fs.existsSync(out)) return null;

  return { path: out, atSeconds: best.atSeconds, score: best.score, generated: true };
}
