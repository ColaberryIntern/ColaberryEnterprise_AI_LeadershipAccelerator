/**
 * StoriesV2 - the Government chapter.
 *
 * Same harness and partial mocks as `StoriesV2.filters.test.tsx`: the two
 * network calls are replaced, everything between the URL and the request stays
 * real, so a chapter click is proved to reach the server as `gov_capability`
 * through the serializer the page ships with.
 *
 * The three claims that matter:
 *   1. a library with nothing mapped renders NO chapter - the page never pitches
 *      a category it cannot show a record for;
 *   2. once it renders, an empty category is a statement, not a control;
 *   3. a card prints its delivery context in words, so a demonstration is
 *      labelled wherever the card appears, not only inside the chapter.
 */

jest.mock('../../../services/caseStudyApi', () => {
  const actual = jest.requireActual('../../../services/caseStudyApi');
  return { ...actual, fetchCaseStudyIndex: jest.fn(), fetchCaseStudyTaxonomy: jest.fn() };
});
jest.mock('../../../utils/caseStudyTracking', () => {
  const actual = jest.requireActual('../../../utils/caseStudyTracking');
  return {
    ...actual,
    trackCaseStudyView: jest.fn(),
    trackCaseStudyFilter: jest.fn(),
    trackCaseStudyCardClick: jest.fn(),
  };
});

/* eslint-disable import/first */
import * as api from '../../../services/caseStudyApi';
import * as H from '../__fixtures__/storiesIndexHarness';
import { summary } from '../../../components/caseStudy/__fixtures__/caseStudyPublicFixtures';
import type { PublicCaseStudyTaxonomyResponse } from '../../../services/caseStudyPublicTypes';
/* eslint-enable import/first */

const indexMock = api.fetchCaseStudyIndex as jest.MockedFunction<typeof api.fetchCaseStudyIndex>;
const taxonomyMock = api.fetchCaseStudyTaxonomy as jest.MockedFunction<
  typeof api.fetchCaseStudyTaxonomy
>;
const lastSent = (): api.CaseStudyFilterState =>
  indexMock.mock.calls[indexMock.mock.calls.length - 1][0]!;

/** Two records mapped, across two of the seven categories, both labelled. */
const GOV_TAXONOMY: PublicCaseStudyTaxonomyResponse = {
  ...H.TAXONOMY,
  facets: {
    ...H.TAXONOMY.facets,
    govCapabilities: [
      { slug: 'ai-workforce-enablement', count: 2 },
      { slug: 'ai-strategy-readiness', count: 1 },
    ],
    deliveryContexts: [
      { slug: 'capability_demonstration', count: 1 },
      { slug: 'internal_platform', count: 1 },
    ],
  },
};

const CHAPTER = '[data-testid="stories-government"]';
const categories = (): HTMLElement[] => H.all('[data-testid="stories-government-categories"] > li');

beforeEach(() => {
  taxonomyMock.mockResolvedValue(H.TAXONOMY);
  indexMock.mockResolvedValue(H.list());
});

afterEach(() => {
  H.unmount();
  jest.clearAllMocks();
});

describe('when nothing is mapped', () => {
  it('renders no chapter, and the sidebar keeps its six groups', async () => {
    H.mount();
    await H.settle();
    expect(H.q(CHAPTER)).toBeNull();
    expect(H.all('.cbv2-cs-filters__summary span:first-child').map((n) => n.textContent))
      .toEqual(['Stack', 'Capability', 'Industry', 'Program', 'Built by', 'Verification']);
  });

  it('tolerates a server that omits the two facet keys entirely (an older deploy)', async () => {
    const { govCapabilities, deliveryContexts, ...older } = GOV_TAXONOMY.facets;
    void govCapabilities; void deliveryContexts;
    taxonomyMock.mockResolvedValue({ ...H.TAXONOMY, facets: older });
    H.mount();
    await H.settle();
    expect(H.q(CHAPTER)).toBeNull();
    expect(H.q('[data-case-study="sample-record"]')).not.toBeNull();
  });

  it('still renders the chapter for a shared link that filters on it, so the link explains itself', async () => {
    H.mount('/proof?gov_capability=ai-strategy-readiness');
    await H.settle();
    expect(H.q(CHAPTER)).not.toBeNull();
    expect(lastSent().govCapability).toEqual(['ai-strategy-readiness']);
  });
});

describe('when records are mapped', () => {
  beforeEach(() => { taxonomyMock.mockResolvedValue(GOV_TAXONOMY); });

  it('lists all seven categories in catalog order, with honest zeros as statements rather than buttons', async () => {
    H.mount();
    await H.settle();
    const items = categories();
    expect(items).toHaveLength(7);
    expect(items.map((li) => li.dataset.count)).toEqual(['1', '0', '0', '0', '0', '2', '0']);
    expect(items[0].querySelector('button')).not.toBeNull();
    expect(items[1].querySelector('button')).toBeNull();
    expect(items[1].textContent).toContain('No records yet');
    expect(H.text()).toContain('2 records are on this chapter today');
  });

  it('prints the codes each category is bought under', async () => {
    H.mount();
    await H.settle();
    expect(categories()[5].textContent).toContain('NAICS 611430, 541611');
  });

  it('a category click is a filter: it lands in the URL as gov_capability and in the request', async () => {
    H.mount();
    await H.settle();
    H.click('[data-testid="stories-government-categories"] > li:nth-child(6) button');
    await H.settle();
    expect(H.search()).toContain('gov_capability=ai-workforce-enablement');
    expect(lastSent().govCapability).toEqual(['ai-workforce-enablement']);
    const button = H.q('[data-testid="stories-government-categories"] > li:nth-child(6) button')!;
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('a delivery-context click filters the same way, and a context with no records is disabled', async () => {
    H.mount();
    await H.settle();
    const buttons = H.all('[data-testid="stories-government-contexts"] button') as HTMLButtonElement[];
    expect(buttons.map((b) => b.disabled)).toEqual([true, false, false]);
    H.click('[data-testid="stories-government-contexts"] li:nth-child(3) button');
    await H.settle();
    expect(H.search()).toContain('delivery_context=capability_demonstration');
    expect(lastSent().deliveryContext).toEqual(['capability_demonstration']);
  });

  it('adds the two chapter groups to the sidebar, labelled in words', async () => {
    H.mount();
    await H.settle();
    const legends = H.all('.cbv2-cs-filters__summary span:first-child').map((n) => n.textContent);
    expect(legends).toEqual([
      'Stack', 'Capability', 'Industry', 'Program', 'Built by', 'Verification',
      'Government category', 'Delivery context',
    ]);
    expect(H.text()).toContain('AI workforce enablement');
    expect(H.text()).toContain('Capability demonstration');
  });
});

describe('the card', () => {
  it('prints the delivery context in words when the record carries one, and nothing when it does not', async () => {
    indexMock.mockResolvedValue(H.list({
      items: [
        summary({ slug: 'demo', deliveryContext: 'capability_demonstration' }),
        summary({ slug: 'plain' }),
      ],
      total: 2,
    }));
    H.mount();
    await H.settle();
    const demo = H.q('[data-case-study="demo"] [data-testid="case-study-delivery-context"]');
    expect(demo?.textContent).toContain('Capability demonstration');
    expect(H.q('[data-case-study="plain"] [data-testid="case-study-delivery-context"]')).toBeNull();
  });
});
