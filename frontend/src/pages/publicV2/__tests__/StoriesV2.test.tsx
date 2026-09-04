import { STORIES, STORIES_NOTICE } from '../../../config/v2Stories';
import { summary } from '../../../components/caseStudy/__fixtures__/caseStudyPublicFixtures';
import { emptyStateFor } from '../storiesV2Model';

/**
 * StoriesV2 - what the page shows: the data path, the ledger, the four states,
 * and what a card is allowed to print.
 *
 * The filter engine, its URL, its accessibility and its tracking are the other
 * half of this page and live in `StoriesV2.filters.test.tsx`. Source-level rules
 * - the fixture is unimported, the tokens all exist - are in
 * `storiesV2Contract.test.ts`.
 *
 * THE MOCK IS PARTIAL ON PURPOSE. Only the two network calls are replaced;
 * `describeCaseStudyError` and the filter helpers stay real, so the failure copy
 * a reader sees is the copy the shipped client produces.
 */

jest.mock('../../../services/caseStudyApi', () => {
  const actual = jest.requireActual('../../../services/caseStudyApi');
  return { ...actual, fetchCaseStudyIndex: jest.fn(), fetchCaseStudyTaxonomy: jest.fn() };
});

/* eslint-disable import/first */
import * as api from '../../../services/caseStudyApi';
import * as H from '../__fixtures__/storiesIndexHarness';
/* eslint-enable import/first */

const indexMock = api.fetchCaseStudyIndex as jest.MockedFunction<typeof api.fetchCaseStudyIndex>;
const taxonomyMock = api.fetchCaseStudyTaxonomy as jest.MockedFunction<
  typeof api.fetchCaseStudyTaxonomy
>;

beforeEach(() => {
  taxonomyMock.mockResolvedValue(H.TAXONOMY);
  indexMock.mockResolvedValue(H.list());
});

afterEach(() => {
  H.unmount();
  jest.clearAllMocks();
});

/* ------------------------------------------------------ the data path --- */

describe('the production data path is the API, not the illustrative fixture', () => {
  it('reads the Case Study API on mount', async () => {
    H.mount();
    await H.settle();
    expect(indexMock).toHaveBeenCalledTimes(1);
    expect(taxonomyMock).toHaveBeenCalledTimes(1);
  });

  it('prints none of the illustrative stories, headline or notice', async () => {
    H.mount();
    await H.settle();
    const rendered = H.text();
    expect(STORIES.length).toBeGreaterThan(0);
    for (const story of STORIES) {
      expect(rendered).not.toContain(story.headline);
      expect(rendered).not.toContain(story.who);
    }
    expect(rendered).not.toContain(STORIES_NOTICE);
    // "Illustrative demo" IS allowed to appear - as a facet a reader may tick.
    // What must never appear is a RECORD carrying that class among the results.
    expect(H.all('[data-verification-class="illustrative"]')).toEqual([]);
  });

  it('renders the masthead the SERVER sent, not the pre-flight copy, once loaded', async () => {
    H.mount();
    await H.settle();
    expect(H.text()).toContain(H.SURFACE.hero.description);
  });

  it('shows the pre-flight masthead before the first response, with no counts in it', () => {
    indexMock.mockReturnValue(new Promise(() => {}));
    const html = H.staticHtml();
    expect(H.textOf(html)).toContain('What we shipped, and who built it.');
    // No ledger, because there are no counts yet. A placeholder figure here
    // would be the one invented number on a page about not inventing them.
    expect(html).not.toContain('cbv2-cs-ledger');
  });
});

/* ------------------------------------------------- masthead and ledger --- */

describe('the ledger is dynamic, with no hardcoded count', () => {
  it('prints exactly the four counts the response carried', async () => {
    indexMock.mockResolvedValue(H.list({
      ledger: H.ledger({ projects: 7, verifiedOutcomes: 5, publicRepositories: 4, shipped: 3 }),
    }));
    H.mount();
    await H.settle();
    expect(H.all('.cbv2-cs-ledger__value').map((n) => n.textContent))
      .toEqual(['7', '5', '4', '3']);
  });

  it('prints a different set when the response carries a different set', async () => {
    // Guarding the guard: a hardcoded ledger would pass the test above too.
    indexMock.mockResolvedValue(H.list({
      ledger: H.ledger({ projects: 11, verifiedOutcomes: 9, publicRepositories: 8, shipped: 6 }),
    }));
    H.mount();
    await H.settle();
    expect(H.all('.cbv2-cs-ledger__value').map((n) => n.textContent))
      .toEqual(['11', '9', '8', '6']);
  });
});

/* ------------------------------------------------------- empty states --- */

describe('an empty list is two different situations, and a failure is neither', () => {
  it('states the two sentences differently, so the rest of this block means something', () => {
    expect(H.FILTERED_EMPTY).not.toEqual(H.LIBRARY_EMPTY);
    expect(emptyStateFor([], H.ledger({ projects: 3 }))).toBe('filtered');
    expect(emptyStateFor([], H.ledger({ projects: 0 }))).toBe('library');
    expect(emptyStateFor([summary()], H.ledger({ projects: 0 }))).toBeNull();
  });

  it('says "no match" when records exist but none came back', async () => {
    indexMock.mockResolvedValue(H.list({ items: [], total: 0, ledger: H.ledger({ projects: 3 }) }));
    H.mount('/proof?capability=agents');
    await H.settle();
    expect(H.text()).toContain(H.FILTERED_EMPTY);
    expect(H.text()).not.toContain(H.LIBRARY_EMPTY);
    expect(H.q('[data-testid="stories-empty"]')?.getAttribute('data-empty')).toBe('filtered');
  });

  it('says "no match" UNFILTERED, when the default exclusion is what emptied it', async () => {
    // The case where the two candidate discriminators disagree, and the only one
    // that can tell them apart. Mounted with NO filters in the URL, but the
    // library holds 3 published records — so the emptiness came from the default
    // `illustrative` exclusion, not from the reader.
    //
    // Deciding on filter state would say "we're verifying the first project
    // records" while the ledger three feet above reads 3. Deciding on the
    // unfiltered ledger says "no match", which is true.
    //
    // Verification found this scenario uncovered: inlining the decision at the
    // call site changed behaviour in exactly this case and no test moved.
    indexMock.mockResolvedValue(H.list({ items: [], total: 0, ledger: H.ledger({ projects: 3 }) }));
    H.mount('/proof');
    await H.settle();

    expect(H.q('[data-testid="stories-empty"]')?.getAttribute('data-empty')).toBe('filtered');
    expect(H.text()).toContain(H.FILTERED_EMPTY);
    expect(H.text()).not.toContain(H.LIBRARY_EMPTY);
  });

  it('says the library is still being built only when nothing is published at all', async () => {
    indexMock.mockResolvedValue(H.list({
      items: [],
      total: 0,
      ledger: H.ledger({ projects: 0, verifiedOutcomes: 0, publicRepositories: 0, shipped: 0 }),
    }));
    H.mount();
    await H.settle();
    expect(H.text()).toContain(H.LIBRARY_EMPTY);
    expect(H.text()).not.toContain(H.FILTERED_EMPTY);
    expect(H.q('[data-testid="stories-empty"]')?.getAttribute('data-empty')).toBe('library');
  });

  it('invents no NDA explanation for either', async () => {
    indexMock.mockResolvedValue(H.list({ items: [], total: 0, ledger: H.ledger({ projects: 0 }) }));
    H.mount();
    await H.settle();
    // \b on NDA, or it matches inside "proof standard".
    expect(H.text()).not.toMatch(/\bNDA\b|confidential|under wraps/i);
  });

  it('says a failed load failed, and never that the library is empty', async () => {
    // The collapse this guards against shipped once already: the admin leads
    // page caught a failed fetch, left its rows at [], and said "No leads yet"
    // against 24,244 real rows.
    indexMock.mockRejectedValue(new api.CaseStudyRequestError('UpstreamUnavailable', 'boom'));
    H.mount();
    await H.settle();
    expect(H.q('[data-testid="stories-failure"]')).not.toBeNull();
    expect(H.text()).toContain('We could not load these project records');
    expect(H.text()).not.toContain(H.LIBRARY_EMPTY);
    expect(H.text()).not.toContain(H.FILTERED_EMPTY);
  });

  it('offers a retry that actually re-requests', async () => {
    indexMock.mockRejectedValueOnce(new api.CaseStudyRequestError('TimeoutError', 'slow'));
    H.mount();
    await H.settle();
    H.click('[data-testid="stories-retry"]');
    await H.settle();
    expect(indexMock).toHaveBeenCalledTimes(2);
    expect(H.q('[data-testid="stories-failure"]')).toBeNull();
  });

  it('says it is loading, and claims neither emptiness while it does', () => {
    indexMock.mockReturnValue(new Promise(() => {}));
    H.mount();
    expect(H.text()).toContain('Loading published project records.');
    expect(H.text()).not.toContain(H.LIBRARY_EMPTY);
    expect(H.text()).not.toContain(H.FILTERED_EMPTY);
  });
});

/* -------------------------------------------------------------- cards --- */

describe('cards route to the detail page and invent nothing', () => {
  it('links each card title to /stories/:slug', async () => {
    H.mount();
    await H.settle();
    expect(H.q('[data-case-study="sample-record"] a.cbv2-cs-card__link')?.getAttribute('href'))
      .toBe('/stories/sample-record');
  });

  it('renders a proof-point card, not a number, when nothing was verified', async () => {
    indexMock.mockResolvedValue(H.list({ items: [H.NO_METRIC], total: 1 }));
    H.mount();
    await H.settle();
    const card = H.q('[data-case-study="no-metric-record"]')!;
    expect(card.getAttribute('data-headline')).toBe('proof-point');
    expect(card.textContent).toContain('Retrieval');
    // The whole point: a record with no figure produces a card with no figure.
    expect(card.textContent?.match(/\d/g) ?? []).toEqual([]);
  });

  it('prints no digit a card did not receive', async () => {
    const record = summary();
    indexMock.mockResolvedValue(H.list({ items: [record], total: 1 }));
    H.mount();
    await H.settle();
    const payload = JSON.stringify(record);
    const digits = (H.q('[data-case-study="sample-record"]')?.textContent ?? '').match(/\d+/g) ?? [];
    expect(digits.length).toBeGreaterThan(0);
    for (const group of digits) expect(payload).toContain(group);
  });

  it('gives the page one h1 and a labelled results region', () => {
    indexMock.mockReturnValue(new Promise(() => {}));
    const html = H.staticHtml();
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
    expect(html).toContain('aria-labelledby="cbv2-stories-results-title"');
  });
});
