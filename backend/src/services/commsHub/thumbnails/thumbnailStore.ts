import { Op } from 'sequelize';
import CommsHubEvent from '../../../models/CommsHubEvent';
import CommsHubThumbnail, { type CommsHubThumbnailSource } from '../../../models/CommsHubThumbnail';
import { sequelize } from '../../../config/database';
import { ingestFileBytes, findOrCreateLibraryAsset } from '../../media/mediaAssetService';
import { centralDateKey, centralWallClockToInstant } from '../../centralDate';
import { hubBrand } from '../eventPhotos';
import type { ThumbSize } from './templateLayout';
import type { Actor } from '../activityLog';

/**
 * Persist thumbnail options (CH4.3). Every size's PNG goes into the media library (content-addressed),
 * and one comms_hub_thumbnails row records where it came from: template or AI, the style, the exact
 * prompt, the model, the estimated cost and the time taken. Rows are never overwritten; "try again"
 * adds rows. A row with no 16:9 asset is an AI ATTEMPT (pending or failed), not an option.
 */
export interface StoreOptionInput {
  eventId: string;
  source: CommsHubThumbnailSource;
  styleFamily: string;
  promptUsed: string | null;
  inputs: Record<string, unknown>;
  pngs: Partial<Record<ThumbSize, Buffer>>;
  altText: string;
  model: string | null;
  costUsd: number | null;
  latencyMs: number | null;
  actor: Actor;
}

const COLUMN: Record<ThumbSize, 'asset_16x9_id' | 'asset_1x1_id' | 'asset_3x1_id'> = { '16x9': 'asset_16x9_id', '1x1': 'asset_1x1_id', '3x1': 'asset_3x1_id' };

async function ingestSizes(pngs: StoreOptionInput['pngs'], altText: string, actor: Actor): Promise<Partial<Record<(typeof COLUMN)[ThumbSize], string>>> {
  const brand = await hubBrand();
  const ids: Partial<Record<(typeof COLUMN)[ThumbSize], string>> = {};
  for (const [size, png] of Object.entries(pngs) as Array<[ThumbSize, Buffer]>) {
    const ingest = await ingestFileBytes(brand.id, png, 'image/png');
    const { asset } = await findOrCreateLibraryAsset({ tenantId: brand.tenantId, brandId: brand.id, ingest, originalFilename: `thumbnail-${size}.png`, altText: altText.slice(0, 300).padEnd(3, '.'), uploadedBy: actor.id });
    ids[COLUMN[size]] = asset.id;
  }
  return ids;
}

export async function storeOption(input: StoreOptionInput): Promise<CommsHubThumbnail> {
  const assetIds = await ingestSizes(input.pngs, input.altText, input.actor);
  return CommsHubThumbnail.create({
    event_id: input.eventId, source: input.source, style_family: input.styleFamily, prompt_used: input.promptUsed, inputs: input.inputs,
    ...assetIds, model: input.model, cost_usd: input.costUsd === null ? null : input.costUsd.toFixed(4), latency_ms: input.latencyMs, created_by: input.actor.id,
  });
}

/** Start of today on the Central clock, as an instant (DST-safe through centralDate). */
export function centralMidnight(now: Date): Date {
  return centralWallClockToInstant(new Date(`${centralDateKey(now.getTime())}T00:00:00Z`));
}

/**
 * Reserve one AI attempt against the daily ceiling, atomically: the event row is locked, today's AI
 * rows are counted, and the attempt row is written in the same transaction, so parallel "try again"
 * clicks cannot all slip under the limit. Failed and timed-out attempts keep their row and count,
 * because the image service may bill them. Returns null when the ceiling is reached.
 */
export async function reserveAiAttempt(eventId: string, style: string, prompt: string, model: string, limit: number, actor: Actor, now: Date = new Date()): Promise<CommsHubThumbnail | null> {
  return sequelize.transaction(async (t) => {
    await CommsHubEvent.findByPk(eventId, { transaction: t, lock: t.LOCK.UPDATE });
    const used = await CommsHubThumbnail.count({ where: { event_id: eventId, source: 'ai', created_at: { [Op.gte]: centralMidnight(now) } }, transaction: t });
    if (used >= limit) return null;
    return CommsHubThumbnail.create({ event_id: eventId, source: 'ai', style_family: style, prompt_used: prompt, inputs: { status: 'pending' }, model, created_by: actor.id }, { transaction: t });
  });
}

export async function completeAiAttempt(row: CommsHubThumbnail, input: Pick<StoreOptionInput, 'pngs' | 'altText' | 'costUsd' | 'latencyMs' | 'actor' | 'inputs'>): Promise<CommsHubThumbnail> {
  const assetIds = await ingestSizes(input.pngs, input.altText, input.actor);
  await row.update({ ...assetIds, inputs: { ...input.inputs, status: 'done' }, cost_usd: input.costUsd === null ? null : input.costUsd.toFixed(4), latency_ms: input.latencyMs });
  return row;
}

export async function failAiAttempt(row: CommsHubThumbnail, errorKind: string, latencyMs: number): Promise<void> {
  await row.update({ inputs: { ...(row.inputs ?? {}), status: 'failed', error: errorKind }, latency_ms: latencyMs });
}

/**
 * Estimated price of one image, in US dollars, by quality and canvas. An ESTIMATE recorded so the
 * hub can show a running total; the OpenAI bill is the authority. Values follow OpenAI's published
 * per-image prices for the full gpt-image-1 model, used as an upper bound for mini so the estimate
 * never under-reports the default; input-image tokens on edits are not priced (the token counts are
 * stored with each row and in ai_events for exact reconciliation).
 */
const PRICE: Record<string, Record<string, number>> = {
  low: { '1024x1024': 0.011, '1536x1024': 0.016 },
  medium: { '1024x1024': 0.042, '1536x1024': 0.063 },
  high: { '1024x1024': 0.167, '1536x1024': 0.25 },
};
export function estimateCostUsd(quality: string, canvas: string): number | null {
  return PRICE[quality]?.[canvas] ?? null;
}
