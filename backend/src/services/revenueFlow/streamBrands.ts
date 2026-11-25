import { FlowStreamKey } from './revenueClassifications';
import { RevenueStream, StreamBrand } from './revenueFlowTypes';

/**
 * Which brand each revenue stream belongs to, and why that is a DECLARATION.
 *
 * Ali, 2026-11-24: "Everything in the revenue tab should be broken down by brand. We can
 * default to Colaberry training but FDE hiring should be connected to hire.refactored.ai
 * brand, Enterprise site sales should be connected to its brand."
 *
 * ── WHY THIS IS A MAP IN CODE AND NOT A COLUMN READ FROM THE DATA ────────────────────────
 *
 * Measured on production 2026-11-24: 45 tables carry a `brand_id`, and of the tables this
 * board reads, exactly one of them does. `campaigns` has it. `subscriptions`, `enrollments`,
 * `leads`, `enterprise_intakes` and `gov_qualifications` do not. So there is no way to ask
 * the database which brand a paying member belongs to, and inventing one by joining through
 * a lead source would be a guess wearing the clothes of a measurement.
 *
 * What IS true is that each stream is a single brand's business line: membership is the
 * training business, the enterprise site is the enterprise business, FDE hiring is
 * Refactored. Ali chose this shape on 2026-11-24 over adding `brand_id` to the revenue
 * tables, which would have been the only way to split one stream across two brands.
 *
 * The consequence is stated on the page rather than buried here: a brand heading reports the
 * streams filed under it, not a per-payment attribution, and this board cannot show one
 * brand taking a share of another's stream.
 *
 * ── THE ONE PLACE REAL BRAND DATA EXISTS DISAGREES WITH THIS MAP ─────────────────────────
 *
 * All four campaigns in the membership demand path carry `brand_id` = `colaberry-enterprise`
 * in production, including both alumni campaigns and both Open House (Maya) campaigns, while
 * the members they feed are filed here under `colaberry-training`. That is a real
 * disagreement between two systems and it is NOT silently resolved: `DEMAND_BRAND_NOTE`
 * below is rendered with the demand band so a reader meeting both sees why they differ.
 * Overwriting either one to make the screen tidy would destroy the evidence that they do.
 */

/** The group that holds streams belonging to no brand. Not a brand, and never rendered as one. */
export const UNASSIGNED_BRAND_KEY = 'unassigned';

/**
 * Stream to brand slug. `null` means "no brand yet", which is a different statement from
 * "this brand earns nothing" and is grouped separately.
 *
 * Every key of `FlowStreamKey` must appear. `assertBrandMappingIsComplete` enforces that, so
 * a seventh stream added later cannot quietly vanish from a brand-grouped page.
 */
export const BRAND_BY_STREAM: Record<FlowStreamKey, string | null> = {
  // The membership is the training business: the accelerator people pay for.
  membership: 'colaberry-training',
  // Converting a monthly member to yearly moves money inside the training business. The
  // converted member is still counted by the membership stream and never twice.
  subscription_conversion: 'colaberry-training',
  // enterprise.colaberry.ai, its offer and its intake.
  enterprise_site: 'colaberry-enterprise',
  // Bid under the Colaberry Enterprise identity. Ali's call on 2026-11-24, choosing this
  // over a separate heading for the bidding legal entity.
  gov_pipeline: 'colaberry-enterprise',
  // hire.refactored.ai, which production records as a web domain of the `refactored` brand
  // rather than as a brand of its own (added 2026-11-14, alongside refactored.ai,
  // www.refactored.ai and track.refactored.ai). So this points at the brand that owns the
  // domain; nothing new was created.
  hire_fde: 'refactored',
  // The declared-but-unbuilt bets span no single brand and several would be new ones. Filing
  // them under Colaberry Training because it is the default would say they belong to the
  // training business, which is not known and mostly not true.
  hypotheses: null,
};

/**
 * Reading order of the brand headings, and the reason each sits where it does.
 *
 * Fixed rather than sorted by revenue: a board that ordered by size would reshuffle the page
 * the first time a brand earned anything, and the reader's muscle memory for where to look
 * is worth more than ranking. Training first because it is the default and the only brand
 * earning today.
 */
export const BRAND_ORDER: string[] = [
  'colaberry-training',
  'colaberry-enterprise',
  'refactored',
  UNASSIGNED_BRAND_KEY,
];

/**
 * What to call a brand when the `brands` table cannot be read or does not hold it.
 *
 * Deliberately NOT the primary source. The names and URLs live in `brands`, the Brands admin
 * page renders them from there, and a second hardcoded copy that drifts is exactly the
 * duplication this repo keeps paying for. These exist so a database hiccup degrades the
 * heading to a readable name instead of removing a brand's revenue from the page, and
 * `resolved: false` says which happened.
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

/** The standing statement about what a brand heading on this board does and does not mean. */
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

/** Why a given stream sits under a given brand, in one sentence a reader can check. */
export const BRAND_NOTE_BY_STREAM: Record<FlowStreamKey, string> = {
  membership: 'The accelerator membership people pay for.',
  subscription_conversion:
    'Moves an existing member from monthly to yearly inside the same business. A converted '
    + 'member is counted by the membership stream and never counted twice.',
  enterprise_site: 'The offer and intake on enterprise.colaberry.ai.',
  gov_pipeline: 'Bid under the Colaberry Enterprise identity.',
  hire_fde:
    'hire.refactored.ai, which production records as a web domain of the Refactored.ai '
    + 'brand rather than as a brand of its own.',
  hypotheses: 'Spans no single brand, and several would be new brands if they were set up.',
};

/** What a brand lookup provides. Supplied by `brandDirectoryService`, or absent. */
export interface BrandDirectoryEntry {
  slug: string;
  name: string;
  url: string | null;
  status: string;
}

/**
 * Group the board's streams under their brands, in the fixed reading order.
 *
 * Pure: the directory is passed in, so this is testable without a database and the same
 * function serves a degraded run where the directory is empty.
 *
 * A brand with no streams on the board is omitted entirely. A brand heading with nothing
 * under it would read as "this brand earned nothing", when the truth is that no stream was
 * built for it at all.
 */
export function buildBrandGroups(
  streams: Pick<RevenueStream, 'key'>[],
  directory: BrandDirectoryEntry[],
): StreamBrand[] {
  const bySlug = new Map(directory.map((d) => [d.slug, d]));
  const groups: StreamBrand[] = [];

  for (const brandKey of BRAND_ORDER) {
    const streamKeys = streams
      .map((s) => s.key)
      .filter((k) => (BRAND_BY_STREAM[k] ?? UNASSIGNED_BRAND_KEY) === brandKey);
    if (streamKeys.length === 0) continue;

    if (brandKey === UNASSIGNED_BRAND_KEY) {
      groups.push({
        key: UNASSIGNED_BRAND_KEY,
        label: UNASSIGNED_LABEL,
        url: null,
        resolved: false,
        isBrand: false,
        note: UNASSIGNED_NOTE,
        streamKeys,
      });
      continue;
    }

    const found = bySlug.get(brandKey);
    const fallback = FALLBACK_BRAND_LABELS[brandKey];
    groups.push({
      key: brandKey,
      label: found?.name ?? fallback?.label ?? brandKey,
      url: found?.url ?? fallback?.url ?? null,
      resolved: Boolean(found),
      isBrand: true,
      note: found
        ? ''
        : 'This heading could not be read from the brands table, so its name comes from a '
          + 'fallback in the code and may be out of date.',
      streamKeys,
    });
  }

  return groups;
}

/**
 * Refuse to ship a mapping that has gone wrong in a way the page would render as a fact.
 *
 * Throws rather than warns, and is called where a throw costs the brand grouping and a
 * caveat rather than the board.
 */
export function assertBrandGroupingIsHonest(
  groups: StreamBrand[],
  streams: Pick<RevenueStream, 'key'>[],
): void {
  const seen = new Set<string>();
  for (const g of groups) {
    if (g.streamKeys.length === 0) {
      throw new Error(`Brand group "${g.key}" holds no stream and would read as a brand that earned nothing.`);
    }
    for (const k of g.streamKeys) {
      if (seen.has(k)) {
        throw new Error(`Stream "${k}" appears under more than one brand, so its revenue would be counted twice.`);
      }
      seen.add(k);
    }
    if (g.isBrand && !g.label.trim()) {
      throw new Error(`Brand group "${g.key}" has no label, so its heading would render blank.`);
    }
  }

  for (const s of streams) {
    if (!seen.has(s.key)) {
      throw new Error(`Stream "${s.key}" is on the board but under no brand, so it would disappear from a brand-grouped page.`);
    }
  }
}

/** Every stream key must be mapped. Called at module boundaries so a new stream cannot slip. */
export function assertBrandMappingIsComplete(keys: readonly FlowStreamKey[]): void {
  for (const k of keys) {
    if (!(k in BRAND_BY_STREAM)) {
      throw new Error(`Stream "${k}" has no brand declared in BRAND_BY_STREAM.`);
    }
  }
}

