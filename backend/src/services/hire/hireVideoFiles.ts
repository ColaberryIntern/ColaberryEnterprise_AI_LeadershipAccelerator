/**
 * hireVideoFiles - where a candidate's intro video lives on disk, and the only shapes of path
 * and URL it may take (kit §3.2, §4.3).
 *
 * WHY HERE. colaberry/video-analysis is an analysis worker (S3 in, metrics out); it has no
 * upload, transcode or public-playback API. The kit's fallback is "the same media path the
 * site already serves from", so the rendition, poster and captions live on the backend's
 * `uploads` volume and are served by publicHireVideoRoutes.
 *
 * SAFE BY GRAMMAR. An asset id is 24 lowercase hex characters minted here, and a file is one of
 * three fixed names. `assetDir` asserts the resolved directory sits under the root before
 * anything is opened, so even a grammar bug cannot reach another file.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const HIRE_VIDEO_ROOT = path.resolve(process.env.HIRE_VIDEO_DIR || path.join(process.cwd(), 'uploads', 'hire-video'));

export const VIDEO_FILES = {
  stream: { name: 'stream.mp4', type: 'video/mp4' },
  poster: { name: 'poster.jpg', type: 'image/jpeg' },
  captions: { name: 'captions.vtt', type: 'text/vtt; charset=utf-8' },
} as const;
export type VideoFileKind = keyof typeof VIDEO_FILES;

const ASSET_ID = /^[0-9a-f]{24}$/;

export const newAssetId = (): string => crypto.randomBytes(12).toString('hex');
export const isAssetId = (v: unknown): v is string => typeof v === 'string' && ASSET_ID.test(v);
export const isVideoFileKind = (v: unknown): v is VideoFileKind =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(VIDEO_FILES, v);

/** The asset's directory. Throws on anything but a well-formed id under the root. */
export function assetDir(id: string, root = HIRE_VIDEO_ROOT): string {
  if (!isAssetId(id)) throw new Error('invalid video asset id');
  const dir = path.resolve(root, id);
  if (path.dirname(dir) !== path.resolve(root)) throw new Error('video asset escapes its root');
  return dir;
}

export const assetFile = (id: string, kind: VideoFileKind, root = HIRE_VIDEO_ROOT): string =>
  path.join(assetDir(id, root), VIDEO_FILES[kind].name);

/** The origin-relative URL stored on the row; the hire site resolves it against the API origin. */
export const assetUrl = (id: string, kind: VideoFileKind): string => `/api/public/hire/video/${id}/${kind}`;

/** Removes an asset's directory. Never throws: a stale directory is a disk cost, not an outage. */
export async function removeAsset(id: string | null | undefined, root = HIRE_VIDEO_ROOT): Promise<void> {
  if (!isAssetId(id)) return;
  try {
    await fs.promises.rm(assetDir(id, root), { recursive: true, force: true });
  } catch (err: unknown) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event: 'hire_video_remove_failed',
      outcome: 'failure', error_class: err instanceof Error ? err.name : 'Error', context: { assetId: id },
    }));
  }
}
