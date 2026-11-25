import { CLASSIFICATIONS, FlowStreamKey } from '../revenueClassifications';
import {
  BRAND_BASIS,
  BRAND_BY_STREAM,
  BRAND_NOTE_BY_STREAM,
  BRAND_ORDER,
  DEMAND_BRAND_NOTE,
  UNASSIGNED_BRAND_KEY,
  assertBrandGroupingIsHonest,
  assertBrandMappingIsComplete,
  buildBrandGroups,
} from '../streamBrands';

/**
 * R25 — the Revenue Room, broken down by brand.
 *
 * Ali, 2026-11-24: "Everything in the revenue tab should be broken down by brand. We can
 * default to Colaberry training but FDE hiring should be connected to hire.refactored.ai
 * brand, Enterprise site sales should be connected to its brand."
 *
 * These test the failures that would render as FACTS about the business rather than as a
 * broken page: a stream counted under two brands, a stream that vanishes from a grouped
 * board, a brand heading with nothing under it reading as "earned nothing", a fallback
 * label presented as the brand's real name, and the honesty sentence being deleted as
 * clutter.
 */

/**
 * The stream keys that actually exist, derived from the classification registry at run time
 * rather than from a hand-written list.
 *
 * Deliberately NOT read from `BRAND_BY_STREAM`, which is the thing under test: checking a map
 * against itself would pass for a map missing half the streams. `revenueClassifications.ts`
 * is past the repo's hard line ceiling, so it gains no new export for this.
 */
const STREAM_KEYS: FlowStreamKey[] =
  Array.from(new Set(CLASSIFICATIONS.map((c) => c.stream)));

const DIRECTORY = [
  { slug: 'colaberry-training', name: 'Colaberry Training', url: 'https://training.colaberry.com', status: 'active' },
  { slug: 'colaberry-enterprise', name: 'Colaberry Enterprise', url: 'https://enterprise.colaberry.ai', status: 'active' },
  { slug: 'refactored', name: 'Refactored.ai', url: 'https://refactored.ai', status: 'active' },
];

/** The six streams the board builds today, in the board's own order. */
const ALL_STREAMS = [
  { key: 'membership' as const },
  { key: 'gov_pipeline' as const },
  { key: 'enterprise_site' as const },
  { key: 'hypotheses' as const },
  { key: 'hire_fde' as const },
  { key: 'subscription_conversion' as const },
];

const groupFor = (key: string, groups = buildBrandGroups(ALL_STREAMS, DIRECTORY)) =>
  groups.find((g) => g.key === key);

describe('every stream belongs to exactly one brand', () => {
  /**
   * The regression this prevents is a SEVENTH stream being added later and quietly having no
   * brand, which on a grouped page means it does not render at all.
   */
  it('maps every stream key the registry declares', () => {
    expect(() => assertBrandMappingIsComplete(STREAM_KEYS)).not.toThrow();
    for (const key of STREAM_KEYS) {
      expect(BRAND_BY_STREAM).toHaveProperty(key);
      expect(BRAND_NOTE_BY_STREAM[key].trim().length).toBeGreaterThan(10);
    }
  });

  it('files the streams the way Ali named them', () => {
    expect(BRAND_BY_STREAM.membership).toBe('colaberry-training');
    expect(BRAND_BY_STREAM.subscription_conversion).toBe('colaberry-training');
    expect(BRAND_BY_STREAM.enterprise_site).toBe('colaberry-enterprise');
    expect(BRAND_BY_STREAM.hire_fde).toBe('refactored');
  });

  /**
   * hire.refactored.ai is a web DOMAIN of the existing `refactored` brand in production,
   * added 2026-11-14, not a brand of its own. Pointing the stream at a brand slug that does
   * not exist would leave the heading permanently unresolved.
   */
  it('points FDE hiring at a brand that exists, not at the hostname', () => {
    expect(BRAND_BY_STREAM.hire_fde).toBe('refactored');
    expect(BRAND_BY_STREAM.hire_fde).not.toMatch(/hire\./);
  });

  /** "No brand yet" is a different statement from "this brand earned nothing". */
  it('leaves the declared-but-unbuilt bets unassigned rather than defaulting them', () => {
    expect(BRAND_BY_STREAM.hypotheses).toBeNull();
    expect(groupFor(UNASSIGNED_BRAND_KEY)!.streamKeys).toEqual(['hypotheses']);
  });

  it('puts each stream under one group and no stream under none', () => {
    const groups = buildBrandGroups(ALL_STREAMS, DIRECTORY);
    const all = groups.flatMap((g) => g.streamKeys);
    expect(all.sort()).toEqual(ALL_STREAMS.map((s) => s.key).sort());
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('the grouping reads in a fixed order', () => {
  it('follows BRAND_ORDER rather than revenue size', () => {
    const groups = buildBrandGroups(ALL_STREAMS, DIRECTORY);
    expect(groups.map((g) => g.key)).toEqual(BRAND_ORDER);
  });

  /** Stream order inside a group is the board's, so the page does not re-sort behind it. */
  it('keeps the board order inside each group', () => {
    const groups = buildBrandGroups(ALL_STREAMS, DIRECTORY);
    expect(groupFor('colaberry-enterprise', groups)!.streamKeys)
      .toEqual(['gov_pipeline', 'enterprise_site']);
  });

  /**
   * A heading with nothing under it reads as a brand that earned nothing, when the truth is
   * that no stream was built for it at all.
   */
  it('omits a brand with no streams on the board instead of rendering it empty', () => {
    const groups = buildBrandGroups([{ key: 'membership' as const }], DIRECTORY);
    expect(groups.map((g) => g.key)).toEqual(['colaberry-training']);
    expect(groups.some((g) => g.streamKeys.length === 0)).toBe(false);
  });
});

describe('a brand is named by the brands table, and says so when it is not', () => {
  it('takes the label and url from the directory', () => {
    const g = groupFor('refactored')!;
    expect(g.label).toBe('Refactored.ai');
    expect(g.url).toBe('https://refactored.ai');
    expect(g.resolved).toBe(true);
    expect(g.note).toBe('');
  });

  /**
   * The degraded case has to be visibly degraded. A fallback label rendered as though it
   * came from the brand's own record is how two screens start disagreeing about a name.
   */
  it('falls back to a declared label and marks it unresolved', () => {
    const g = groupFor('refactored', buildBrandGroups(ALL_STREAMS, []))!;
    expect(g.label).toBe('Refactored.ai');
    expect(g.resolved).toBe(false);
    expect(g.note).toMatch(/may be out of date/);
  });

  it('still groups correctly when the directory is empty', () => {
    const groups = buildBrandGroups(ALL_STREAMS, []);
    expect(groups.map((g) => g.key)).toEqual(BRAND_ORDER);
    expect(groups.flatMap((g) => g.streamKeys).sort())
      .toEqual(ALL_STREAMS.map((s) => s.key).sort());
  });

  it('treats the unassigned bucket as a bucket, not a brand', () => {
    const g = groupFor(UNASSIGNED_BRAND_KEY)!;
    expect(g.isBrand).toBe(false);
    expect(g.url).toBeNull();
    expect(g.resolved).toBe(false);
    expect(g.note.length).toBeGreaterThan(40);
  });

  /** Every real brand must be reachable, because the heading is also a link to the brand. */
  it('gives every resolved brand a url', () => {
    for (const g of buildBrandGroups(ALL_STREAMS, DIRECTORY)) {
      if (g.isBrand) expect(g.url).toMatch(/^https:\/\//);
    }
  });
});

describe('a grouping that would misreport the business is refused', () => {
  const groups = () => buildBrandGroups(ALL_STREAMS, DIRECTORY);

  it('accepts the real grouping', () => {
    expect(() => assertBrandGroupingIsHonest(groups(), ALL_STREAMS)).not.toThrow();
  });

  /** The worst case: one stream's revenue appearing under two brands. */
  it('refuses a stream filed under two brands', () => {
    const bad = groups();
    bad[1].streamKeys = [...bad[1].streamKeys, 'membership'];
    expect(() => assertBrandGroupingIsHonest(bad, ALL_STREAMS))
      .toThrow(/more than one brand/);
  });

  it('refuses a board where a stream has no brand at all', () => {
    const bad = groups().filter((g) => g.key !== UNASSIGNED_BRAND_KEY);
    expect(() => assertBrandGroupingIsHonest(bad, ALL_STREAMS))
      .toThrow(/under no brand/);
  });

  it('refuses an empty heading', () => {
    const bad = groups();
    bad[0].streamKeys = [];
    expect(() => assertBrandGroupingIsHonest(bad, ALL_STREAMS))
      .toThrow(/holds no stream/);
  });

  it('refuses a brand with a blank label', () => {
    const bad = groups();
    bad[0].label = '   ';
    expect(() => assertBrandGroupingIsHonest(bad, ALL_STREAMS))
      .toThrow(/no label/);
  });

  it('refuses a stream key the mapping does not know', () => {
    expect(() => assertBrandMappingIsComplete(['not_a_stream' as never]))
      .toThrow(/no brand declared/);
  });
});

describe('the page never claims a per-payment brand attribution', () => {
  /**
   * Measured on production 2026-11-24: of the tables this board reads, only `campaigns`
   * carries a brand_id. subscriptions, enrollments, leads, enterprise_intakes and
   * gov_qualifications do not. The sentence saying so is the whole reason this grouping is
   * honest, and deleting it would look like removing boilerplate.
   */
  it('states that brand is a property of the stream, not of each payment', () => {
    expect(BRAND_BASIS).toMatch(/property of the stream/i);
    expect(BRAND_BASIS).toMatch(/not of each payment/i);
    expect(BRAND_BASIS).toMatch(/subscriptions/);
    expect(BRAND_BASIS).toMatch(/no brand column/i);
  });

  /**
   * The one place real brand data exists disagrees with the map: all four membership
   * campaigns are tagged colaberry-enterprise while the members are filed under training.
   * The note that explains it must survive.
   */
  it('keeps the note explaining why the campaigns disagree with the heading', () => {
    expect(DEMAND_BRAND_NOTE).toMatch(/Colaberry Enterprise/);
    expect(DEMAND_BRAND_NOTE).toMatch(/Colaberry Training/);
    expect(DEMAND_BRAND_NOTE).toMatch(/reconcil/i);
  });

  /**
   * No money on a brand group, structurally. A brand heading that printed a total would be a
   * second revenue figure derived differently from the stream headlines beneath it, which is
   * the same error the demand path refuses.
   */
  it('carries no money field on any group', () => {
    const flat = JSON.stringify(buildBrandGroups(ALL_STREAMS, DIRECTORY));
    expect(flat).not.toMatch(/cents/i);
    expect(flat).not.toMatch(/\$/);
  });

  /** Positive control: the detector above would catch a figure if one were present. */
  it('control: the same detector sees money when it is there', () => {
    const withMoney = JSON.stringify([
      ...buildBrandGroups(ALL_STREAMS, DIRECTORY),
      { key: 'x', totalCents: 1234 },
    ]);
    expect(withMoney).toMatch(/cents/i);
  });
});
