import { FlowStreamKey } from './revenueClassifications';
import { BRAND_ORDER, UNASSIGNED_BRAND_KEY, resolveBrand } from './revenueBrandVocabulary';
import type { BrandDirectoryEntry, BrandKey } from './revenueBrandVocabulary';
import { RevenueStream, StreamBrand } from './revenueFlowTypes';

/**
 * Re-exported so Phase 1's consumers keep one import for "brand", even though the shared
 * half moved out in Phase 2 to break a cycle (see `revenueBrandVocabulary`'s header). This
 * file remains the answer to "which brand is this stream"; the vocabulary answers "which
 * brands exist and what are they called".
 */
export {
  BRAND_BASIS,
  BRAND_ORDER,
  DEMAND_BRAND_NOTE,
  FALLBACK_BRAND_LABELS,
  UNASSIGNED_BRAND_KEY,
  UNASSIGNED_LABEL,
  UNASSIGNED_NOTE,
} from './revenueBrandVocabulary';
export type { BrandDirectoryEntry, BrandKey } from './revenueBrandVocabulary';

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

/**
 * Stream to brand slug. `null` means "no brand yet", which is a different statement from
 * "this brand earns nothing" and is grouped separately.
 *
 * Every key of `FlowStreamKey` must appear. `assertBrandMappingIsComplete` enforces that, so
 * a seventh stream added later cannot quietly vanish from a brand-grouped page. The VALUES
 * are typed `BrandKey` rather than `string`, so a mistyped slug is a compile error instead of
 * a stream that lands in no group and disappears off a brand-filtered page.
 */
export const BRAND_BY_STREAM: Record<FlowStreamKey, BrandKey | null> = {
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
  const groups: StreamBrand[] = [];

  for (const brandKey of BRAND_ORDER) {
    const streamKeys = streams
      .map((s) => s.key)
      .filter((k) => (BRAND_BY_STREAM[k] ?? UNASSIGNED_BRAND_KEY) === brandKey);
    if (streamKeys.length === 0) continue;

    // The wording comes from the shared resolver rather than being decided here, so a brand
    // whose name failed to load is labelled and flagged identically above the fold and below
    // it. Phase 2 put the initiative cards on the same filter; two resolvers would have been
    // two chances to call the same brand two things on one screen.
    groups.push({ ...resolveBrand(brandKey, directory), streamKeys });
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

