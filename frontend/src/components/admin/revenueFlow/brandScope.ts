import type { BrandGroup, Stream } from './flowBoardTypes';

/**
 * R25 Phase 2 — what the reader is currently looking at, and which brand owns it.
 *
 * ── WHY THESE ARE PURE FUNCTIONS AND NOT A useMemo IN THE DASHBOARD ──────────────────────
 *
 * They were, at first. The rules they carry are the ones that decide whether a brand heading
 * can appear over another brand's revenue, which makes them the most important behaviour in
 * this feature and the least observable: `renderToStaticMarkup` runs no effects and this
 * repo has no `@testing-library/react`, so a rule reachable only by driving the dashboard's
 * own state would have been asserted by reading the source rather than by running it.
 *
 * Extracted, each rule is a function with inputs and an answer, and the two failures that
 * would render as facts about the business are directly testable:
 *
 *   - a stale stream filter surviving a brand change, so a Colaberry Enterprise card renders
 *     under the Refactored.ai heading
 *   - a brand heading rendering with nothing under it, which reads as "this brand earned
 *     nothing" when the truth is that it was filtered out of view
 */

export interface StreamScope {
  /** Every stream in the chosen brand, before the stream filter narrows it. */
  brandStreams: Stream[];
  /** The stream filter that actually applies, which is '' when the chosen one is out of brand. */
  effectiveStream: string;
  /** The streams to render. */
  streams: Stream[];
  /** Their keys, for scoping the timeline and the headline figures. */
  keys: string[];
  /** Whether anything is filtered at all. False means "show everything, note nothing". */
  filtered: boolean;
}

/**
 * Resolve the two filters into one answer.
 *
 * The stream filter is DERIVED against the chosen brand rather than reset when the brand
 * changes. A reset would have to be an effect, and an effect means one render in which the
 * brand is Refactored.ai and the stream filter still names a government stream — a single
 * frame showing one brand's heading over another brand's card. Deriving makes that state
 * unrepresentable, and has the pleasant side effect that returning to the earlier brand
 * brings the reader's stream choice back rather than silently having dropped it.
 */
export function scopeStreams(
  allStreams: Stream[],
  brandFilter: string,
  streamFilter: string,
): StreamScope {
  const brandStreams = allStreams.filter((s) => !brandFilter || s.brandKey === brandFilter);
  const effectiveStream = brandStreams.some((s) => s.key === streamFilter) ? streamFilter : '';
  const streams = brandStreams.filter((s) => !effectiveStream || s.key === effectiveStream);
  return {
    brandStreams,
    effectiveStream,
    streams,
    keys: streams.map((s) => s.key),
    filtered: Boolean(brandFilter) || Boolean(effectiveStream),
  };
}

/**
 * Put each visible stream under the brand that owns it, in the backend's order.
 *
 * A brand holding no visible stream is DROPPED rather than rendered empty. A heading with
 * nothing under it is read as a measurement — "this brand earned nothing" — and that is a
 * claim nobody made; a brand filtered out of view has simply not been asked about.
 *
 * Order is the backend's and is never re-sorted here, for the reason `streamBrands.ts` gives:
 * a board sorted by revenue would reshuffle itself the first time a brand earned anything.
 */
export function groupStreamsByBrand(
  brands: BrandGroup[],
  streams: Stream[],
): Array<{ brand: BrandGroup; streams: Stream[] }> {
  return brands
    .map((brand) => ({ brand, streams: streams.filter((s) => s.brandKey === brand.key) }))
    .filter((g) => g.streams.length > 0);
}
