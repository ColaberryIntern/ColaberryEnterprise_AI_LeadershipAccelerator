import sharp from 'sharp';
import { looksLikeMp4, probeMp4, Mp4ParseError, type Mp4Facts } from './mp4Probe';
import { looksLikePdf, probePdf, PdfParseError, type PdfFacts } from './pdfProbe';
import { ContentItem, ContentItemMedia, MediaAsset } from '../../models';
import { WorkflowError, assertWritable } from '../content/contentWorkflowService';
import { MediaStoreError, assertAcceptable, put, signedUrl } from './mediaStore';
import { mediaPublicBaseUrl } from '../publishing/adapterRegistry';

/**
 * mediaAssetService — attach an uploaded file to a content item.
 *
 * The one place `sharp` is finally imported (it has been a dependency nobody used since
 * T004). Two jobs, both at upload time rather than publish time, because an upload is one
 * event and a publish is one per network:
 *   1. Record real width/height/format from the bytes, not from the filename or the browser's
 *      claimed MIME type. A `.png` that is actually a JPEG is stored as a JPEG.
 *   2. STRIP EXIF. A marketing photo taken on a phone carries GPS coordinates, the device
 *      model and a timestamp. Posting that is a privacy leak for whoever took it and a
 *      location disclosure for wherever it was taken. `sharp` re-encodes without metadata.
 *      Videos are stored as-is but READ: the container's own boxes give duration, display
 *      size (rotation applied), codec and audio presence, which is what every network's video
 *      rule asks about (mp4Probe.ts). A file that is not a readable MP4 is refused here, at
 *      upload, not at publish. (Stripping video metadata is a different tool and out of
 *      scope); stated, not hidden.
 *
 * ALT TEXT IS REQUIRED AT UPLOAD, not at publish. Spec 8.4 makes accessibility a
 * requirement, and the moment the operator has the image in front of them is the only moment
 * they will write a description for it. A field that can be filled later is a field that is
 * never filled.
 */

export interface AttachInput {
  contentItemId: string;
  bytes: Buffer;
  /** The browser's claim. Verified against the bytes for images. */
  claimedMimeType: string;
  originalFilename: string | null;
  altText: string;
  uploadedBy: string | null;
}

export interface AttachedMedia {
  mediaAssetId: string;
  storageKey: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  /** Documents only, when the file states it plainly. */
  pages: number | null;
  altText: string;
  position: number;
  /** True when the exact bytes were already in this brand's library and were reused. */
  reused: boolean;
}

const MAX_ATTACHMENTS_PER_ITEM = 10;

/** Format sniffed from bytes -> the MIME type we store. Anything else is refused. */
const SHARP_FORMAT_TO_MIME: Record<string, string> = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif' };

async function normaliseImage(bytes: Buffer, claimed: string): Promise<{ bytes: Buffer; mimeType: string; width: number; height: number }> {
  let meta: sharp.Metadata;
  try {
    meta = await sharp(bytes, { animated: true }).metadata();
  } catch {
    throw new MediaStoreError('That file is not a readable image.', 'UnreadableImage', 415);
  }
  const mimeType = meta.format ? SHARP_FORMAT_TO_MIME[meta.format] : undefined;
  if (!mimeType) {
    throw new MediaStoreError(`The image is ${meta.format ?? 'an unknown format'}; use PNG, JPEG or GIF.`, 'UnsupportedMediaType', 415);
  }
  if (mimeType !== claimed) {
    // Not an error: browsers guess. Recorded so an operator reading the row sees the truth.
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'info', service: 'media',
      event: 'mime_corrected', outcome: 'success', context: { claimed, actual: mimeType },
    }));
  }
  // Re-encode without metadata. GIFs keep their frames; the EXIF is what goes.
  const stripped = await sharp(bytes, { animated: true }).toBuffer();
  return { bytes: stripped, mimeType, width: meta.width ?? 0, height: meta.pageHeight ?? meta.height ?? 0 };
}

/**
 * What we know about a video before it is stored. Refused with the parser's own reason: the
 * operator can re-export in seconds, and a wrong duration would let a 12-minute clip through a
 * 10-minute rule.
 */
function probeVideo(bytes: Buffer): Mp4Facts {
  if (!looksLikeMp4(bytes)) {
    throw new WorkflowError('That file is not an MP4 video. Export it as MP4 (H.264) and attach it again.', 415, 'UnreadableVideo');
  }
  try {
    return probeMp4(bytes);
  } catch (err) {
    if (err instanceof Mp4ParseError) throw new WorkflowError(err.message, 415, 'UnreadableVideo');
    throw err;
  }
}

/** A document is stored as-is; what we read is whether it IS a PDF and, when stated plainly, its page count. */
function probeDocument(bytes: Buffer): PdfFacts {
  if (!looksLikePdf(bytes)) {
    throw new WorkflowError('That file is not a PDF. Export it as PDF and attach it again.', 415, 'UnreadableDocument');
  }
  try {
    return probePdf(bytes);
  } catch (err) {
    if (err instanceof PdfParseError) throw new WorkflowError(err.message, 415, 'UnreadableDocument');
    throw err;
  }
}

/**
 * Alt text rules, shared. Extracted so the library upload cannot drift from the composer
 * upload: a rule enforced in one place and not the other is the same as not enforced.
 */
export function assertAltText(raw: string): string {
  const altText = String(raw ?? '').trim();
  if (altText.length < 3) {
    throw new WorkflowError('Describe the image for people who cannot see it (alt text is required).', 400, 'AltTextRequired');
  }
  if (altText.length > 300) {
    // LinkedIn's cap; the smallest among the providers we target, so it is the one to enforce.
    throw new WorkflowError('Alt text is limited to 300 characters.', 400, 'AltTextTooLong');
  }
  return altText;
}

export interface IngestedBytes {
  storageKey: string;
  sha256: string;
  byteSize: number;
  mimeType: string;
  claimedMime: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  video: Mp4Facts | null;
  document: PdfFacts | null;
  exifStripped: boolean;
}

/**
 * Normalise, probe and store one file's bytes, with no content item in sight.
 *
 * WHY THIS IS SEPARATE (LIB-1). The library accepts an upload that belongs to no post yet,
 * and `attachMedia` cannot serve it - it needs a `contentItemId` only in order to find the
 * brand. The brand is the one thing the ingest actually wanted, so it is a parameter here.
 * There is no brand-less form of this: the storage key is `media/<brand>/<sha256>.<ext>`.
 *
 * `assertAcceptable` stays FIRST and stays inside, because sharp will otherwise happily
 * spend seconds decoding a 200 MB file that calls itself a png.
 */
export async function ingestFileBytes(
  brandId: string,
  inputBytes: Buffer,
  claimedMimeType: string,
): Promise<IngestedBytes> {
  // Size and type gate BEFORE decoding.
  const entry = assertAcceptable(claimedMimeType, inputBytes.length);

  let bytes = inputBytes;
  let mimeType = claimedMimeType;
  let width: number | null = null;
  let height: number | null = null;
  let durationMs: number | null = null;
  let video: Mp4Facts | null = null;
  let document: PdfFacts | null = null;
  if (entry.kind === 'image') {
    const normalised = await normaliseImage(inputBytes, claimedMimeType);
    bytes = normalised.bytes;
    mimeType = normalised.mimeType;
    width = normalised.width;
    height = normalised.height;
  } else if (entry.kind === 'video') {
    video = probeVideo(inputBytes);
    width = video.width;
    height = video.height;
    durationMs = video.durationMs;
  } else {
    document = probeDocument(inputBytes);
  }

  const stored = await put(brandId, mimeType, bytes);
  return {
    storageKey: stored.key,
    sha256: stored.sha256,
    byteSize: stored.byteSize,
    mimeType,
    claimedMime: claimedMimeType,
    width,
    height,
    durationMs,
    video,
    document,
    exifStripped: entry.kind === 'image',
  };
}

export interface LibraryAssetInput {
  tenantId: string;
  brandId: string;
  ingest: IngestedBytes;
  originalFilename: string | null;
  altText: string;
  uploadedBy: string | null;
}

/**
 * Find-or-create on (brand_id, checksum_sha256), with the alt-text backfill.
 *
 * NOT AN OPTIMISATION. `media_assets_brand_checksum_unique` (ensureContentOsSchema) means a
 * second upload of the same bytes MUST reuse the row rather than race it, and re-uploading
 * an ad that is already in the library is the likeliest thing anyone does to a media
 * library - an unconditional insert would 500 on it. The lookup, the create and the
 * backfill are extracted together on purpose: split them and the backfill is what gets lost.
 *
 * `kind` is deliberately not set. The column defaults to 'file' (ensureMediaLibrarySchema),
 * so this stays correct both before and after that migration lands.
 */
export async function findOrCreateLibraryAsset(
  input: LibraryAssetInput,
): Promise<{ asset: MediaAsset; reused: boolean }> {
  const { ingest } = input;
  let asset = await MediaAsset.findOne({
    where: { brand_id: input.brandId, checksum_sha256: ingest.sha256 },
  });
  const reused = asset !== null;
  if (!asset) {
    asset = await MediaAsset.create({
      tenant_id: input.tenantId,
      brand_id: input.brandId,
      storage_key: ingest.storageKey,
      original_filename: input.originalFilename,
      mime_type: ingest.mimeType,
      byte_size: ingest.byteSize,
      checksum_sha256: ingest.sha256,
      width: ingest.width,
      height: ingest.height,
      duration_ms: ingest.durationMs,
      alt_text: input.altText,
      uploaded_by: input.uploadedBy,
      metadata: {
        exif_stripped: ingest.exifStripped,
        claimed_mime: ingest.claimedMime,
        ...(ingest.video ? { video: { codec: ingest.video.codec, codec_family: ingest.video.codecFamily, has_audio: ingest.video.hasAudio, rotation: ingest.video.rotation, major_brand: ingest.video.majorBrand } } : {}),
        ...(ingest.document ? { document: { pages: ingest.document.pages, pdf_version: ingest.document.version } } : {}),
      },
    } as any);
  } else if (!asset.alt_text) {
    await asset.update({ alt_text: input.altText });
  }
  return { asset: asset as MediaAsset, reused };
}

export async function attachMedia(input: AttachInput): Promise<AttachedMedia> {
  const altText = assertAltText(input.altText);

  const item = await ContentItem.findByPk(input.contentItemId);
  if (!item) throw new WorkflowError('Content item not found', 404, 'NotFound');
  assertWritable(item);
  if (!item.brand_id) {
    throw new WorkflowError('This item has no brand, so its media has no library to live in.', 409, 'BrandRequired');
  }

  const attached = await ContentItemMedia.count({ where: { content_item_id: item.id } });
  if (attached >= MAX_ATTACHMENTS_PER_ITEM) {
    throw new WorkflowError(`A post can carry at most ${MAX_ATTACHMENTS_PER_ITEM} media items.`, 409, 'TooManyAttachments');
  }

  // The ingest and the library row are shared with the standalone library upload (LIB-1),
  // which has no content item. Everything below reads exactly as it did before the split.
  const ingest = await ingestFileBytes(item.brand_id, input.bytes, input.claimedMimeType);
  const { mimeType, width, height, durationMs, document } = ingest;
  const stored = { key: ingest.storageKey, byteSize: ingest.byteSize, sha256: ingest.sha256 };

  const { asset, reused } = await findOrCreateLibraryAsset({
    tenantId: item.tenant_id,
    brandId: item.brand_id,
    ingest,
    originalFilename: input.originalFilename,
    altText,
    uploadedBy: input.uploadedBy,
  });

  // Idempotent attach: the same asset on the same item twice is one attachment.
  const existingLink = await ContentItemMedia.findOne({ where: { content_item_id: item.id, media_asset_id: asset.id } });
  const position = existingLink ? existingLink.position : attached;
  if (!existingLink) {
    await ContentItemMedia.create({ content_item_id: item.id, media_asset_id: asset.id, position } as any);
  }

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'info', service: 'media', event: 'media_attached', outcome: 'success',
    context: { content_item_id: item.id, media_asset_id: asset.id, mime: mimeType, bytes: stored.byteSize, reused, width, height },
  }));

  return {
    mediaAssetId: asset.id,
    storageKey: stored.key,
    mimeType,
    byteSize: stored.byteSize,
    width,
    height,
    durationMs,
    pages: document?.pages ?? pagesOf(asset.metadata),
    altText: asset.alt_text ?? altText,
    position,
    reused,
  };
}

/** The page count the upload recorded, if any. */
export function pagesOf(metadata: unknown): number | null {
  const pages = (metadata as { document?: { pages?: unknown } } | null)?.document?.pages;
  return typeof pages === 'number' ? pages : null;
}

export interface ItemMediaView {
  mediaAssetId: string;
  mimeType: string;
  byteSize: number | null;
  width: number | null;
  height: number | null;
  altText: string | null;
  position: number;
  originalFilename: string | null;
  durationMs: number | null;
  pages: number | null;
  /**
   * A short-lived signed URL the browser can load, so the composer's preview shows the ACTUAL
   * file rather than a grey rectangle. The same `/m/` route Meta fetches from, with the same
   * expiry - no second way to serve media, and nothing new made public.
   *
   * Null when the server has no public base URL configured. The preview falls back to its
   * placeholder then, rather than rendering a broken image.
   */
  url: string | null;
}

/** Sign, or return null. `signedUrl` throws without JWT_SECRET or on a key it does not recognise. */
function safeSignedUrl(storageKey: string, base: string): string | null {
  try {
    return signedUrl(storageKey, base).url;
  } catch {
    return null;
  }
}

export async function listItemMedia(contentItemId: string): Promise<ItemMediaView[]> {
  const links = await ContentItemMedia.findAll({ where: { content_item_id: contentItemId }, order: [['position', 'ASC']] });
  if (links.length === 0) return [];
  const assets = await MediaAsset.findAll({ where: { id: links.map((l) => l.media_asset_id) } });
  const byId = new Map(assets.map((a) => [a.id, a]));
  // Signed once per listing, not per asset lookup, so every URL in one response shares an expiry.
  const base = mediaPublicBaseUrl();
  return links.flatMap((l) => {
    const a = byId.get(l.media_asset_id);
    if (!a) return [];
    return [{
      // BIGINT arrives from Postgres as a string; the view promises a number.
      mediaAssetId: a.id, mimeType: a.mime_type, byteSize: a.byte_size == null ? null : Number(a.byte_size), width: a.width, height: a.height,
      altText: a.alt_text, position: l.position, originalFilename: a.original_filename, durationMs: a.duration_ms,
      pages: pagesOf(a.metadata),
      // A signing failure must not take the whole listing down with it: the media still exists
      // and the operator still needs to see that it is attached.
      url: base ? safeSignedUrl(a.storage_key, base) : null,
    }];
  });
}

/** Detach from the item. The asset row and its bytes stay: another item may use them, and the library is per brand. */
export async function detachMedia(contentItemId: string, mediaAssetId: string): Promise<void> {
  const item = await ContentItem.findByPk(contentItemId);
  if (!item) throw new WorkflowError('Content item not found', 404, 'NotFound');
  assertWritable(item);
  const removed = await ContentItemMedia.destroy({ where: { content_item_id: contentItemId, media_asset_id: mediaAssetId } });
  if (removed === 0) throw new WorkflowError('That media is not attached to this item.', 404, 'NotFound');
}
