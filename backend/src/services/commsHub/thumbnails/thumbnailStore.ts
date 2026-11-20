import CommsHubThumbnail, { type CommsHubThumbnailSource } from '../../../models/CommsHubThumbnail';
import { ingestFileBytes, findOrCreateLibraryAsset } from '../../media/mediaAssetService';
import { hubBrand } from '../eventPhotos';
import type { ThumbSize } from './templateLayout';
import type { Actor } from '../activityLog';

/**
 * Persist one thumbnail option (CH4.3): each size's PNG goes into the media library (content-addressed,
 * so a re-render of identical bytes is stored once) and one comms_hub_thumbnails row records where it
 * came from: template or AI, the style, the exact prompt, the model, the estimated cost and the time
 * taken. Rows are never overwritten; "try again" adds rows.
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

export async function storeOption(input: StoreOptionInput): Promise<CommsHubThumbnail> {
  const brand = await hubBrand();
  const assetIds: Partial<Record<(typeof COLUMN)[ThumbSize], string>> = {};
  for (const [size, png] of Object.entries(input.pngs) as Array<[ThumbSize, Buffer]>) {
    const ingest = await ingestFileBytes(brand.id, png, 'image/png');
    const { asset } = await findOrCreateLibraryAsset({
      tenantId: brand.tenantId, brandId: brand.id, ingest, originalFilename: `thumbnail-${size}.png`,
      altText: input.altText.slice(0, 300).padEnd(3, '.'), uploadedBy: input.actor.id,
    });
    assetIds[COLUMN[size]] = asset.id;
  }
  return CommsHubThumbnail.create({
    event_id: input.eventId, source: input.source, style_family: input.styleFamily, prompt_used: input.promptUsed, inputs: input.inputs,
    ...assetIds, model: input.model, cost_usd: input.costUsd === null ? null : input.costUsd.toFixed(4), latency_ms: input.latencyMs, created_by: input.actor.id,
  });
}

/**
 * Estimated price of one image, in US dollars, by quality and canvas. An ESTIMATE recorded so the
 * hub can show a running total; the OpenAI bill is the authority. Values follow OpenAI's published
 * per-image prices for the gpt-image-1 family (mini is cheaper; the full model's numbers are used
 * as an upper bound so the estimate never under-reports).
 */
const PRICE: Record<string, Record<string, number>> = {
  low: { '1024x1024': 0.011, '1536x1024': 0.016 },
  medium: { '1024x1024': 0.042, '1536x1024': 0.063 },
  high: { '1024x1024': 0.167, '1536x1024': 0.25 },
};
export function estimateCostUsd(quality: string, canvas: string): number | null {
  return PRICE[quality]?.[canvas] ?? null;
}
