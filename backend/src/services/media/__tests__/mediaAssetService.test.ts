/**
 * mediaAssetService — attaching a file to a post, with a REAL sharp decode.
 *
 * The models are faked; the image pipeline is not. The two guarantees that matter - EXIF is
 * stripped, and the stored type is what the bytes are rather than what the browser claimed -
 * are properties of sharp's actual behaviour, and mocking it would prove nothing.
 */

import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';

const tmpRoot = path.join(os.tmpdir(), `media-asset-test-${process.pid}-${Date.now()}`);
process.env.MEDIA_ROOT = tmpRoot;

jest.mock('../../../models', () => {
  const { makeFakeModelSet } = require('../../publishing/__tests__/fakeModels');
  return makeFakeModelSet();
});

import * as mockedModels from '../../../models';
import { type FakeModelSet, resetAll } from '../../publishing/__tests__/fakeModels';
import { attachMedia, listItemMedia, detachMedia } from '../mediaAssetService';
import { minimalPdf } from './pdfFixtures';

const models = mockedModels as unknown as FakeModelSet;
const BRAND = '22222222-2222-4222-8222-222222222222';

/** A real 4x3 PNG with an EXIF block, made by sharp itself. */
async function pngWithExif(): Promise<Buffer> {
  return sharp({ create: { width: 4, height: 3, channels: 3, background: { r: 200, g: 30, b: 30 } } })
    .png()
    .withMetadata({ exif: { IFD0: { Copyright: 'strip-me', ImageDescription: 'taken at 33.0N 96.7W' } } })
    .toBuffer();
}

async function jpeg(): Promise<Buffer> {
  return sharp({ create: { width: 5, height: 2, channels: 3, background: { r: 10, g: 200, b: 10 } } }).jpeg().toBuffer();
}

let itemId: string;

beforeAll(async () => { await fs.mkdir(tmpRoot, { recursive: true }); });
afterAll(async () => { await fs.rm(tmpRoot, { recursive: true, force: true }); });
beforeEach(async () => {
  resetAll(models);
  const item = await models.ContentItem.create({ tenant_id: 't-1', brand_id: BRAND, title: 'Free class', status: 'draft', revision: 1 });
  itemId = item.id;
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => { jest.restoreAllMocks(); });

describe('attach', () => {
  it('stores the image, records real dimensions, and STRIPS EXIF', async () => {
    const original = await pngWithExif();
    expect((await sharp(original).metadata()).exif).toBeDefined(); // the fixture really carries it

    const out = await attachMedia({ contentItemId: itemId, bytes: original, claimedMimeType: 'image/png', originalFilename: 'class.png', altText: 'A red rectangle used as a test image', uploadedBy: 'admin-1' });

    expect(out).toMatchObject({ mimeType: 'image/png', width: 4, height: 3, position: 0, reused: false });
    const stored = await fs.readFile(path.join(tmpRoot, out.storageKey.slice('media/'.length)));
    // The privacy guarantee: GPS, device and copyright fields do not travel with the post.
    expect((await sharp(stored).metadata()).exif).toBeUndefined();
    expect(stored.toString('latin1')).not.toContain('strip-me');
    expect(models.MediaAsset.rows[0].metadata.exif_stripped).toBe(true);
  });

  it('stores what the bytes ARE, not what the browser claimed', async () => {
    const out = await attachMedia({ contentItemId: itemId, bytes: await jpeg(), claimedMimeType: 'image/png', originalFilename: 'actually.png', altText: 'A green rectangle', uploadedBy: null });
    expect(out.mimeType).toBe('image/jpeg');
    expect(out.storageKey).toMatch(/\.jpg$/);
    expect(models.MediaAsset.rows[0].metadata.claimed_mime).toBe('image/png');
  });

  it('is idempotent: the same bytes attached twice is one asset and one attachment', async () => {
    const bytes = await jpeg();
    const a = await attachMedia({ contentItemId: itemId, bytes, claimedMimeType: 'image/jpeg', originalFilename: null, altText: 'Green', uploadedBy: null });
    const b = await attachMedia({ contentItemId: itemId, bytes, claimedMimeType: 'image/jpeg', originalFilename: null, altText: 'Green', uploadedBy: null });
    expect(b.mediaAssetId).toBe(a.mediaAssetId);
    expect(b.reused).toBe(true);
    expect(models.MediaAsset.rows).toHaveLength(1);
    expect(models.ContentItemMedia.rows).toHaveLength(1);
  });

  it('REQUIRES alt text, before any decoding happens', async () => {
    await expect(attachMedia({ contentItemId: itemId, bytes: await jpeg(), claimedMimeType: 'image/jpeg', originalFilename: null, altText: '  ', uploadedBy: null }))
      .rejects.toMatchObject({ errorClass: 'AltTextRequired', status: 400 });
    await expect(attachMedia({ contentItemId: itemId, bytes: await jpeg(), claimedMimeType: 'image/jpeg', originalFilename: null, altText: 'x'.repeat(301), uploadedBy: null }))
      .rejects.toMatchObject({ errorClass: 'AltTextTooLong' });
    expect(models.MediaAsset.rows).toHaveLength(0);
  });

  it('refuses bytes that are not a readable image, even with an image MIME type', async () => {
    await expect(attachMedia({ contentItemId: itemId, bytes: Buffer.from('definitely not a png'), claimedMimeType: 'image/png', originalFilename: null, altText: 'Nothing', uploadedBy: null }))
      .rejects.toMatchObject({ errorClass: 'UnreadableImage', status: 415 });
  });

  it('refuses an item with no brand, because the library is per brand', async () => {
    const orphan = await models.ContentItem.create({ tenant_id: 't-1', brand_id: null, title: 'x', status: 'draft', revision: 1 });
    await expect(attachMedia({ contentItemId: orphan.id, bytes: await jpeg(), claimedMimeType: 'image/jpeg', originalFilename: null, altText: 'Green', uploadedBy: null }))
      .rejects.toMatchObject({ errorClass: 'BrandRequired' });
  });

  it('stores a video as-is but READS it: duration, display size (rotation applied), codec, audio', async () => {
    const mp4 = await fs.readFile(path.join(__dirname, 'fixtures', 'phone-rotated-90.mp4'));
    const out = await attachMedia({ contentItemId: itemId, bytes: mp4, claimedMimeType: 'video/mp4', originalFilename: 'clip.mp4', altText: 'A short clip', uploadedBy: null });
    // Coded 96x54 with a 90 degree matrix: the viewer sees 54x96, and so must the validator.
    expect(out).toMatchObject({ mimeType: 'video/mp4', width: 54, height: 96, durationMs: 1000 });
    const row = models.MediaAsset.rows[0];
    expect(row.duration_ms).toBe(1000);
    expect(row.metadata.exif_stripped).toBe(false);
    expect(row.metadata.video).toEqual({ codec: 'avc1', codec_family: 'h264', has_audio: false, rotation: 90, major_brand: 'isom' });
    // Stored as-is: the bytes on disk are the bytes that came in.
    const stored = await fs.readFile(path.join(tmpRoot, out.storageKey.slice('media/'.length)));
    expect(stored.equals(mp4)).toBe(true);
  });

  it('refuses a "video" that is not a readable MP4, at upload, with the fix in the message', async () => {
    await expect(attachMedia({ contentItemId: itemId, bytes: Buffer.from('ftypisom-fake-video-bytes-0123456789'), claimedMimeType: 'video/mp4', originalFilename: 'clip.mp4', altText: 'A short clip', uploadedBy: null }))
      .rejects.toMatchObject({ errorClass: 'UnreadableVideo', status: 415 });
    const fragmented = await fs.readFile(path.join(__dirname, 'fixtures', 'fragmented.mp4'));
    await expect(attachMedia({ contentItemId: itemId, bytes: fragmented, claimedMimeType: 'video/mp4', originalFilename: 'frag.mp4', altText: 'A short clip', uploadedBy: null }))
      .rejects.toMatchObject({ errorClass: 'UnreadableVideo', message: expect.stringMatching(/Re-export/) });
    expect(models.MediaAsset.rows).toHaveLength(0);
  });
});

describe('documents', () => {
  it('stores a PDF as-is, records its page count, and lists it with pages', async () => {
    const pdf = minimalPdf(7);
    const out = await attachMedia({ contentItemId: itemId, bytes: pdf, claimedMimeType: 'application/pdf', originalFilename: 'deck.pdf', altText: 'Five AI habits for managers', uploadedBy: null });
    expect(out).toMatchObject({ mimeType: 'application/pdf', pages: 7, width: null, height: null, durationMs: null });
    expect(out.storageKey).toMatch(/\.pdf$/);
    expect(models.MediaAsset.rows[0].metadata.document).toEqual({ pages: 7, pdf_version: '1.4' });
    const stored = await fs.readFile(path.join(tmpRoot, out.storageKey.slice('media/'.length)));
    expect(stored.equals(pdf)).toBe(true);
    expect((await listItemMedia(itemId))[0].pages).toBe(7);
  });

  it('refuses a "PDF" that is not one, at upload, with the fix in the message', async () => {
    await expect(attachMedia({ contentItemId: itemId, bytes: Buffer.from('<html>not a pdf</html>'), claimedMimeType: 'application/pdf', originalFilename: 'x.pdf', altText: 'A deck', uploadedBy: null }))
      .rejects.toMatchObject({ errorClass: 'UnreadableDocument', status: 415, message: expect.stringMatching(/Export it as PDF/) });
    expect(models.MediaAsset.rows).toHaveLength(0);
  });
});

describe('list and detach', () => {
  it('lists in position order and detach keeps the asset for the brand library', async () => {
    const a = await attachMedia({ contentItemId: itemId, bytes: await jpeg(), claimedMimeType: 'image/jpeg', originalFilename: 'one.jpg', altText: 'One', uploadedBy: null });
    const b = await attachMedia({ contentItemId: itemId, bytes: await pngWithExif(), claimedMimeType: 'image/png', originalFilename: 'two.png', altText: 'Two', uploadedBy: null });
    const listed = await listItemMedia(itemId);
    expect(listed.map((m) => m.originalFilename)).toEqual(['one.jpg', 'two.png']);
    expect(listed.map((m) => m.position)).toEqual([0, 1]);

    await detachMedia(itemId, a.mediaAssetId);
    expect((await listItemMedia(itemId)).map((m) => m.mediaAssetId)).toEqual([b.mediaAssetId]);
    // The bytes and the row survive: another post in this brand may use them.
    expect(models.MediaAsset.rows).toHaveLength(2);
  });

  it('detaching something not attached is a 404, not a silent success', async () => {
    await expect(detachMedia(itemId, '99999999-9999-4999-8999-999999999999')).rejects.toMatchObject({ status: 404 });
  });
});
