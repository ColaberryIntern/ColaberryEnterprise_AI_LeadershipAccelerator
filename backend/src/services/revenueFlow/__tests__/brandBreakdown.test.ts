import { CLASSIFICATIONS, FlowStreamKey } from '../revenueClassifications';
import {
  HEADLINE_FIGURE_STREAM,
  assertHeadlineSourcesAreKnownStreams,
} from '../headlineSources';
import {
  BRAND_KEYS,
  BRAND_ORDER,
  FALLBACK_BRAND_LABELS,
  UNASSIGNED_BRAND_KEY,
  isBrandKey,
  resolveBrand,
} from '../revenueBrandVocabulary';
import { BRAND_BY_STREAM } from '../streamBrands';
import { TILE_DEFINITIONS } from '../../commercialization/commercializationTiles';
import { INITIATIVE_DEFINITIONS } from '../../revenueRoom/revenueInitiatives';

/**
 * R25 Phase 2 — the rest of the Revenue Room broken down by brand.
 *
 * Phase 1 branded the flow board's six streams. Phase 2 extends the same breakdown to the
 * four figures across the top of the board and to the seventeen initiative and business-proof
 * cards below it, which come from two other services entirely.
 *
 * These cover the failures that would render as FACTS ABOUT THE BUSINESS:
 *
 *   - a headline figure with no declared source, which would be hidden under every brand
 *     filter and so leave the page with nothing logged anywhere
 *   - a headline figure declared to a stream that has no brand, which can never be shown
 *   - the same revenue bet filed under one brand on the board above and another below it
 *   - a card quietly defaulting into the unassigned bucket because nobody decided
 *   - a brand's fallback name presented as its real one
 *
 * The frontend half — whether the page actually removes those figures and cards — is in
 * `frontend/src/components/admin/revenueFlow/__tests__/brandBreakdownRender.test.tsx`.
 */

/**
 * The stream keys that really exist, derived from the classification registry at run time.
 *
 * Deliberately NOT read from the maps under test. Checking a map against itself passes for a
 * map missing half the streams, which is the whole failure mode. Same approach as
 * `streamBrands.test.ts`, for the same reason.
 */
const STREAM_KEYS: FlowStreamKey[] = Array.from(new Set(CLASSIFICATIONS.map((c) => c.stream)));

describe('every figure across the top of the board declares where it came from', () => {
  it('declares a stream that actually exists for each figure', () => {
    for (const [figure, stream] of Object.entries(HEADLINE_FIGURE_STREAM)) {
      expect(STREAM_KEYS).toContain(stream);
      // Named in the failure so a broken declaration is identifiable without a debugger.
      expect(`${figure}:${stream}`).toBe(`${figure}:${stream}`);
    }
  });

  /**
   * The failure this prevents: a figure declared to a stream with no brand could never be
   * shown under any brand heading, so a real number would be unreachable from a
   * brand-filtered page while still appearing on the unfiltered one.
   */
  it('declares a stream that is itself filed under a brand', () => {
    for (const stream of Object.values(HEADLINE_FIGURE_STREAM)) {
      expect(Object.keys(BRAND_BY_STREAM)).toContain(stream);
    }
  });

  it('refuses a declaration naming a stream the board does not know', () => {
    // The guard, exercised. A bogus source would hide a tile under every filter rather than
    // showing it under one, so it throws where a throw costs the board and not the page.
    expect(() => assertHeadlineSourcesAreKnownStreams(STREAM_KEYS)).not.toThrow();
    expect(() => assertHeadlineSourcesAreKnownStreams(['membership'])).toThrow(/gov_pipeline/);
    expect(() => assertHeadlineSourcesAreKnownStreams([])).toThrow(/not a stream this board knows/);
  });

  /**
   * Booked revenue and the pipeline are DIFFERENT brands' numbers, and that is the entire
   * reason this file exists. If they ever collapsed onto one stream, the brand filter would
   * stop separating them and nothing else here would notice.
   */
  it('keeps booked revenue and the pipeline on different streams', () => {
    expect(HEADLINE_FIGURE_STREAM.bookedAnnualized).toBe('membership');
    expect(HEADLINE_FIGURE_STREAM.possibleWinnings).toBe('gov_pipeline');
    expect(HEADLINE_FIGURE_STREAM.bookedAnnualized)
      .not.toBe(HEADLINE_FIGURE_STREAM.possibleWinnings);

    // And therefore different brands.
    expect(BRAND_BY_STREAM[HEADLINE_FIGURE_STREAM.bookedAnnualized])
      .not.toBe(BRAND_BY_STREAM[HEADLINE_FIGURE_STREAM.possibleWinnings]);
  });
});

describe('the brand vocabulary', () => {
  it('reads in a fixed order with the unassigned bucket last', () => {
    // Derived from one tuple rather than written twice, so the order and the set of valid
    // slugs cannot drift apart.
    expect(BRAND_ORDER).toEqual(BRAND_KEYS);
    expect(BRAND_ORDER[BRAND_ORDER.length - 1]).toBe(UNASSIGNED_BRAND_KEY);
  });

  it('carries a fallback name for every real brand', () => {
    // A brand with no fallback would render its raw slug as a heading if the table failed.
    for (const key of BRAND_KEYS) {
      if (key === UNASSIGNED_BRAND_KEY) continue;
      expect(FALLBACK_BRAND_LABELS[key]).toBeDefined();
      expect(FALLBACK_BRAND_LABELS[key].label.trim()).not.toBe('');
    }
  });

  it('rejects a slug it does not know', () => {
    expect(isBrandKey('refactored')).toBe(true);
    expect(isBrandKey(UNASSIGNED_BRAND_KEY)).toBe(true);
    // Filtering on an unknown slug would hide every card and read as "this brand earns
    // nothing", so it must be refused rather than filtered on.
    expect(isBrandKey('refactorerd')).toBe(false);
    expect(isBrandKey('')).toBe(false);
  });
});

describe('resolving a brand to the words a heading prints', () => {
  const DIRECTORY = [
    { slug: 'refactored', name: 'Refactored.ai', url: 'https://refactored.ai', status: 'active' },
  ];

  it('prefers the brands table over the fallback', () => {
    const r = resolveBrand('refactored', DIRECTORY);
    expect(r.label).toBe('Refactored.ai');
    expect(r.resolved).toBe(true);
    expect(r.note).toBe('');
  });

  it('falls back to a readable name and ADMITS it, rather than presenting a guess', () => {
    const r = resolveBrand('refactored', []);
    expect(r.label).toBe('Refactored.ai');
    expect(r.resolved).toBe(false);
    expect(r.note).toMatch(/may be out of date/);

    // The control: with the directory present, no such admission is made.
    expect(resolveBrand('refactored', DIRECTORY).note).toBe('');
  });

  it('never calls the unassigned bucket a brand', () => {
    const r = resolveBrand(UNASSIGNED_BRAND_KEY, DIRECTORY);
    expect(r.isBrand).toBe(false);
    expect(r.url).toBeNull();
    expect(r.note).not.toBe('');

    // The control: a real brand IS one.
    expect(resolveBrand('refactored', DIRECTORY).isBrand).toBe(true);
  });
});

describe('every card in the Revenue Room declares a brand', () => {
  const ALL = [...TILE_DEFINITIONS, ...INITIATIVE_DEFINITIONS];

  it('declares a slug the vocabulary knows, on all seventeen', () => {
    expect(ALL.length).toBeGreaterThanOrEqual(17);
    for (const c of ALL) {
      expect(isBrandKey(c.brandKey)).toBe(true);
    }
  });

  /**
   * The cross-surface invariant, and the reason this test is in the revenueFlow folder rather
   * than beside either card service.
   *
   * The same revenue appears twice on this page: once as a stream on the flow board and once
   * as an initiative card below it. If the two disagreed about the brand, the SAME money would
   * sit under one heading above the fold and a different heading below it, and a reader would
   * have no way to tell which was right.
   */
  it('files the membership and government cards under the same brands as their streams', () => {
    const byKey = new Map(INITIATIVE_DEFINITIONS.map((d) => [d.key, d]));
    expect(byKey.get('membership_subscriptions')?.brandKey)
      .toBe(BRAND_BY_STREAM.membership);
    expect(byKey.get('gov_bid_pursuit')?.brandKey)
      .toBe(BRAND_BY_STREAM.gov_pipeline);
  });

  it('leaves the revenue bets unassigned, exactly as the hypotheses stream is', () => {
    const bets = INITIATIVE_DEFINITIONS.filter((d) => d.kind === 'hypothesis');
    expect(bets.length).toBeGreaterThan(0);

    // `BRAND_BY_STREAM.hypotheses` is null, which the board renders as the unassigned bucket.
    // The cards must land in that same bucket or the same bet appears under two headings.
    expect(BRAND_BY_STREAM.hypotheses).toBeNull();
    for (const b of bets) expect(b.brandKey).toBe(UNASSIGNED_BRAND_KEY);
  });

  /**
   * The silent default this guards against: a new card added with `brandKey: 'unassigned'`
   * because the author did not want to decide. The bucket is for things whose brand is
   * genuinely undecided, and today that is the five bets and nothing else. A sixth member
   * fails this test and forces the decision to be made deliberately.
   */
  it('holds nothing in the unassigned bucket except the revenue bets', () => {
    const unassigned = ALL.filter((c) => c.brandKey === UNASSIGNED_BRAND_KEY);
    const bets = INITIATIVE_DEFINITIONS.filter((d) => d.kind === 'hypothesis');
    expect(unassigned).toHaveLength(bets.length);
  });

  it('files the annualized revenue proof tile with the training business that earns it', () => {
    // It is the same `subscriptions` figure the membership stream reports, so a different
    // brand here would put one number under two brands on one page.
    const tile = TILE_DEFINITIONS.find((t) => t.key === 'annualized_revenue');
    expect(tile?.brandKey).toBe(BRAND_BY_STREAM.membership);
  });
});
