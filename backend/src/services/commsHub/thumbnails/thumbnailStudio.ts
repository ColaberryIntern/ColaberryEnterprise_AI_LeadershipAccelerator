import { Op } from 'sequelize';
import CommsHubEvent from '../../../models/CommsHubEvent';
import CommsHubEventPhoto from '../../../models/CommsHubEventPhoto';
import CommsHubThumbnail from '../../../models/CommsHubThumbnail';
import MediaAsset from '../../../models/MediaAsset';
import { read, signedUrl } from '../../media/mediaStore';
import { mediaPublicBaseUrl } from '../../publishing/adapterRegistry';
import { logActivity, type Actor } from '../activityLog';
import { sniffImage, upright } from '../eventPhotos';
import { SIZES, type ThumbSize } from './templateLayout';
import { TEMPLATES, type TemplateId } from './templateSvg';
import { deriveAllSizes } from './templateRender';
import { guardSlots, STYLE_FAMILIES, STYLE_LABEL, type StyleFamily } from './stylePrompts';
import { AI_DAILY_LIMIT, aiAttempt, aiEnabled, slotsFor, templateOptions, type GenerateRequest } from './thumbnailSources';
import { centralMidnight, storeOption } from './thumbnailStore';

/**
 * The thumbnail studio's server side (CH4.4, design 02): what the organizer sees (the options, with
 * their prompt and a preview of each size), generating more, picking one for the event, downloading
 * a size, and uploading their own picture instead. Generation itself is CH4.3's sources.
 */
export class StudioError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

/** What the organizer picks from: the three templates together, one template, or an AI style family. */
export type StudioStyle = 'templates' | TemplateId | StyleFamily;
export const STUDIO_STYLES: StudioStyle[] = ['templates', ...TEMPLATES, ...STYLE_FAMILIES];
/** "Generate" and "Try 3 more" each make this many AI options (each one counts against the daily ceiling). */
export const AI_BATCH = 3;
export const THUMB_SIZES = Object.keys(SIZES) as ThumbSize[];
const COLUMN: Record<ThumbSize, 'asset_16x9_id' | 'asset_1x1_id' | 'asset_3x1_id'> = { '16x9': 'asset_16x9_id', '1x1': 'asset_1x1_id', '3x1': 'asset_3x1_id' };

const TEMPLATE_LABEL: Record<TemplateId, string> = { bold_cherry: 'Bold cherry', berry_night: 'Berry night', clean_white: 'Clean white' };
export function styleLabel(style: string | null): string {
  if (!style) return 'Picture';
  if (style === 'upload') return 'Your upload';
  return TEMPLATE_LABEL[style as TemplateId] ?? STYLE_LABEL[style as StyleFamily] ?? style;
}
export const isTemplate = (s: string | null): s is TemplateId => (TEMPLATES as string[]).includes(s ?? '');
export const isFamily = (s: string | null): s is StyleFamily => (STYLE_FAMILIES as string[]).includes(s ?? '');

/** The event, refused when it is unknown (404) or can no longer change (409). */
export async function editableEvent(eventId: string): Promise<CommsHubEvent> {
  const e = await CommsHubEvent.findByPk(eventId);
  if (!e) throw new StudioError('That event was not found.', 404);
  if (e.status === 'cancelled' || e.status === 'ended') throw new StudioError(`This event is ${e.status}, so its thumbnail cannot change.`, 409);
  return e;
}

/** The event's pictures (CH4.1) as bytes, in the order the organizer added them. */
export async function eventPhotoBytes(eventId: string): Promise<Buffer[]> {
  const links = await CommsHubEventPhoto.findAll({ where: { event_id: eventId }, order: [['position', 'ASC'], ['created_at', 'ASC']] });
  if (!links.length) return [];
  const assets = await MediaAsset.findAll({ where: { id: links.map((l) => l.media_asset_id) } });
  const key = new Map(assets.map((a) => [a.id, a.storage_key]));
  const out: Buffer[] = [];
  for (const l of links) {
    const k = key.get(l.media_asset_id);
    if (k) out.push(await read(k));
  }
  return out;
}

export interface StudioText { headline: string; supporting: string | null; showWhen: boolean; artNote?: string | null }

/** A generation request for this event, its text checked by the same guard as the AI prompts (templates included). */
export async function buildRequest(event: CommsHubEvent, text: StudioText, actor: Actor): Promise<GenerateRequest> {
  const req: GenerateRequest = { event, headline: text.headline, supporting: text.supporting, showWhen: text.showWhen, artNote: text.artNote ?? null, photos: await eventPhotoBytes(event.id), actor };
  guardSlots({ ...slotsFor(req, 'wide 16:9 banner'), artNote: req.artNote });
  return req;
}

export interface BatchResult { optionIds: string[]; notice: string | null }

/**
 * Make options in one style. Templates: one per template (or the one asked for). An AI family: `count`
 * attempts at once; the ones that fail are explained, and when none succeed the branded templates are
 * made instead with the reason, so the organizer always has something to pick.
 */
export async function generateBatch(req: GenerateRequest, style: StudioStyle, count = AI_BATCH): Promise<BatchResult> {
  if (style === 'templates') return { optionIds: (await templateOptions(req)).map((o) => o.id), notice: null };
  if (isTemplate(style)) return { optionIds: (await templateOptions(req, [style])).map((o) => o.id), notice: null };
  const results = await Promise.all(Array.from({ length: count }, () => aiAttempt(req, style)));
  const made = results.filter((r) => r.option).map((r) => r.option!.id);
  const reason = results.find((r) => r.reason)?.reason ?? null;
  if (!made.length) return { optionIds: (await templateOptions(req)).map((o) => o.id), notice: reason };
  return { optionIds: made, notice: made.length < count ? `${made.length} of ${count} AI pictures were made. ${reason ?? ''}`.trim() : null };
}

export interface OptionView {
  id: string; source: 'template' | 'upload' | 'ai'; style: string | null; style_label: string;
  prompt: string | null; headline: string | null; supporting: string | null; show_when: boolean;
  cost_usd: number | null; created_at: string; chosen: boolean;
  /** Sizes that were cropped from a wider picture rather than laid out for their shape. */
  cropped: ThumbSize[];
  previews: Record<ThumbSize, string | null>;
}

export interface StudioView { options: OptionView[]; chosen_id: string | null; ai: { enabled: boolean; used_today: number; daily_limit: number; batch: number } }

function preview(storageKey: string | null | undefined): string | null {
  const base = mediaPublicBaseUrl();
  if (!base || !storageKey) return null;
  try { return signedUrl(storageKey, base).url; } catch { return null; }
}

/** Finished options only: an AI attempt that is pending or failed has no 16:9 picture and is never offered. */
export async function listOptions(eventId: string, now: Date = new Date()): Promise<StudioView> {
  const e = await CommsHubEvent.findByPk(eventId);
  if (!e) throw new StudioError('That event was not found.', 404);
  const rows = await CommsHubThumbnail.findAll({ where: { event_id: eventId, asset_16x9_id: { [Op.ne]: null } }, order: [['created_at', 'DESC']], limit: 60 });
  const assetIds = rows.flatMap((r) => THUMB_SIZES.map((s) => r[COLUMN[s]]).filter((x): x is string => !!x));
  const assets = assetIds.length ? await MediaAsset.findAll({ where: { id: assetIds } }) : [];
  const keyOf = new Map(assets.map((a) => [a.id, a.storage_key]));
  const used = await CommsHubThumbnail.count({ where: { event_id: eventId, source: 'ai', created_at: { [Op.gte]: centralMidnight(now) } } });
  const options: OptionView[] = rows.map((r) => {
    const inputs = (r.inputs ?? {}) as Record<string, unknown>;
    return {
      id: r.id, source: r.source, style: r.style_family, style_label: styleLabel(r.style_family), prompt: r.prompt_used,
      headline: typeof inputs.headline === 'string' ? inputs.headline : null,
      supporting: typeof inputs.supporting === 'string' ? inputs.supporting : null,
      show_when: inputs.show_when === undefined ? inputs.badge != null : inputs.show_when === true,
      cost_usd: r.cost_usd === null ? null : Number(r.cost_usd), created_at: r.created_at.toISOString(), chosen: e.thumbnail_id === r.id,
      cropped: Array.isArray(inputs.cropped) ? (inputs.cropped as ThumbSize[]).filter((s) => THUMB_SIZES.includes(s)) : [],
      previews: Object.fromEntries(THUMB_SIZES.map((s) => [s, preview(keyOf.get(r[COLUMN[s]] ?? ''))])) as Record<ThumbSize, string | null>,
    };
  });
  return { options, chosen_id: e.thumbnail_id, ai: { enabled: aiEnabled(), used_today: used, daily_limit: AI_DAILY_LIMIT, batch: AI_BATCH } };
}

async function finishedOption(eventId: string, thumbnailId: string): Promise<CommsHubThumbnail> {
  const row = await CommsHubThumbnail.findOne({ where: { id: thumbnailId, event_id: eventId } });
  if (!row || !row.asset_16x9_id) throw new StudioError('That thumbnail was not found for this event.', 404);
  return row;
}

/** "Use for this event": the option becomes the event's thumbnail (the portal card shows it). */
export async function chooseOption(eventId: string, thumbnailId: string, actor: Actor): Promise<CommsHubEvent> {
  const e = await editableEvent(eventId);
  const row = await finishedOption(eventId, thumbnailId);
  const previous = e.thumbnail_id;
  await e.update({ thumbnail_id: row.id });
  await logActivity(actor, 'thumbnail.chosen', 'thumbnail', row.id, { event_id: e.id, previous, source: row.source, style: row.style_family });
  return e;
}

/** The PNG of one option at one size. */
export async function optionPng(eventId: string, thumbnailId: string, size: ThumbSize): Promise<Buffer> {
  const row = await finishedOption(eventId, thumbnailId);
  const assetId = row[COLUMN[size]];
  if (!assetId) throw new StudioError(`That thumbnail has no ${size} size.`, 404);
  const asset = await MediaAsset.findByPk(assetId);
  if (!asset?.storage_key) throw new StudioError('That picture is no longer in the media library.', 404);
  return read(asset.storage_key);
}

/** "Upload my own instead": the organizer's picture, turned upright and cropped to each size. */
export async function uploadOwn(eventId: string, upload: { bytes: Buffer; altText: string }, actor: Actor): Promise<string> {
  const e = await editableEvent(eventId);
  const mime = sniffImage(upload.bytes);
  if (!mime) throw new StudioError('That file is not a PNG or JPEG picture.', 415);
  const renders = await deriveAllSizes(await upright(upload.bytes, mime));
  const row = await storeOption({
    eventId: e.id, source: 'upload', styleFamily: 'upload', promptUsed: null, inputs: { alt_text: upload.altText, cropped: THUMB_SIZES },
    pngs: Object.fromEntries(renders.map((r) => [r.size, r.png])), altText: upload.altText, model: null, costUsd: 0, latencyMs: null, actor,
  });
  await logActivity(actor, 'thumbnail.uploaded', 'thumbnail', row.id, { event_id: e.id });
  return row.id;
}

/**
 * The chosen thumbnail of an event members can see, for the PUBLIC image route (the portal card's
 * <img> cannot send a session). Drafts and cancelled events, events not on the Events page, and
 * events without a chosen thumbnail give null.
 */
export async function publicThumbnail(eventId: string, size: ThumbSize): Promise<Buffer | null> {
  const e = await CommsHubEvent.findByPk(eventId);
  if (!e || !e.thumbnail_id || !e.placement?.events_page) return null;
  if (e.status !== 'scheduled' && e.status !== 'live' && e.status !== 'ended') return null;
  try { return await optionPng(e.id, e.thumbnail_id, size); } catch (err) { if (err instanceof StudioError) return null; throw err; }
}

export { publicThumbnailPath } from './thumbnailPaths';
