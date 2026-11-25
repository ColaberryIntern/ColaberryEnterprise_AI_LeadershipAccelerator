import type { LibraryAsset } from '../../../../services/libraryApi';

/**
 * How a library tile says who, when, and how it is doing.
 *
 * Kept pure and separate from the component so the rules are unit-testable without a
 * render: the interesting cases here are all about absence (no uploader recorded, a
 * machine uploader, a video YouTube declined to answer for) and those are exactly the
 * cases a snapshot test glosses over.
 */

export type UploaderSource = LibraryAsset['uploadedBySource'];

/**
 * Abbreviate a view count without ever misleading about scale.
 *
 * Below ten thousand the exact number is short enough to read and more useful than a
 * rounded one. Above it, an exact count is noise. Null stays null: a video YouTube did
 * not answer for has NO count, which is not the same as zero views, and rendering it as
 * "0 views" would call a private video a failed one.
 */
export function formatViews(count: number | null | undefined): string | null {
  if (count === null || count === undefined || !Number.isFinite(count) || count < 0) return null;
  const n = Math.trunc(count);
  if (n < 10_000) return n.toLocaleString('en-US');
  // One decimal while it adds information, none once the number is big enough not to.
  const trim = (v: number): string =>
    (v >= 100 ? String(Math.round(v)) : v.toFixed(1).replace(/[.]0$/, ''));
  const UNITS = [
    { divisor: 1_000, suffix: 'K' },
    { divisor: 1_000_000, suffix: 'M' },
    { divisor: 1_000_000_000, suffix: 'B' },
  ] as const;
  let idx = 0;
  if (n >= 1_000_000_000) idx = 2;
  else if (n >= 1_000_000) idx = 1;
  let out = trim(n / UNITS[idx].divisor);
  // Rounding can push a value past its own unit (999,999 / 1000 rounds to 1000).
  // Promote rather than print the nonsense "1000K".
  if (Number(out) >= 1_000 && idx < UNITS.length - 1) {
    idx += 1;
    out = trim(n / UNITS[idx].divisor);
  }
  return `${out}${UNITS[idx].suffix}`;
}

/** "1,448 views" / "12.4K views", or null when there is nothing honest to say. */
export function viewsLabel(count: number | null | undefined): string | null {
  const formatted = formatViews(count);
  if (formatted === null) return null;
  return `${formatted} ${Math.trunc(count as number) === 1 ? 'view' : 'views'}`;
}

/**
 * Only a link can have views. A file we host has no view counter anywhere, and the two
 * mp4s in the library are exactly that, so a "0 views" badge on them would be an invented
 * number rather than a measured one.
 */
export function showsViews(asset: Pick<LibraryAsset, 'kind' | 'sourceUrl'>): boolean {
  return asset.kind === 'link' && !!asset.sourceUrl;
}

/**
 * A machine upload is styled differently from a person's, because the single most useful
 * thing about the 36 thumbnail-studio assets is that no colleague chose to put them there.
 */
export function uploaderClassName(source: UploaderSource): string {
  switch (source) {
    case 'admin':
    case 'member':
      return 'text-body-secondary';
    case 'system':
      return 'text-info-emphasis';
    case 'unknown':
    case 'none':
    default:
      return 'text-warning-emphasis';
  }
}

/** The word before the name, so the line reads as a sentence rather than a field dump. */
export function uploaderPrefix(source: UploaderSource): string {
  if (source === 'system') return 'Added by';
  if (source === 'none') return 'Uploader';
  return 'Uploaded by';
}
