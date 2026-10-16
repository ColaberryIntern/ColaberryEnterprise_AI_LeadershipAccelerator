import type { ItemMedia } from '../../../../services/contentComposerApi';

/**
 * Which shape the network will actually render an attachment in, and what that costs.
 *
 * WHY THIS EXISTS. The preview showed every attachment in one box - full width, 360px tall,
 * `object-fit: contain` - so a 9:16 reel and a 16:9 landscape looked identical in it. They are
 * not identical anywhere they get published. A network does not letterbox an upload into
 * whatever space it has; it fits the file to the nearest frame IT supports and crops the rest.
 * Posting a 1920x1080 landscape to Instagram, whose tallest feed frame is 4:5, throws away more
 * than half the width - and nothing in the composer said so until the post was live.
 *
 * WHERE THE SHAPES COME FROM. `providerCapabilities.ts` already records `image.aspectRatios` and
 * `video.aspectRatios` per network, versioned and carrying an `asOf` date. This module reads
 * those; it hardcodes no network's shapes. A ratio list that goes stale goes stale in one place,
 * which is the whole reason that registry exists.
 *
 * WHAT IT REFUSES TO CLAIM. Width and height are nullable - a file whose dimensions were never
 * read has no known shape, and no crop can be calculated from it. In that case `chooseFrame`
 * returns null and the caller falls back to showing the file plainly. A guessed crop percentage
 * would be worse than none: it reads exactly like a measured one.
 */

export interface Frame {
  /** The network's own label for the shape, as declared in the registry: '4:5'. */
  label: string;
  /** That label as width / height, so 9:16 is 0.5625. */
  value: number;
  /** Fraction of the source frame the centre crop discards. 0 when the file already fits. */
  loss: number;
}

/** Below this, a difference is rounding in the stated ratio rather than a visible crop. */
const EXACT_ENOUGH = 0.01;

/**
 * '4:5' -> 0.8, '1.91:1' -> 1.91.
 *
 * Returns null rather than NaN for anything malformed, so a bad registry entry degrades to
 * "we don't know this shape" instead of poisoning a comparison. NaN would silently lose every
 * `<` it took part in and quietly pick the wrong frame.
 */
export function parseRatio(label: string): number | null {
  const parts = label.split(':');
  if (parts.length !== 2) return null;
  const w = Number(parts[0]);
  const h = Number(parts[1]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return w / h;
}

/** The file's own shape, or null when its dimensions were never recorded. */
export function sourceRatio(media: Pick<ItemMedia, 'width' | 'height'>): number | null {
  const { width, height } = media;
  if (!width || !height || width <= 0 || height <= 0) return null;
  return width / height;
}

/**
 * How much of the frame a centre crop from `from` to `to` throws away.
 *
 * Direction does not matter: cropping 16:9 into 1:1 loses width, cropping 9:16 into 1:1 loses
 * height, and both lose the same proportion of the picture.
 */
export function cropLoss(from: number, to: number): number {
  if (from <= 0 || to <= 0) return 0;
  return 1 - Math.min(from, to) / Math.max(from, to);
}

/**
 * The frame this network will put this file in.
 *
 * NEAREST, not first. The accepted list is not reliably ordered by preference, and a network
 * fits an upload to the supported shape closest to the one it was given. Distance is measured
 * on a log scale so that "twice as wide" and "twice as tall" are equally far from square - on a
 * linear scale the wide ratios are numerically further apart and would always look worse,
 * which would make the composer recommend portrait everywhere.
 */
export function chooseFrame(
  media: Pick<ItemMedia, 'width' | 'height'>,
  accepted: readonly string[],
): Frame | null {
  const source = sourceRatio(media);
  if (source === null) return null;

  let best: Frame | null = null;
  for (const label of accepted) {
    const value = parseRatio(label);
    if (value === null) continue;
    const loss = cropLoss(source, value);
    if (best === null || loss < best.loss) best = { label, value, loss };
  }
  return best;
}

/** Vertical, square or landscape - the operator's own vocabulary for a shape. */
export function shapeWord(ratio: number): 'vertical' | 'square' | 'landscape' {
  if (Math.abs(ratio - 1) < EXACT_ENOUGH) return 'square';
  return ratio < 1 ? 'vertical' : 'landscape';
}

/**
 * The sentence under a framed attachment, or null when there is nothing worth saying.
 *
 * Silent when the file already fits the frame, because a note on every attachment trains the
 * eye to skip the notes - and this one only matters when something is being cut.
 */
export function cropNote(
  media: Pick<ItemMedia, 'width' | 'height'>,
  frame: Frame,
  networkName: string,
): string | null {
  if (frame.loss < EXACT_ENOUGH) return null;
  const source = sourceRatio(media);
  if (source === null) return null;
  const pct = Math.round(frame.loss * 100);
  const axis = source > frame.value ? 'width' : 'height';
  return `${networkName} crops this to ${frame.label}. About ${pct}% of the ${axis} is cut - check nothing important sits near the ${axis === 'width' ? 'sides' : 'top or bottom'}.`;
}

/**
 * Pixel size for the framed box.
 *
 * Computed rather than left to CSS: `aspect-ratio` together with both a width and a max-height
 * resolves to the constrained box and silently drops the ratio, which is exactly the bug this
 * module exists to fix. A 9:16 frame at 520px wide would otherwise be 924px tall and push the
 * rest of the preview off the screen.
 */
export function frameBox(ratio: number, maxWidth: number, maxHeight: number): { width: number; height: number } {
  let width = maxWidth;
  let height = maxWidth / ratio;
  if (height > maxHeight) {
    height = maxHeight;
    width = maxHeight * ratio;
  }
  return { width: Math.round(width), height: Math.round(height) };
}

/** The shapes this network accepts for this file, from the provider's own registry entry. */
export function acceptedRatios(
  mimeType: string,
  provider: { imageRatios?: readonly string[]; videoRatios?: readonly string[] } | undefined,
): readonly string[] {
  if (!provider) return [];
  if (mimeType.startsWith('video/')) return provider.videoRatios ?? [];
  if (mimeType.startsWith('image/')) return provider.imageRatios ?? [];
  return [];
}
