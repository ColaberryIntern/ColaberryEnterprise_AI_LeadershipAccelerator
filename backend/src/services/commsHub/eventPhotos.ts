import type { Transaction } from 'sequelize';
import { sequelize } from '../../config/database';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');
import Brand from '../../models/Brand';
import CommsHubEvent from '../../models/CommsHubEvent';
import CommsHubEventPhoto from '../../models/CommsHubEventPhoto';
import MediaAsset from '../../models/MediaAsset';
import { ingestFileBytes, findOrCreateLibraryAsset } from '../media/mediaAssetService';
import { signedUrl } from '../media/mediaStore';
import { mediaPublicBaseUrl } from '../publishing/adapterRegistry';
import { logActivity, type Actor } from './activityLog';

/**
 * Pictures for an event's thumbnails (CH4.1). Reuses the media library end to end: the size/type
 * gate runs before any decode, sharp re-encodes (which strips EXIF and GPS), bytes are stored
 * content-addressed, and the same picture twice is one library row. This file only adds the
 * hub's own rules: PNG or JPEG proven by the bytes themselves, at most 6 per event, and never on a
 * cancelled or ended event.
 *
 * The media volume is not in any backup job (ESC-003, recorded in mediaStore.ts): a lost thumbnail
 * can be regenerated, a lost uploaded photo cannot. The handoff says so.
 */
export const MAX_PHOTOS = 6;
export const HUB_BRAND_SLUG = (): string => process.env.COMMS_HUB_BRAND_SLUG?.trim() || 'colaberry-training';

export class PhotoRuleError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); this.name = 'PhotoRuleError'; }
}

/** PNG or JPEG by magic bytes. The claimed type and the file name are not trusted. */
export function sniffImage(bytes: Buffer): 'image/png' | 'image/jpeg' | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return null;
}

/** The brand hub media is stored under. Exactly one match, or a plain error; never a guess. */
export async function hubBrand(): Promise<{ id: string; tenantId: string }> {
  const rows = await Brand.findAll({ where: { slug: HUB_BRAND_SLUG() }, attributes: ['id', 'tenant_id'], limit: 2 });
  if (rows.length !== 1) throw new PhotoRuleError(`The media brand "${HUB_BRAND_SLUG()}" was ${rows.length ? 'found more than once' : 'not found'}; set COMMS_HUB_BRAND_SLUG.`, 500);
  return { id: rows[0].get('id') as string, tenantId: rows[0].get('tenant_id') as string };
}

export interface PhotoView { id: string; media_asset_id: string; alt_text: string | null; width: number | null; height: number | null; url: string | null }

function previewUrl(storageKey: string | null): string | null {
  const base = mediaPublicBaseUrl();
  if (!base || !storageKey) return null;
  try { return signedUrl(storageKey, base).url; } catch { return null; }
}

export async function listPhotos(eventId: string): Promise<PhotoView[]> {
  const links = await CommsHubEventPhoto.findAll({ where: { event_id: eventId }, order: [['position', 'ASC'], ['created_at', 'ASC']] });
  const assets = links.length ? await MediaAsset.findAll({ where: { id: links.map((l) => l.media_asset_id) } }) : [];
  const byId = new Map(assets.map((a) => [a.id, a]));
  return links.map((l) => {
    const a = byId.get(l.media_asset_id);
    return { id: l.id, media_asset_id: l.media_asset_id, alt_text: a?.alt_text ?? null, width: a?.width ?? null, height: a?.height ?? null, url: previewUrl(a?.storage_key ?? null) };
  });
}

export interface PhotoUpload { bytes: Buffer; originalName: string | null; altText: string }

/** Refuse before any bytes are decoded or written: unknown events and finished events take no pictures. */
async function assertEventTakesPictures(eventId: string, transaction?: Transaction): Promise<void> {
  const event = await CommsHubEvent.findByPk(eventId, transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {});
  if (!event) throw new PhotoRuleError('Event not found.', 404);
  if (event.status === 'cancelled' || event.status === 'ended') throw new PhotoRuleError(`This event is ${event.status}; it cannot take new pictures.`, 409);
}

/**
 * Turn the picture upright before it is stored. The library's re-encode drops EXIF (on purpose),
 * and with it the Orientation flag a phone uses instead of rotating pixels; without this step a
 * portrait phone photo would be stored, and rendered into every thumbnail, sideways.
 */
export async function upright(bytes: Buffer, mime: 'image/png' | 'image/jpeg'): Promise<Buffer> {
  const img = sharp(bytes).rotate();
  return mime === 'image/png' ? img.png().toBuffer() : img.jpeg({ quality: 92 }).toBuffer();
}

export async function addPhoto(eventId: string, upload: PhotoUpload, actor: Actor): Promise<PhotoView[]> {
  const mime = sniffImage(upload.bytes);
  if (!mime) throw new PhotoRuleError('Use a PNG or JPEG photo. That file is not one, whatever its name says.', 415);
  await assertEventTakesPictures(eventId);
  const brand = await hubBrand();
  let oriented: Buffer;
  try { oriented = await upright(upload.bytes, mime); } catch { throw new PhotoRuleError('That picture could not be read. Try exporting it again as JPEG or PNG.', 415); }
  const ingest = await ingestFileBytes(brand.id, oriented, mime);
  await sequelize.transaction(async (t) => {
    await assertEventTakesPictures(eventId, t); // again, under the row lock: the event may have changed meanwhile
    const count = await CommsHubEventPhoto.count({ where: { event_id: eventId }, transaction: t });
    const { asset } = await findOrCreateLibraryAsset({ tenantId: brand.tenantId, brandId: brand.id, ingest, originalFilename: upload.originalName, altText: upload.altText, uploadedBy: actor.id });
    const already = await CommsHubEventPhoto.findOne({ where: { event_id: eventId, media_asset_id: asset.id }, transaction: t });
    if (already) return;
    if (count >= MAX_PHOTOS) throw new PhotoRuleError(`An event can have ${MAX_PHOTOS} pictures. Remove one first.`, 409);
    await CommsHubEventPhoto.create({ event_id: eventId, media_asset_id: asset.id, position: count, created_by: actor.id }, { transaction: t });
    await logActivity(actor, 'photo.added', 'event', eventId, { media_asset_id: asset.id }, t);
  });
  return listPhotos(eventId);
}

export async function removePhoto(eventId: string, photoId: string, actor: Actor): Promise<PhotoView[]> {
  await sequelize.transaction(async (t) => {
    const removed = await CommsHubEventPhoto.destroy({ where: { id: photoId, event_id: eventId }, transaction: t });
    if (removed) await logActivity(actor, 'photo.removed', 'event', eventId, { photo_id: photoId }, t);
  });
  return listPhotos(eventId);
}
