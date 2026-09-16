import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * mediaStore — where the bytes of a social post's media live (ESC-003, Option A).
 *
 * THE SEAM. This is the one module that knows media is on a local volume. Every caller uses
 * `put`, `read`, `exists` and `signedUrl`; none of them builds a path. When Ali chooses object
 * storage (Cloudflare R2 is the noted next step), this file changes and nothing else does -
 * the same design that made ESC-001's KMS path a re-wrap rather than a rewrite.
 *
 * CONTENT-ADDRESSED. The storage key is `media/<brand>/<sha256>.<ext>`. Naming a file by its
 * own checksum means: the `(brand, checksum)` unique index and the path can never disagree; a
 * re-upload of the same bytes is a no-op rather than a duplicate; and a corrupted file is
 * detectable on read by re-hashing, which `read` does. It also makes the key safe to expose in
 * a URL - it carries no filename an operator typed and nothing sequential to enumerate.
 *
 * PER-BRAND DIRECTORIES, not per-tenant, for the same reason the unique index is per brand:
 * two brands may legitimately hold the same image, and deduping across them would let one
 * brand's library leak into another's.
 *
 * SIGNED URLS exist for exactly one consumer: Instagram's publishing API fetches the image
 * from a URL we supply. Every other provider takes bytes pushed to it. The URL is an HMAC over
 * `(key, expiry)` under the app's JWT secret - the same construction as the LinkedIn OAuth
 * state - served by a PUBLIC route (it has to be; Instagram has no session) that verifies the
 * signature and refuses anything expired. Nothing is listable, and a leaked URL dies with its
 * window.
 *
 * FAILURE MODES:
 *   - Disk full -> `put` throws `MediaStoreError` with class `StorageFull`; the upload is
 *     refused with a readable message and nothing else on the box is affected (the volume is
 *     on the data disk, not root).
 *   - Bytes on disk do not match the key's checksum -> `read` throws `MediaCorrupt`. The
 *     caller marks the item as needing attention rather than publishing a file that is not
 *     what the operator approved.
 *   - The volume is NOT in any backup job (checked 2026-09-15). Durability is that of the
 *     disk until Ali decides otherwise; stated in ESC-003, not hidden here.
 */

export const MEDIA_ROOT = process.env.MEDIA_ROOT || '/app/uploads/media';

/** The only types we accept. SVG is excluded on purpose: LinkedIn rejects it and it can carry scripts. */
export type MediaKind = 'image' | 'video' | 'document';

export const ALLOWED_MEDIA: Readonly<Record<string, { ext: string; kind: MediaKind }>> = {
  'image/png': { ext: 'png', kind: 'image' },
  'image/jpeg': { ext: 'jpg', kind: 'image' },
  'image/gif': { ext: 'gif', kind: 'image' },
  'video/mp4': { ext: 'mp4', kind: 'video' },
  // LinkedIn's document post (the swipeable carousel). PDF only: PPTX/DOCX would be converted
  // on LinkedIn's side into something the operator never previewed.
  'application/pdf': { ext: 'pdf', kind: 'document' },
};

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
/** LinkedIn's own document limit. */
export const MAX_DOCUMENT_BYTES = 100 * 1024 * 1024;
const MAX_BYTES: Record<MediaKind, number> = { image: MAX_IMAGE_BYTES, video: MAX_VIDEO_BYTES, document: MAX_DOCUMENT_BYTES };
export const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

export class MediaStoreError extends Error {
  constructor(message: string, public readonly errorClass: string, public readonly status = 400) {
    super(message);
    this.name = 'MediaStoreError';
  }
}

export interface StoredMedia {
  /** `media/<brand>/<sha256>.<ext>` - what goes in `media_assets.storage_key`. */
  key: string;
  sha256: string;
  byteSize: number;
  mimeType: string;
  /** True when these exact bytes were already stored for this brand. */
  alreadyExisted: boolean;
}

const KEY_PATTERN = /^media\/[0-9a-f-]{36}\/[0-9a-f]{64}\.(png|jpg|gif|mp4|pdf)$/;

export function isValidKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

function absolutePath(key: string): string {
  if (!isValidKey(key)) throw new MediaStoreError('Not a media key.', 'InvalidKey');
  // The key grammar above admits no `..`, no leading slash and no separators beyond the two
  // we put there, so this join cannot escape MEDIA_ROOT. Asserted anyway: a path traversal in
  // a file server is the classic vulnerability, and belt-and-braces is cheap here.
  const abs = path.resolve(MEDIA_ROOT, key.slice('media/'.length));
  if (!abs.startsWith(path.resolve(MEDIA_ROOT) + path.sep)) throw new MediaStoreError('Not a media key.', 'InvalidKey');
  return abs;
}

export function sha256Of(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Validate size and type BEFORE touching the disk. Returns the entry so the caller need not look it up again. */
export function assertAcceptable(mimeType: string, byteSize: number): { ext: string; kind: MediaKind } {
  const entry = ALLOWED_MEDIA[mimeType];
  if (!entry) {
    throw new MediaStoreError(
      `${mimeType || 'that file type'} is not accepted. Use PNG, JPEG, GIF, MP4 or PDF.`,
      'UnsupportedMediaType',
      415,
    );
  }
  const cap = MAX_BYTES[entry.kind];
  if (byteSize > cap) {
    throw new MediaStoreError(
      `That ${entry.kind} is ${(byteSize / 1024 / 1024).toFixed(1)} MB; the limit is ${cap / 1024 / 1024} MB.`,
      'MediaTooLarge',
      413,
    );
  }
  if (byteSize === 0) throw new MediaStoreError('The file is empty.', 'EmptyFile');
  return entry;
}

/**
 * Store bytes for a brand. Idempotent: the same bytes for the same brand land on the same key,
 * and a second call finds the file already there and writes nothing.
 */
export async function put(brandId: string, mimeType: string, bytes: Buffer): Promise<StoredMedia> {
  const entry = assertAcceptable(mimeType, bytes.length);
  const sha256 = sha256Of(bytes);
  const key = `media/${brandId}/${sha256}.${entry.ext}`;
  const abs = absolutePath(key);

  try {
    await fs.access(abs);
    return { key, sha256, byteSize: bytes.length, mimeType, alreadyExisted: true };
  } catch {
    // Not there yet: fall through and write it.
  }

  try {
    await fs.mkdir(path.dirname(abs), { recursive: true });
    // Write to a temp name and rename, so a crash mid-write never leaves a half file under the
    // real key - which `read` would then correctly reject as corrupt, but only after an
    // operator had already attached it.
    const tmp = `${abs}.${process.pid}.tmp`;
    await fs.writeFile(tmp, bytes, { flag: 'wx' });
    await fs.rename(tmp, abs);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOSPC') {
      throw new MediaStoreError('The media disk is full. Nothing was stored.', 'StorageFull', 507);
    }
    throw new MediaStoreError(`The file could not be stored (${code ?? 'unknown error'}).`, 'StorageWriteFailed', 500);
  }

  return { key, sha256, byteSize: bytes.length, mimeType, alreadyExisted: false };
}

/** Read bytes back, verifying them against the checksum in the key. */
export async function read(key: string): Promise<Buffer> {
  const abs = absolutePath(key);
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(abs);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') throw new MediaStoreError('That media file is no longer on disk.', 'MediaMissing', 404);
    throw new MediaStoreError(`The media file could not be read (${code ?? 'unknown error'}).`, 'StorageReadFailed', 500);
  }
  const expected = key.slice(key.lastIndexOf('/') + 1, key.lastIndexOf('.'));
  if (sha256Of(bytes) !== expected) {
    throw new MediaStoreError(
      'The stored file does not match its checksum. It was altered or damaged on disk; re-upload it.',
      'MediaCorrupt',
      409,
    );
  }
  return bytes;
}

export async function exists(key: string): Promise<boolean> {
  try {
    await fs.access(absolutePath(key));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Signed URLs, for the one provider that fetches rather than accepts a push.
// ---------------------------------------------------------------------------------------------

function signingSecret(env: NodeJS.ProcessEnv): string {
  const secret = env.JWT_SECRET;
  if (!secret) throw new MediaStoreError('JWT_SECRET is not configured; media URLs cannot be signed.', 'ConfigMissing', 500);
  return secret;
}

function signature(key: string, expiresAt: number, env: NodeJS.ProcessEnv): string {
  return createHmac('sha256', signingSecret(env)).update(`${key}|${expiresAt}`).digest('base64url');
}

export interface SignedUrl {
  url: string;
  expiresAt: number;
}

/**
 * A short-lived, unguessable URL a provider can fetch once. `publicBaseUrl` is the app's
 * public origin; the route lives at `/m/<key>?e=<expiry>&s=<sig>` and is mounted ABOVE
 * adminRoutes, for the reason `/r/` and `/i/` are.
 */
export function signedUrl(
  key: string,
  publicBaseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
  now: number = Date.now(),
  ttlMs: number = SIGNED_URL_TTL_MS,
): SignedUrl {
  if (!isValidKey(key)) throw new MediaStoreError('Not a media key.', 'InvalidKey');
  const expiresAt = now + ttlMs;
  const s = signature(key, expiresAt, env);
  return { url: `${publicBaseUrl.replace(/\/$/, '')}/${key.replace(/^media\//, 'm/')}?e=${expiresAt}&s=${s}`, expiresAt };
}

/** Verify a fetch. Returns the key on success; throws with a class the route maps to 403/410. */
export function verifySignedRequest(
  keyPath: string,
  expiry: string | undefined,
  sig: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  now: number = Date.now(),
): string {
  const key = `media/${keyPath}`;
  if (!isValidKey(key)) throw new MediaStoreError('Not a media key.', 'InvalidKey', 404);
  const expiresAt = Number(expiry);
  if (!Number.isFinite(expiresAt) || !sig) throw new MediaStoreError('The link is not signed.', 'Unsigned', 403);
  if (now > expiresAt) throw new MediaStoreError('The link has expired.', 'Expired', 410);

  const expected = Buffer.from(signature(key, expiresAt, env));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    throw new MediaStoreError('The link signature is invalid.', 'BadSignature', 403);
  }
  return key;
}
