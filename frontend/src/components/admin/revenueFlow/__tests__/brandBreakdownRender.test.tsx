import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import FlowHeroRow, { figureScope } from '../FlowHeroRow';
import BrandFilterBar from '../BrandFilterBar';
import BrandHeading from '../BrandHeading';
import { groupStreamsByBrand, scopeStreams } from '../brandScope';
import type { BoardHeadline, BrandGroup, Stream } from '../flowBoardTypes';

/**
 * R25 Phase 2 — the Revenue Room broken down by brand, as the page renders it.
 *
 * Ali, 2026-11-24, on the live Revenue Room: "Everything in the revenue tab should be broken
 * down by brand. We can default to Colaberry training but FDE hiring should be connected to
 * hire.refactored.ai brand, Enterprise site sales should be connected to its brand."
 *
 * ── WHAT THESE TESTS ARE FOR ─────────────────────────────────────────────────────────────
 *
 * Not "does the filter work". They cover the failures that would render as FACTS ABOUT THE
 * BUSINESS rather than as a broken page, which is a much smaller and much more important set:
 *
 *   1. Colaberry Training's $54,900 appearing under the Refactored.ai heading. This is the
 *      single worst thing this page could do — a real number attributed to a brand that has
 *      booked nothing, and it looks like an answer. Every one of the four tiles across the
 *      top is a single stream's figure under a board-level label, so this was the default
 *      behaviour until the tiles were scoped.
 *   2. A tile silently vanishing. A figure with no declared source would match no brand and
 *      disappear under every filter, taking a real number off the page with nothing logged.
 *   3. A brand heading with nothing under it, which reads as "this brand earned nothing"
 *      when the truth is that it was filtered out of view.
 *   4. A stale stream filter surviving a brand change, putting one brand's card under
 *      another brand's heading.
 *   5. A fallback brand name presented silently as the brand's real name, so this board and
 *      the Brands admin page show one brand under two names with neither admitting it.
 *   6. The "No brand yet" bucket being presented as a fourth brand.
 *
 * ── WHY EVERY ASSERTION HAS A POSITIVE CONTROL ───────────────────────────────────────────
 *
 * `expect(html).not.toContain('$54,900')` passes just as happily when the component rendered
 * nothing at all, when the fixture never held that figure, and when a typo renamed it. So
 * each absence is paired with the render that must CONTAIN it. An absence asserted without
 * its control is not evidence.
 */

/**
 * Which stream each headline figure comes from, exactly as the backend ships it.
 *
 * Written out here rather than imported, deliberately: the backend map is the thing under
 * test on the other side of the contract, and a frontend test that read it would pass for a
 * map that had quietly re-pointed every figure at one stream. `streamBrands.test.ts` and
 * `revenueFlowService.test.ts` hold the backend half.
 */
const FIGURE_STREAMS: Record<string, string> = {
  bookedAnnualized: 'membership',
  possibleWinnings: 'gov_pipeline',
  possibleWinningsAnnualized: 'gov_pipeline',
  wonValue: 'gov_pipeline',
  lostValue: 'gov_pipeline',
  winRate: 'gov_pipeline',
  unpricedBids: 'gov_pipeline',
};

/** The live production figures on 2026-11-24, so the test fails the way the page would. */
const HEADLINE: BoardHeadline = {
  bookedAnnualized: {
    cents: 5_490_000,
    display: '$54,900',
    provenance: 'Active subscriptions carrying a PaySimple payment id, annualized.',
  },
  possibleWinnings: {
    cents: 1_200_000,
    display: '$12,000',
    provenance: 'Total contract value of priced bids with no recorded outcome.',
  },
  possibleWinningsAnnualized: {
    cents: 400_000,
    display: '$4,000',
    provenance: "The same open pipeline divided by each contract's recorded term.",
  },
  wonValue: {
    cents: null,
    display: 'None yet',
    provenance: 'No gov_submission row carries outcome=won.',
  },
  lostValue: {
    cents: null,
    display: 'None yet',
    provenance: 'No gov_submission row carries outcome=lost.',
  },
  winRate: null,
  winRateBasis: 'No bid has been decided yet, so there is no rate to report.',
  unpricedBids: 3,
};

const TRAINING_STREAMS = ['membership', 'subscription_conversion'];
const ENTERPRISE_STREAMS = ['enterprise_site', 'gov_pipeline'];
const REFACTORED_STREAMS = ['hire_fde'];

const hero = (visible: string[] | null, scopeLabel: string | null = null, figures = FIGURE_STREAMS) =>
  renderToStaticMarkup(
    <FlowHeroRow
      headline={HEADLINE}
      figureStreams={figures}
      visibleStreamKeys={visible}
      scopeLabel={scopeLabel}
    />,
  );

// ── 1. THE ONE THAT MATTERS MOST ──────────────────────────────────────────────────────────

describe('the top figures never appear under a brand they do not belong to', () => {
  it('shows all four figures when no brand is selected', () => {
    const html = hero(null);
    // The positive control for every absence asserted below.
    expect(html).toContain('$54,900');
    expect(html).toContain('$12,000');
    expect(html).toContain('$4,000');
    expect(html).toContain('data-testid="hero-booked"');
    expect(html).toContain('data-testid="hero-winnings"');
    expect(html).toContain('data-testid="hero-winnings-annual"');
    expect(html).toContain('data-testid="hero-won"');
  });

  it('shows NO figure under Refactored.ai, and says so instead of showing a zero', () => {
    const html = hero(REFACTORED_STREAMS, 'Refactored.ai');

    // The failure this whole phase exists to prevent.
    expect(html).not.toContain('$54,900');
    expect(html).not.toContain('$12,000');
    expect(html).not.toContain('$4,000');
    expect(html).not.toContain('data-testid="hero-booked"');

    // And the absence is stated rather than left as an empty row, which reads as a page that
    // failed to load.
    expect(html).toContain('data-testid="hero-none-for-scope"');
    expect(html).toContain('Refactored.ai');
    expect(html).toContain('there is no figure to show here rather than a zero');
  });

  it('never prints a zero for a brand with no figures, because nobody measured one', () => {
    const html = hero(REFACTORED_STREAMS, 'Refactored.ai');
    expect(html).toContain('A zero would say this brand earned nothing');
    expect(html).not.toContain('$0');
  });

  it('keeps booked revenue under Colaberry Training and drops the pipeline figures', () => {
    const html = hero(TRAINING_STREAMS, 'Colaberry Training');
    expect(html).toContain('$54,900');
    expect(html).toContain('data-testid="hero-booked"');

    expect(html).not.toContain('data-testid="hero-winnings"');
    expect(html).not.toContain('data-testid="hero-won"');
    expect(html).not.toContain('$12,000');
  });

  it('keeps the pipeline figures under Colaberry Enterprise and drops booked revenue', () => {
    const html = hero(ENTERPRISE_STREAMS, 'Colaberry Enterprise');
    expect(html).toContain('$12,000');
    expect(html).toContain('$4,000');
    expect(html).toContain('data-testid="hero-winnings"');

    expect(html).not.toContain('$54,900');
    expect(html).not.toContain('data-testid="hero-booked"');
  });

  it('counts the figures it removed, so a shortened row is not mistaken for the whole picture', () => {
    const training = hero(TRAINING_STREAMS, 'Colaberry Training');
    expect(training).toContain('data-testid="hero-hidden-note"');
    expect(training).toContain('3 figures');

    const enterprise = hero(ENTERPRISE_STREAMS, 'Colaberry Enterprise');
    expect(enterprise).toContain('1 figure from the top of this board belongs to another brand');
  });

  it('says nothing about hidden figures when nothing is hidden', () => {
    // The control for the two assertions above: the note must be a consequence of filtering,
    // not a permanent fixture that happens to read correctly.
    expect(hero(null)).not.toContain('data-testid="hero-hidden-note"');
  });
});

// ── 2. THE WIN-RATE SENTENCE TRAVELS WITH ITS TILE ────────────────────────────────────────

describe('the win-rate basis does not outlive the tile it explains', () => {
  it('renders beside the Won tile', () => {
    expect(hero(null)).toContain('data-testid="winrate-basis"');
    expect(hero(ENTERPRISE_STREAMS)).toContain('data-testid="winrate-basis"');
  });

  it('disappears with it, instead of explaining a tile that is no longer on screen', () => {
    // Left behind, this sentence about government bids would read as a statement about
    // Colaberry Training, which has no bids at all.
    const html = hero(TRAINING_STREAMS, 'Colaberry Training');
    expect(html).not.toContain('data-testid="winrate-basis"');
    expect(html).not.toContain('No bid has been decided yet');
  });
});

// ── 3. A FIGURE WITH NO DECLARED SOURCE IS REPORTED, NEVER DROPPED ────────────────────────

describe('a headline figure the payload did not attribute to a stream', () => {
  const noBooked = { ...FIGURE_STREAMS };
  delete noBooked.bookedAnnualized;

  it('is classified as unattributed rather than silently out of scope', () => {
    expect(figureScope('bookedAnnualized', FIGURE_STREAMS, null)).toBe('in');
    expect(figureScope('bookedAnnualized', FIGURE_STREAMS, REFACTORED_STREAMS)).toBe('out');
    expect(figureScope('bookedAnnualized', noBooked, REFACTORED_STREAMS)).toBe('unattributed');
  });

  it('still renders, under every brand, with its lack of attribution stated', () => {
    const html = hero(REFACTORED_STREAMS, 'Refactored.ai', noBooked);
    // The number must not leave the page with nothing logged anywhere.
    expect(html).toContain('$54,900');
    expect(html).toContain('data-testid="hero-unattributed"');
    expect(html).toContain('not attributed to any stream');
  });

  it('says nothing about attribution when every figure is attributed', () => {
    expect(hero(REFACTORED_STREAMS, 'Refactored.ai')).not.toContain('data-testid="hero-unattributed"');
    expect(hero(null)).not.toContain('data-testid="hero-unattributed"');
  });
});

// ── 4. THE FILTER ITSELF ──────────────────────────────────────────────────────────────────

const BRANDS: BrandGroup[] = [
  {
    key: 'colaberry-training',
    label: 'Colaberry Training',
    url: 'https://training.colaberry.com',
    resolved: true,
    isBrand: true,
    note: '',
    streamKeys: TRAINING_STREAMS,
  },
  {
    key: 'colaberry-enterprise',
    label: 'Colaberry Enterprise',
    url: 'https://enterprise.colaberry.ai',
    resolved: true,
    isBrand: true,
    note: '',
    streamKeys: ENTERPRISE_STREAMS,
  },
  {
    key: 'refactored',
    label: 'Refactored.ai',
    url: 'https://refactored.ai',
    resolved: true,
    isBrand: true,
    note: '',
    streamKeys: REFACTORED_STREAMS,
  },
  {
    key: 'unassigned',
    label: 'No brand yet',
    url: null,
    resolved: false,
    isBrand: false,
    note: 'Declared sources that do not belong to one brand.',
    streamKeys: ['hypotheses'],
  },
];

const BASIS =
  'Brand is a property of the stream, not of each payment. No revenue table in this database '
  + 'carries a brand.';

const filterBar = (brands: BrandGroup[], selected = '') =>
  renderToStaticMarkup(
    <BrandFilterBar
      brands={brands}
      brandFilter={selected}
      onPickBrand={() => undefined}
      brandBasis={BASIS}
    />,
  );

describe('the brand filter', () => {
  it('offers every brand plus a way back to all of them', () => {
    const html = filterBar(BRANDS);
    expect(html).toContain('data-testid="brand-filter-all"');
    for (const b of BRANDS) expect(html).toContain(`data-testid="brand-filter-${b.key}"`);
  });

  it('marks the selected brand for a screen reader, not by colour alone', () => {
    const html = filterBar(BRANDS, 'refactored');
    expect(html).toContain('aria-pressed="true"');
    // The control: something must be unpressed, or the assertion above proves nothing.
    expect(html).toContain('aria-pressed="false"');
  });

  it('prints the basis sentence, which is what makes this a grouping and not a claim', () => {
    const html = filterBar(BRANDS);
    expect(html).toContain('data-testid="brand-basis"');
    expect(html).toContain('not of each payment');
  });

  it('shows how many streams sit behind each brand', () => {
    // One stream under a heading is a different thing from four, and the number is what stops
    // "Refactored.ai" reading as a whole business line.
    expect(filterBar(BRANDS)).toContain('>1<');
  });

  it('draws nothing at all when the grouping could not be built', () => {
    // The degraded path. A bar reading "All brands" with no brands behind it would imply the
    // filter works and quietly do nothing.
    expect(filterBar([])).toBe('');
  });

  it('admits when a brand name came from a fallback rather than the brands table', () => {
    const unresolved = BRANDS.map((b) => (
      b.key === 'refactored' ? { ...b, resolved: false } : b
    ));
    const html = filterBar(unresolved);
    expect(html).toContain('data-testid="brand-unresolved"');
    expect(html).toContain('may be out of date');

    // The control: with every name resolved, no such admission is made.
    expect(filterBar(BRANDS)).not.toContain('data-testid="brand-unresolved"');
  });
});

// ── 5. THE HEADINGS ──────────────────────────────────────────────────────────────────────

const heading = (brand: BrandGroup, count = 2) =>
  renderToStaticMarkup(<BrandHeading brand={brand} streamCount={count} />);

describe('a brand heading', () => {
  it('links to the brand it names', () => {
    const html = heading(BRANDS[2]);
    expect(html).toContain('data-testid="brand-link-refactored"');
    expect(html).toContain('refactored.ai');
  });

  it('never presents the unassigned bucket as a brand', () => {
    const html = heading(BRANDS[3], 1);
    expect(html).toContain('data-testid="brand-not-a-brand-unassigned"');
    expect(html).toContain('(not a brand)');
    // No link, because there is no brand to link to.
    expect(html).not.toContain('data-testid="brand-link-unassigned"');

    // The control: a real brand is NOT labelled this way.
    expect(heading(BRANDS[0])).not.toContain('(not a brand)');
  });

  it('refuses it a brand link even if a URL arrives in the payload', () => {
    /*
     * Added because the mutation check caught this one surviving. `resolveBrand` sends
     * `url: null` for the bucket today, so the assertion above could not tell whether the
     * `brand.isBrand` guard or the null URL was doing the work — removing the guard left every
     * test passing. A bucket carrying a URL must still never be drawn as a brand.
     */
    const html = heading({ ...BRANDS[3], url: 'https://example.com' }, 1);
    expect(html).not.toContain('data-testid="brand-link-unassigned"');
    expect(html).not.toContain('example.com');

    // The control: a real brand with the very same URL DOES get the link.
    expect(heading({ ...BRANDS[2], url: 'https://example.com' }))
      .toContain('data-testid="brand-link-refactored"');
  });

  it('flags a name it could not read from the brands table', () => {
    const html = heading({ ...BRANDS[0], resolved: false });
    expect(html).toContain('Name may be out of date');
    expect(heading(BRANDS[0])).not.toContain('Name may be out of date');
  });

  it('counts its streams in words that read correctly for one', () => {
    expect(heading(BRANDS[2], 1)).toContain('1 stream');
    expect(heading(BRANDS[2], 1)).not.toContain('1 streams');
    expect(heading(BRANDS[0], 2)).toContain('2 streams');
  });
});

// ── 6. THE SCOPE RULES ───────────────────────────────────────────────────────────────────

const stream = (key: string, brandKey: string): Stream => ({
  key,
  label: key,
  brandKey,
  status: 'live',
  headline: { cents: 0, display: '$0', provenance: 'p' },
  funnel: [],
  provenance: 'p',
  caveat: null,
  drillDownKey: null,
});

const STREAMS: Stream[] = [
  stream('membership', 'colaberry-training'),
  stream('subscription_conversion', 'colaberry-training'),
  stream('enterprise_site', 'colaberry-enterprise'),
  stream('gov_pipeline', 'colaberry-enterprise'),
  stream('hire_fde', 'refactored'),
  stream('hypotheses', 'unassigned'),
];

describe('resolving the brand and stream filters into one answer', () => {
  it('shows everything, and reports nothing filtered, when neither filter is set', () => {
    const s = scopeStreams(STREAMS, '', '');
    expect(s.streams).toHaveLength(6);
    expect(s.filtered).toBe(false);
  });

  it('narrows to one brand', () => {
    const s = scopeStreams(STREAMS, 'colaberry-enterprise', '');
    expect(s.keys).toEqual(['enterprise_site', 'gov_pipeline']);
    expect(s.filtered).toBe(true);
  });

  it('IGNORES a stream filter naming a stream outside the chosen brand', () => {
    // The regression this guards: the reader filters to the government pipeline, then switches
    // brand to Refactored.ai. A stored filter would survive and render a Colaberry Enterprise
    // card under the Refactored.ai heading.
    const s = scopeStreams(STREAMS, 'refactored', 'gov_pipeline');
    expect(s.effectiveStream).toBe('');
    expect(s.keys).toEqual(['hire_fde']);
    expect(s.keys).not.toContain('gov_pipeline');
  });

  it('brings that stream choice back when the reader returns to its brand', () => {
    // The control for the rule above: the filter is derived, not discarded, so it is still
    // there. Resetting it in an effect would have thrown it away.
    const s = scopeStreams(STREAMS, 'colaberry-enterprise', 'gov_pipeline');
    expect(s.effectiveStream).toBe('gov_pipeline');
    expect(s.keys).toEqual(['gov_pipeline']);
  });

  it('still offers the whole brand to the stream buttons while one stream is selected', () => {
    // Otherwise picking a stream would remove every other button and trap the reader.
    const s = scopeStreams(STREAMS, 'colaberry-enterprise', 'gov_pipeline');
    expect(s.brandStreams.map((x) => x.key)).toEqual(['enterprise_site', 'gov_pipeline']);
  });
});

describe('grouping the visible streams under their brands', () => {
  it('puts every stream under exactly one heading, in the order the backend chose', () => {
    const groups = groupStreamsByBrand(BRANDS, STREAMS);
    expect(groups.map((g) => g.brand.key)).toEqual([
      'colaberry-training', 'colaberry-enterprise', 'refactored', 'unassigned',
    ]);

    const placed = groups.flatMap((g) => g.streams.map((s) => s.key));
    expect(placed).toHaveLength(STREAMS.length);
    expect(new Set(placed).size).toBe(STREAMS.length);
  });

  it('drops a brand with nothing visible rather than rendering an empty heading', () => {
    // An empty heading reads as "this brand earned nothing", which is a measurement nobody
    // made. A brand filtered out of view has simply not been asked about.
    const groups = groupStreamsByBrand(
      BRANDS,
      STREAMS.filter((s) => s.brandKey === 'refactored'),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].brand.key).toBe('refactored');
  });

  it('groups nothing when the backend could not build the grouping', () => {
    // The dashboard falls back to a flat list here, so the revenue is still on the page.
    expect(groupStreamsByBrand([], STREAMS)).toEqual([]);
  });
});
