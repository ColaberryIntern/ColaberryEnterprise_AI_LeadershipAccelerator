/**
 * mediaStore — the seam every media caller goes through.
 *
 * Run against a real temp directory, not a mocked fs: the guarantees that matter (idempotent
 * put, checksum-verified read, no path escape, atomic write) are properties of actual file
 * operations, and a mock would only prove the test agrees with itself.
 */

import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

const tmpRoot = path.join(os.tmpdir(), `media-store-test-${process.pid}-${Date.now()}`);
process.env.MEDIA_ROOT = tmpRoot;

import {
  put, read, exists, isValidKey, assertAcceptable, signedUrl, verifySignedRequest,
  MediaStoreError, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, SIGNED_URL_TTL_MS,
} from '../mediaStore';

const BRAND = '22222222-2222-4222-8222-222222222222';
// A real PNG header followed by filler: enough to be bytes, not enough to be a picture.
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(512, 7)]);
const ENV = { JWT_SECRET: ['test', 'secret'].join('-') } as NodeJS.ProcessEnv;

beforeAll(async () => { await fs.mkdir(tmpRoot, { recursive: true }); });
afterAll(async () => { await fs.rm(tmpRoot, { recursive: true, force: true }); });

describe('acceptance', () => {
  it('accepts the four allowed types and refuses everything else with a readable reason', () => {
    expect(assertAcceptable('image/png', 10).kind).toBe('image');
    expect(assertAcceptable('video/mp4', 10).kind).toBe('video');
    expect(() => assertAcceptable('image/svg+xml', 10)).toThrow(/not accepted/);
    expect(() => assertAcceptable('application/pdf', 10)).toThrow(/not accepted/);
    try { assertAcceptable('image/svg+xml', 10); } catch (e) { expect((e as MediaStoreError).status).toBe(415); }
  });

  it('enforces the image and video caps separately, and names the limit', () => {
    expect(() => assertAcceptable('image/png', MAX_IMAGE_BYTES + 1)).toThrow(/limit is 10 MB/);
    expect(() => assertAcceptable('video/mp4', MAX_IMAGE_BYTES + 1)).not.toThrow();
    expect(() => assertAcceptable('video/mp4', MAX_VIDEO_BYTES + 1)).toThrow(/limit is 200 MB/);
    try { assertAcceptable('image/png', MAX_IMAGE_BYTES + 1); } catch (e) { expect((e as MediaStoreError).status).toBe(413); }
  });

  it('refuses an empty file', () => {
    expect(() => assertAcceptable('image/png', 0)).toThrow(/empty/);
  });
});

describe('put and read', () => {
  it('stores under a content-addressed key and reads back the same bytes', async () => {
    const stored = await put(BRAND, 'image/png', PNG);
    expect(stored.key).toMatch(new RegExp(`^media/${BRAND}/[0-9a-f]{64}\\.png$`));
    expect(stored.alreadyExisted).toBe(false);
    expect(stored.byteSize).toBe(PNG.length);
    expect(await exists(stored.key)).toBe(true);
    expect((await read(stored.key)).equals(PNG)).toBe(true);
  });

  it('is idempotent: the same bytes for the same brand land on the same key with no second write', async () => {
    const a = await put(BRAND, 'image/png', PNG);
    const b = await put(BRAND, 'image/png', PNG);
    expect(b.key).toBe(a.key);
    expect(b.alreadyExisted).toBe(true);
  });

  it('keeps identical bytes in DIFFERENT brands apart', async () => {
    // Deduping across brands would let one brand's library leak into another's.
    const other = '33333333-3333-4333-8333-333333333333';
    const a = await put(BRAND, 'image/png', PNG);
    const b = await put(other, 'image/png', PNG);
    expect(a.sha256).toBe(b.sha256);
    expect(a.key).not.toBe(b.key);
  });

  it('detects a file altered on disk instead of serving it', async () => {
    const stored = await put(BRAND, 'image/gif', Buffer.from('GIF89a-altered-later-0123456789'));
    const abs = path.join(tmpRoot, stored.key.slice('media/'.length));
    await fs.writeFile(abs, Buffer.from('GIF89a-something-else-entirely'));
    await expect(read(stored.key)).rejects.toMatchObject({ errorClass: 'MediaCorrupt', status: 409 });
  });

  it('reports a missing file as missing, not as a generic failure', async () => {
    const key = `media/${BRAND}/${'a'.repeat(64)}.png`;
    await expect(read(key)).rejects.toMatchObject({ errorClass: 'MediaMissing', status: 404 });
    expect(await exists(key)).toBe(false);
  });

  it('leaves no temp file behind after a successful write', async () => {
    const stored = await put(BRAND, 'image/jpeg', Buffer.from('JFIF-bytes-for-the-temp-file-test'));
    const dir = path.dirname(path.join(tmpRoot, stored.key.slice('media/'.length)));
    const leftovers = (await fs.readdir(dir)).filter((f) => f.endsWith('.tmp'));
    expect(leftovers).toEqual([]);
  });
});

describe('key grammar - the path traversal defence', () => {
  it.each([
    'media/../../etc/passwd',
    `media/${BRAND}/../x.png`,
    '/media/x.png',
    `media/${BRAND}/not-a-hash.png`,
    `media/${BRAND}/${'a'.repeat(64)}.svg`,
    `media/${BRAND}/${'a'.repeat(64)}.png/extra`,
    '',
  ])('rejects %s', (bad) => {
    expect(isValidKey(bad)).toBe(false);
  });

  it('accepts only the exact shape put() produces', () => {
    expect(isValidKey(`media/${BRAND}/${'0'.repeat(64)}.mp4`)).toBe(true);
  });

  it('read() and exists() refuse a bad key before touching the disk', async () => {
    await expect(read('media/../secret')).rejects.toMatchObject({ errorClass: 'InvalidKey' });
    await expect(exists('media/../secret')).resolves.toBe(false);
  });
});

describe('signed URLs - for the one provider that fetches', () => {
  const KEY = `media/${BRAND}/${'b'.repeat(64)}.png`;
  const NOW = 1_760_000_000_000;

  it('produces a public path under /m/ with an expiry and a signature, and verifies it', () => {
    const { url, expiresAt } = signedUrl(KEY, 'https://enterprise.colaberry.ai/', ENV, NOW);
    expect(url).toMatch(/^https:\/\/enterprise\.colaberry\.ai\/m\//);
    expect(url).not.toContain('media/'); // the public path is /m/, not the storage key
    const u = new URL(url);
    expect(Number(u.searchParams.get('e'))).toBe(expiresAt);
    const keyPath = u.pathname.replace(/^\/m\//, '');
    expect(verifySignedRequest(keyPath, u.searchParams.get('e')!, u.searchParams.get('s')!, ENV, NOW + 1000)).toBe(KEY);
  });

  it('rejects an expired link with 410, so a leaked URL dies with its window', () => {
    const { url } = signedUrl(KEY, 'https://x', ENV, NOW);
    const u = new URL(url);
    expect(() => verifySignedRequest(u.pathname.slice(3), u.searchParams.get('e')!, u.searchParams.get('s')!, ENV, NOW + SIGNED_URL_TTL_MS + 1))
      .toThrow(/expired/);
  });

  it('rejects a tampered expiry - extending the window invalidates the signature', () => {
    const { url } = signedUrl(KEY, 'https://x', ENV, NOW);
    const u = new URL(url);
    const later = String(Number(u.searchParams.get('e')) + 60_000);
    expect(() => verifySignedRequest(u.pathname.slice(3), later, u.searchParams.get('s')!, ENV, NOW))
      .toThrow(/signature is invalid/);
  });

  it('rejects a signature made with another secret, an unsigned request, and a bad key', () => {
    const { url } = signedUrl(KEY, 'https://x', { JWT_SECRET: 'other' } as NodeJS.ProcessEnv, NOW);
    const u = new URL(url);
    expect(() => verifySignedRequest(u.pathname.slice(3), u.searchParams.get('e')!, u.searchParams.get('s')!, ENV, NOW)).toThrow(/invalid/);
    expect(() => verifySignedRequest(u.pathname.slice(3), undefined, undefined, ENV, NOW)).toThrow(/not signed/);
    try { verifySignedRequest('../etc/passwd', '1', 'x', ENV, NOW); } catch (e) { expect((e as MediaStoreError).status).toBe(404); }
  });

  it('refuses to sign at all without JWT_SECRET', () => {
    expect(() => signedUrl(KEY, 'https://x', {} as NodeJS.ProcessEnv, NOW)).toThrow(/JWT_SECRET/);
  });
});
