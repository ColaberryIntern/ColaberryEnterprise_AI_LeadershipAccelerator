import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Read a recording's video geometry, so an ingest can say out loud when a file
 * arrives in a shape learners' machines will struggle to play.
 *
 * WHY. On 2026-11-12 a class was recorded at 3840x2160. Every other one of the
 * 180 recordings we hold is 1080p or smaller. 4K H.264 is the heaviest decode
 * path there is, and on a laptop that cannot hardware-decode it the CPU does it
 * in software and the picture stutters continuously. A student reported exactly
 * that on 2026-11-18, and nothing in the pipeline had noticed: the file was
 * downloaded, stored and linked with no idea what was inside it. Its bitrate was
 * only 625 kbps, so every bandwidth-shaped theory was wrong.
 *
 * This records what arrived. It deliberately does NOT re-encode: downscaling a
 * 3-hour file takes ~30 minutes of CPU and belongs in a background job with its
 * own swap and cleanup, not in the webhook that must answer Zoom quickly.
 *
 * ffprobe absence is a normal outcome, not an error. It is present in the
 * backend image; it is not guaranteed in CI or on a developer's machine, and an
 * ingest must never fail because a probe could not run.
 */

/** Anything taller than this decodes in software on a lot of ordinary laptops. */
export const COMFORTABLE_MAX_HEIGHT = 1080;

export interface RecordingGeometry {
  width: number;
  height: number;
  /** Seconds. Null when the container did not report one. */
  durationSeconds: number | null;
  /** True when this needs downscaling before it will play smoothly everywhere. */
  oversized: boolean;
}

export async function probeRecording(filePath: string): Promise<RecordingGeometry | null> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-show_entries', 'format=duration',
      '-of', 'json',
      filePath,
    ], { timeout: 30_000, maxBuffer: 1024 * 1024 });

    const parsed = JSON.parse(stdout);
    const stream = parsed?.streams?.[0];
    const width = Number(stream?.width);
    const height = Number(stream?.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;

    const rawDuration = Number(parsed?.format?.duration);
    return {
      width,
      height,
      durationSeconds: Number.isFinite(rawDuration) ? rawDuration : null,
      oversized: height > COMFORTABLE_MAX_HEIGHT,
    };
  } catch {
    // No ffprobe, a timeout, or a file ffprobe cannot read. The caller treats a
    // null as "we do not know", never as "the recording is bad".
    return null;
  }
}
