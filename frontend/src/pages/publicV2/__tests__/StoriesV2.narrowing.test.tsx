/**
 * W26 (Ali, 2026-11-18, on /proof): "the numbers don't move with the filters",
 * "when filters are selected, they should show that", "all the filters should be
 * filtered by that selection as well", one filter system, a hero like the others.
 */

jest.mock('../../../services/caseStudyApi', () => {
  const actual = jest.requireActual('../../../services/caseStudyApi');
  return { ...actual, fetchCaseStudyIndex: jest.fn(), fetchCaseStudyTaxonomy: jest.fn() };
});
jest.mock('../../../utils/caseStudyTracking', () => {
  const actual = jest.requireActual('../../../utils/caseStudyTracking');
  return { ...actual, trackCaseStudyFilter: jest.fn(), trackCaseStudyCardClick: jest.fn() };
});

/* eslint-disable import/first */
import * as api from '../../../services/caseStudyApi';
import * as H from '../__fixtures__/storiesIndexHarness';
import { activeFilterChips, narrowGroups, splitTitle } from '../storiesFilterModel';
import { EMPTY_CASE_STUDY_FILTERS } from '../../../services/caseStudyApi';
/* eslint-enable import/first */

const indexMock = api.fetchCaseStudyIndex as jest.Mock;
const taxonomyMock = api.fetchCaseStudyTaxonomy as jest.Mock;

/** What the server sends for ?department=sales: narrowed figures and counts. */
const NARROWED = {
  ...H.TAXONOMY.facets,
  departments: [{ slug: 'sales', label: 'sales', count: 1 }, { slug: 'hr', label: 'hr', count: 2 }],
  stack: [{ slug: 'Claude', label: 'Claude', count: 1 }, { slug: 'MCP', label: 'MCP', count: 0 }],
};

beforeEach(() => {
  taxonomyMock.mockResolvedValue(H.TAXONOMY);
  indexMock.mockResolvedValue(H.list({
    ledger: H.ledger({ projects: 21 }),
    matchLedger: H.ledger({ projects: 1, verifiedOutcomes: 1, publicRepositories: 1, shipped: 0 }),
    facets: NARROWED,
  }));
});
afterEach(() => { H.unmount(); jest.clearAllMocks(); });

const ledgerValue = (field: string): string | null | undefined =>
  H.q(`[data-ledger-field="${field}"] .cbv2-cs-ledger__value`)?.textContent;

describe('the four figures follow the filters', () => {
  it('prints the figures for what the query matches, not the whole library', async () => {
    H.mount('/proof?department=sales');
    await H.settle();
    expect(ledgerValue('projects')).toBe('1');
    expect(H.q('[data-testid="stories-ledger-note"]')).not.toBeNull();
  });

  it('falls back to the library figures when the server sends none', async () => {
    indexMock.mockResolvedValue(H.list({ ledger: H.ledger({ projects: 21 }) }));
    H.mount('/proof');
    await H.settle();
    expect(ledgerValue('projects')).toBe('21');
    expect(H.q('[data-testid="stories-ledger-note"]')).toBeNull();
  });
});

describe('the filter panel narrows to the selection', () => {
  it('uses the counts the query returned and drops options it cannot reach', async () => {
    H.mount('/proof?department=sales');
    await H.settle();
    const values = H.all('.cbv2-cs-filters input[name="stack"]').map((n) => (n as HTMLInputElement).value);
    expect(values).toEqual(['Claude']);
  });

  it('puts Department first, because a visitor filters by who it is for', async () => {
    H.mount('/proof?department=sales');
    await H.settle();
    expect(H.all('.cbv2-cs-filters__summary span:first-child')[0].textContent).toBe('Department');
  });

  it('is one filter system: the word cloud is gone', async () => {
    H.mount('/proof');
    await H.settle();
    expect(H.q('[data-testid="stories-word-cloud"]')).toBeNull();
    expect(H.all('[data-testid="stories-filters"]')).toHaveLength(1);
  });
});

describe('the selection is shown, and each piece is removable', () => {
  it('shows a chip per selected value, labelled like the panel', async () => {
    H.mount('/proof?department=sales');
    await H.settle();
    const chips = H.all('[data-testid="stories-active-filters"] .cbv2-stories__chip');
    expect(chips.map((c) => c.getAttribute('aria-label'))).toEqual(['Remove filter Department: Sales']);
  });

  it('removes that one value from the URL', async () => {
    H.mount('/proof?department=sales&industry=Energy');
    await H.settle();
    H.click('[aria-label="Remove filter Department: Sales"]');
    await H.settle();
    expect(H.search()).not.toContain('department');
    expect(H.search()).toContain('industry=Energy');
  });

  it('shows nothing when nothing is selected', async () => {
    H.mount('/proof');
    await H.settle();
    expect(H.q('[data-testid="stories-active-filters"]')).toBeNull();
  });
});

describe('the hero matches the other pages', () => {
  it('is the light hero with a Home / Proof crumb and the last clause in the accent', async () => {
    H.mount('/proof');
    await H.settle();
    expect(H.q('section.cbv2-prhero5')).not.toBeNull();
    expect(H.q('.cbv2-crumb5')?.textContent).toBe('Home / Proof');
    expect(H.q('h1 .cbv2-it')).not.toBeNull();
  });

  it('puts the case studies before the evidence-standard band', async () => {
    H.mount('/proof');
    await H.settle();
    const html = document.body.innerHTML;
    expect(html.indexOf('data-case-study=')).toBeLessThan(html.indexOf('Four evidence classes'));
  });
});

describe('storiesFilterModel', () => {
  const groups = [
    { field: 'stack' as const, legend: 'Stack', options: [
      { value: 'claude', label: 'Claude', count: 3 }, { value: 'mcp', label: 'MCP', count: 0 },
    ] },
    { field: 'department' as const, legend: 'Department', options: [{ value: 'sales', label: 'Sales', count: 1 }] },
  ];

  it('keeps a selected option even at zero, and adds one the server never counted', () => {
    const state = { ...EMPTY_CASE_STUDY_FILTERS, stack: ['mcp', 'rust'] };
    const out = narrowGroups(groups, state);
    expect(out.map((g) => g.field)).toEqual(['department', 'stack']);
    expect(out[1].options.map((o) => o.value)).toEqual(['claude', 'mcp', 'rust']);
  });

  it('labels chips from the panel options', () => {
    const state = { ...EMPTY_CASE_STUDY_FILTERS, department: ['sales'] };
    expect(activeFilterChips(groups, state)).toEqual([
      { field: 'department', value: 'sales', legend: 'Department', label: 'Sales' },
    ]);
  });

  it('splits the title at its last comma, and leaves a comma-less title whole', () => {
    expect(splitTitle('What we shipped, and who built it.')).toEqual(['What we shipped,', 'and who built it.']);
    expect(splitTitle('Shipped work')).toEqual(['Shipped work', '']);
  });
});
