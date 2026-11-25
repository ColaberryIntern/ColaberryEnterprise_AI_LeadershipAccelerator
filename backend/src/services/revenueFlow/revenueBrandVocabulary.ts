/**
 * R25 — the brand vocabulary the whole Revenue Room shares: slugs, order, and wording.
 *
 * Ali, 2026-11-24: "Everything in the revenue tab should be broken down by brand."
 *
 * ── WHY THIS IS A LEAF MODULE WITH NO IMPORTS ────────────────────────────────────────────
 *
 * R25 Phase 1 put all of this in `streamBrands.ts`, which was correct while only the flow
 * board's six streams carried a brand. Phase 2 extends the breakdown to the rest of the tab,
 * and the rest of the tab is built in two other places: the seventeen initiative cards come
 * from `revenueRoom/revenueInitiatives` and `commercialization/commercializationTiles`.
 *
 * Those could not import `streamBrands`. `streamBrands` imports `revenueFlowTypes`, and
 * `revenueFlowTypes` imports `TileStatus` from `commercializationTiles` — so a tile reaching
 * back for a brand slug would have closed the loop
 * `commercializationTiles -> streamBrands -> revenueFlowTypes -> commercializationTiles`,
 * which the repo's composition rule forbids outright. The rule's own diagnosis applies
 * exactly: "A imports B imports A is a code smell that signals a missing third module C that
 * both depend on." This is C.
 *
 * So this file imports NOTHING. That is load bearing rather than incidental: it is what lets
 * the stream map, the card map and the tile map all name the same four brands without any two
 * of them being able to disagree about what those four are.
 *
 * ── WHAT LIVES HERE AND WHAT DOES NOT ────────────────────────────────────────────────────
 *
 * Here: which brands this tab can speak of, what order they read in, what to call one when
 * the database cannot be reached, and the standing sentence about what a brand heading means.
 *
 * NOT here: which stream, card or tile belongs to which brand. Those are three separate
 * declarations living beside the things they describe (`streamBrands`, `revenueInitiatives`,
 * `commercializationTiles`), because the reason a given card sits under a given brand is a
 * fact about that card and belongs next to it, where the next person to edit it will look.
 *
 * Also NOT here: a brand's real name or URL. Those are data, they live in the `brands` table,
 * and the Brands admin page renders them from there. See `FALLBACK_BRAND_LABELS` below for
 * the one narrow job the hardcoded names do.
 */

/** The group that holds streams and cards belonging to no brand. Never rendered as a brand. */
export const UNASSIGNED_BRAND_KEY = 'unassigned';

/**
 * Every brand the Revenue Room can file revenue under, in reading order.
 *
 * A tuple rather than an array so `BrandKey` can be derived from it. That derivation is the
 * point: the three maps that assign brands are typed against this, so a typo in a slug is a
 * compile error rather than a card that silently lands in no group and vanishes off a
 * brand-filtered page.
 *
 * Order is FIXED, not sorted by revenue. A board that ranked by size would reshuffle itself
 * the first time a brand earned anything, and a reader's muscle memory for where to look is
 * worth more than ranking. Training first because it is the default and the only brand
 * earning today; the unassigned bucket last because it is not a brand.
 */
export const BRAND_KEYS = [
  'colaberry-training',
  'colaberry-enterprise',
  'refactored',
  UNASSIGNED_BRAND_KEY,
] as const;

/** A brand slug this tab knows, or the unassigned bucket. */
export type BrandKey = typeof BRAND_KEYS[number];

/**
 * The reading order of the brand headings.
 *
 * Derived from `BRAND_KEYS` rather than written out a second time, so the order and the set
 * of valid slugs cannot drift apart.
 */
export const BRAND_ORDER: readonly BrandKey[] = BRAND_KEYS;

/**
 * What to call a brand when the `brands` table cannot be read or does not hold the slug.
 *
 * Deliberately NOT the primary source. The names and URLs live in `brands`, and a second
 * hardcoded copy that drifts is exactly the duplication this repo keeps paying for. These
 * exist so a database hiccup degrades a heading to a readable name instead of removing a
 * brand's revenue from the page, and `resolved: false` travels with them so the page can say
 * which of the two happened.
 */
export const FALLBACK_BRAND_LABELS: Record<string, { label: string; url: string | null }> = {
  'colaberry-training': { label: 'Colaberry Training', url: 'https://training.colaberry.com' },
  'colaberry-enterprise': { label: 'Colaberry Enterprise', url: 'https://enterprise.colaberry.ai' },
  refactored: { label: 'Refactored.ai', url: 'https://refactored.ai' },
};

/** The unassigned group's wording. Not a brand, so it carries no URL and never resolves. */
export const UNASSIGNED_LABEL = 'No brand yet';
export const UNASSIGNED_NOTE =
  'Declared sources that do not belong to one brand. Several would be new brands if they '
  + 'were set up. Filing them under the default would claim they are part of the training '
  + 'business, which is not known and mostly not true.';

/** The standing statement about what a brand heading on this tab does and does not mean. */
export const BRAND_BASIS =
  'Brand is a property of the stream, not of each payment. No revenue table in this database '
  + 'carries a brand: subscriptions, enrollments, leads, enterprise intakes and government '
  + 'qualifications have no brand column, so a brand heading reports the streams filed under '
  + 'it rather than a per-payment attribution. One brand cannot be shown taking a share of '
  + "another brand's stream.";

/** Rendered with the demand band, where the only real brand column in the data disagrees. */
export const DEMAND_BRAND_NOTE =
  'Every campaign below is tagged to Colaberry Enterprise in the campaigns table, while the '
  + 'members they reach are filed under Colaberry Training. Both are shown as they are '
  + 'recorded rather than reconciled, because nothing ties a campaign to a payment and '
  + 'editing either one to agree would hide that.';

/** What a brand lookup provides. Supplied by `brandDirectoryService`, or absent. */
export interface BrandDirectoryEntry {
  slug: string;
  name: string;
  url: string | null;
  status: string;
}

/**
 * One brand heading, resolved: the words to print and whether they came from the database.
 *
 * Shared by the flow board's stream groups and by the card filter, so a brand cannot be
 * called one thing above the fold and another below it.
 */
export interface ResolvedBrand {
  key: BrandKey;
  label: string;
  url: string | null;
  /**
   * Whether `label` and `url` came from the `brands` table. False means the table could not
   * be read, or does not hold this slug, and the wording is a fallback that may be out of
   * date. The page says so rather than presenting a guess as the brand's name.
   */
  resolved: boolean;
  /** False for the unassigned group, which is a bucket rather than a brand. */
  isBrand: boolean;
  /** Why this group exists, or why its name could not be resolved. Empty when neither applies. */
  note: string;
}

/**
 * Resolve one brand slug to the words a heading should print.
 *
 * Pure, and the single place the fallback decision is made. Both the stream grouping and the
 * card grouping call it, which is what guarantees that a brand whose name failed to load is
 * labelled identically, and flagged identically, everywhere it appears on the tab.
 */
export function resolveBrand(
  key: BrandKey,
  directory: BrandDirectoryEntry[],
): ResolvedBrand {
  if (key === UNASSIGNED_BRAND_KEY) {
    return {
      key,
      label: UNASSIGNED_LABEL,
      url: null,
      resolved: false,
      isBrand: false,
      note: UNASSIGNED_NOTE,
    };
  }

  const found = directory.find((d) => d.slug === key);
  const fallback = FALLBACK_BRAND_LABELS[key];
  return {
    key,
    label: found?.name ?? fallback?.label ?? key,
    url: found?.url ?? fallback?.url ?? null,
    resolved: Boolean(found),
    isBrand: true,
    note: found
      ? ''
      : 'This heading could not be read from the brands table, so its name comes from a '
        + 'fallback in the code and may be out of date.',
  };
}

/**
 * One brand heading on the flow board: a resolved brand plus the streams filed under it.
 *
 * Declared as an EXTENSION of `ResolvedBrand` rather than as its own six-field interface,
 * which is what it was until Phase 2. The two had drifted into the same shape written twice,
 * and the duplicate was the kind that cannot be caught by a test: both compiled, both
 * rendered, and a field added to one would simply be absent from the other.
 */
export interface StreamBrand extends ResolvedBrand {
  /** The streams under this heading, in the board's own stream order. */
  streamKeys: string[];
}

/**
 * Refuse a brand slug this tab does not know.
 *
 * The compiler already enforces this on every declaration typed `BrandKey`. This is the
 * runtime half, for a value that arrived as a plain string — a query parameter, a stored
 * preference, or a hand-edited payload. An unknown slug must be rejected rather than filtered
 * on, because filtering on one would hide every card and read as "this brand earns nothing".
 */
export function isBrandKey(value: string): value is BrandKey {
  return (BRAND_KEYS as readonly string[]).includes(value);
}
