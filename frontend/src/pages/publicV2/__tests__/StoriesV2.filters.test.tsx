import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EvidenceBadge } from '../../../components/publicV2/Claim';
import {
  DEFAULT_VISIBLE_VERIFICATION_CLASSES,
  PUBLIC_VERIFICATION_CLASSES,
  VERIFICATION_CLASS_LABELS,
} from '../storiesV2Model';

/**
 * StoriesV2 - the filter engine: its URL, its keyboard, and what it records.
 *
 * The page's states and cards are the other half and live in
 * `StoriesV2.test.tsx`. Split because one file covering both ran past the
 * repository's file-size ceiling, the same way the admin Case Study desk is
 * split into `.controls` and `.states`.
 *
 * THE API MOCK IS PARTIAL ON PURPOSE. Only the two network calls are replaced.
 * `parseCaseStudyFilters`, `serializeCaseStudyFilters` and
 * `toggleCaseStudyFacet` stay real, because a URL round-trip is only proved if
 * it runs through the serializer the page actually ships with.
 *
 * THE TRACKING MOCK IS PARTIAL TOO, so `FORBIDDEN_EVENT_DATA_KEYS` below is the
 * real list rather than an automock's empty array - which would make the
 * assertion that uses it pass against anything.
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
import * as tracking from '../../../utils/caseStudyTracking';
import * as H from '../__fixtures__/storiesIndexHarness';
/* eslint-enable import/first */

const indexMock = api.fetchCaseStudyIndex as jest.MockedFunction<typeof api.fetchCaseStudyIndex>;
const taxonomyMock = api.fetchCaseStudyTaxonomy as jest.MockedFunction<
  typeof api.fetchCaseStudyTaxonomy
>;
const filterEvent = tracking.trackCaseStudyFilter as jest.Mock;
const cardClickEvent = tracking.trackCaseStudyCardClick as jest.Mock;
const viewEvent = tracking.trackCaseStudyView as jest.Mock;

const box = (id: string): HTMLInputElement => H.q(`[id="${id}"]`) as HTMLInputElement;
const sentFilters = (call: number): api.CaseStudyFilterState => indexMock.mock.calls[call][0]!;
const lastSent = (): api.CaseStudyFilterState =>
  sentFilters(indexMock.mock.calls.length - 1);

beforeEach(() => {
  taxonomyMock.mockResolvedValue(H.TAXONOMY);
  indexMock.mockResolvedValue(H.list());
});

afterEach(() => {
  H.unmount();
  jest.clearAllMocks();
});

/* ------------------------------------------------------------- facets --- */

describe('the facet menu is derived from what is published', () => {
  it('offers the six groups spec section 22 names, in that order', async () => {
    H.mount();
    await H.settle();
    expect(H.all('.cbv2-cs-filters__summary span:first-child').map((n) => n.textContent))
      .toEqual(['Stack', 'Capability', 'Industry', 'Program', 'Built by', 'Verification']);
  });

  it('offers no menu at all when nothing is published, rather than one matching nothing', async () => {
    taxonomyMock.mockResolvedValue({
      surface: H.SURFACE,
      facets: {
        capabilities: [], industries: [], stack: [], programs: [],
        builtBy: [], verificationClasses: [],
      },
    });
    H.mount();
    await H.settle();
    expect(H.q('.cbv2-cs-filters')).toBeNull();
  });

  it('says so when the facet list itself failed, instead of pretending there is none', async () => {
    taxonomyMock.mockRejectedValue(new api.CaseStudyRequestError('UpstreamUnavailable', 'boom'));
    H.mount();
    await H.settle();
    expect(H.q('[data-testid="stories-facets-note"]')).not.toBeNull();
    // The records are a separate request and still render.
    expect(H.q('[data-case-study="sample-record"]')).not.toBeNull();
  });
});

/* ------------------------------------------------------ URL round-trip --- */

describe('filter state is URL-addressable and survives reload and back/forward', () => {
  const DEEP_LINK = '/stories?capability=agents&industry=Energy&stack=Claude,MCP';

  it('reads the spec example URL into the request it issues', async () => {
    H.mount(DEEP_LINK);
    await H.settle();
    expect(sentFilters(0).capability).toEqual(['agents']);
    expect(sentFilters(0).industry).toEqual(['Energy']);
    expect(sentFilters(0).stack).toEqual(['Claude', 'MCP']);
  });

  it('shows that URL as checked boxes, which is the same state read back', async () => {
    H.mount(DEEP_LINK);
    await H.settle();
    for (const id of ['stories-filter-capability-agents', 'stories-filter-industry-Energy',
      'stories-filter-stack-Claude', 'stories-filter-stack-MCP']) {
      expect({ id, checked: box(id).checked }).toEqual({ id, checked: true });
    }
  });

  it('writes a committed facet into the URL and re-requests', async () => {
    H.mount();
    await H.settle();
    H.click('[id="stories-filter-capability-agents"]');
    await H.settle();
    expect(H.search()).toContain('capability=agents');
    expect(indexMock).toHaveBeenCalledTimes(2);
    expect(sentFilters(1).capability).toEqual(['agents']);
  });

  it('survives a reload: a fresh mount at that URL restores the same state', async () => {
    H.mount();
    await H.settle();
    H.click('[id="stories-filter-stack-Claude"]');
    await H.settle();
    const url = `/stories${H.search()}`;

    H.unmount();
    jest.clearAllMocks();
    taxonomyMock.mockResolvedValue(H.TAXONOMY);
    indexMock.mockResolvedValue(H.list());

    H.mount(url);
    await H.settle();
    expect(sentFilters(0).stack).toEqual(['Claude']);
    expect(box('stories-filter-stack-Claude').checked).toBe(true);
  });

  it('survives back and forward, because the URL is the only place the state lives', async () => {
    H.mount();
    await H.settle();
    H.click('[id="stories-filter-capability-agents"]');
    await H.settle();
    expect(H.search()).toContain('capability=agents');

    H.go(-1);
    await H.settle();
    expect(H.search()).toBe('');
    expect(box('stories-filter-capability-agents').checked).toBe(false);
    expect(lastSent().capability).toEqual([]);

    H.go(1);
    await H.settle();
    expect(H.search()).toContain('capability=agents');
    expect(box('stories-filter-capability-agents').checked).toBe(true);
    expect(lastSent().capability).toEqual(['agents']);
  });

  it('clears everything through one control, and empties the URL with it', async () => {
    H.mount(DEEP_LINK);
    await H.settle();
    H.click('[data-testid="stories-clear-filters"]');
    await H.settle();
    expect(H.search()).toBe('');
  });

  it('round-trips through the real serializer without loss', () => {
    const parsed = api.parseCaseStudyFilters('capability=agents&industry=Energy&stack=Claude,MCP');
    expect(api.parseCaseStudyFilters(api.serializeCaseStudyFilters(parsed).toString()))
      .toEqual(parsed);
  });
});

/* ------------------------------------------- hidden verification classes --- */

describe('pending and illustrative records are hidden by default', () => {
  it('cannot express pending at all: the public vocabulary has three members', () => {
    expect([...PUBLIC_VERIFICATION_CLASSES]).toEqual(['verified', 'anonymized', 'illustrative']);
    expect(PUBLIC_VERIFICATION_CLASSES as readonly string[]).not.toContain('pending');
    // The label map is a Record over the union, so the two cannot drift apart.
    expect(Object.keys(VERIFICATION_CLASS_LABELS).sort())
      .toEqual([...PUBLIC_VERIFICATION_CLASSES].sort());
  });

  it('asks the server only for the classes that are not withheld', async () => {
    H.mount();
    await H.settle();
    expect(sentFilters(0).verification).toEqual([...DEFAULT_VISIBLE_VERIFICATION_CLASSES]);
    expect(sentFilters(0).verification).not.toContain('illustrative');
  });

  it('does not write that default into the URL, which would fake an active filter', async () => {
    H.mount();
    await H.settle();
    // If it did, every visit would look filtered and the two empty states -
    // "no match" and "nothing is published" - would collapse into one.
    expect(H.search()).toBe('');
    expect(api.hasActiveCaseStudyFilters(api.parseCaseStudyFilters(H.search()))).toBe(false);
  });

  it('honours an explicit opt-in, because hidden by default is a default', async () => {
    H.mount('/stories?verification=illustrative');
    await H.settle();
    expect(sentFilters(0).verification).toEqual(['illustrative']);
  });

  it('discloses the exclusion rather than performing it silently', async () => {
    H.mount();
    await H.settle();
    expect(H.text()).toContain('Illustrative demonstrations are withheld unless you select them');
  });

  it('says nothing about withheld records when the library holds none', async () => {
    taxonomyMock.mockResolvedValue({
      ...H.TAXONOMY,
      facets: { ...H.TAXONOMY.facets, verificationClasses: [{ slug: 'verified', count: 2 }] },
    });
    H.mount();
    await H.settle();
    expect(H.q('[data-testid="stories-hidden-note"]')).toBeNull();
  });
});

/* -------------------------------------------------------- accessibility --- */

describe('accessibility, with a check for each rule rather than a comment', () => {
  it('announces the result count politely', async () => {
    H.mount();
    await H.settle();
    const live = H.q('[data-testid="stories-result-count"]')!;
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toContain('Showing 1 published project.');
  });

  it('keeps the live region mounted while loading, so a change is announced', () => {
    indexMock.mockReturnValue(new Promise(() => {}));
    H.mount();
    // A live region inserted along with its content often is not announced.
    expect(H.q('[data-testid="stories-result-count"]')?.getAttribute('aria-live')).toBe('polite');
  });

  it('builds every filter control from a real input with a real label', async () => {
    H.mount();
    await H.settle();
    const region = H.q('[data-testid="stories-filters"]')!;
    const inputs = Array.from(region.querySelectorAll('input')) as HTMLInputElement[];
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      expect(input.type).toBe('checkbox');
      expect(input.disabled).toBe(false);
      expect(input.id).not.toBe('');
      const label = region.querySelector(`label[for="${input.id}"]`);
      expect({ id: input.id, labelled: label !== null }).toEqual({ id: input.id, labelled: true });
      expect((label?.textContent ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('reaches every filter control from the keyboard', async () => {
    H.mount();
    await H.settle();
    const region = H.q('[data-testid="stories-filters"]')!;
    for (const input of Array.from(region.querySelectorAll('input')) as HTMLInputElement[]) {
      input.focus();
      expect(document.activeElement).toBe(input);
    }
    // Space on a focused checkbox dispatches a click; that must commit.
    H.click('[data-testid="stories-filters"] input');
    await H.settle();
    expect(H.search()).not.toBe('');
  });

  it('uses no div handler, no role and no tabindex to fake a control', async () => {
    H.mount();
    await H.settle();
    const region = H.q('[data-testid="stories-filters"]')!;
    expect(region.querySelectorAll('[role]').length).toBe(0);
    expect(region.querySelectorAll('[tabindex]').length).toBe(0);
    // A native <details>/<summary> disclosure, not a div pretending to be one.
    expect(region.querySelectorAll('summary').length).toBe(6);
    expect(region.querySelectorAll('button, a, select, textarea').length).toBe(0);
  });

  it('makes every page-level control a real button', async () => {
    H.mount('/stories?capability=agents');
    await H.settle();
    const clear = H.q('[data-testid="stories-clear-filters"]') as HTMLButtonElement;
    expect(clear.tagName).toBe('BUTTON');
    expect(clear.type).toBe('button');
  });

  it('conveys verification in words, not in colour', async () => {
    indexMock.mockResolvedValue(H.list({ items: [H.NO_METRIC], total: 1 }));
    H.mount();
    await H.settle();
    // The RECORD badge, in the card foot. A card whose headline figure was
    // verified differently renders a second badge on the figure itself, which is
    // a discrepancy being shown rather than smoothed over - not this one.
    const badge = H.q('[data-case-study="no-metric-record"] .cbv2-cs-card__foot [data-verification-class]')!;
    expect(badge.getAttribute('data-verification-class')).toBe('anonymized');
    expect(badge.textContent).toContain('Anonymized');
    expect(badge.textContent).toContain('Client');
  });

  it('gives two different classes two different sentences, not two different tints', async () => {
    indexMock.mockResolvedValue(H.list({ items: [H.NO_METRIC], total: 1 }));
    H.mount();
    await H.settle();
    const anonymized = H.q('[data-case-study="no-metric-record"] .cbv2-cs-card__foot [data-verification-class]')!.textContent;
    H.unmount();
    indexMock.mockResolvedValue(H.list());
    H.mount();
    await H.settle();
    const verified = H.q('[data-case-study="sample-record"] .cbv2-cs-card__foot [data-verification-class]')!.textContent;
    expect(verified).toContain('Verified');
    expect(verified).toContain('Repository');
    expect(verified).not.toEqual(anonymized);
  });

  it('spells the verification facets the way the evidence badge spells them', () => {
    // The label map in Claim.tsx is private, so this is a checked mirror rather
    // than a second vocabulary that could drift out of step with the badge.
    for (const cls of PUBLIC_VERIFICATION_CLASSES) {
      expect(H.textOf(renderToStaticMarkup(<EvidenceBadge evidence={cls} />)))
        .toContain(VERIFICATION_CLASS_LABELS[cls]);
    }
  });
});

/* ------------------------------------------------------------ tracking --- */

describe('tracking is wired the way the emitters require', () => {
  it('emits nothing on a plain load: a view is not a commit', async () => {
    H.mount();
    await H.settle();
    expect(filterEvent).not.toHaveBeenCalled();
    expect(cardClickEvent).not.toHaveBeenCalled();
    // case_study_view belongs to the detail page, guarded once per slug per
    // session. The ingest has no event-level dedup, so an index-side view event
    // would write one row per record per render.
    expect(viewEvent).not.toHaveBeenCalled();
  });

  it('emits one filter event per commit, carrying the count the server returned', async () => {
    indexMock.mockResolvedValueOnce(H.list()).mockResolvedValueOnce(H.list({ total: 4 }));
    H.mount();
    await H.settle();
    H.click('[id="stories-filter-capability-agents"]');
    await H.settle();
    expect(filterEvent).toHaveBeenCalledTimes(1);
    expect(filterEvent).toHaveBeenCalledWith({
      filter_key: 'capability',
      filter_value: 'agents',
      result_count: 4,
      surface: 'enterprise',
      source: 'stories-index',
    });
  });

  it('emits no filter event when the commit never produced a result', async () => {
    // An event carrying a stale result_count is worse than no event: the count
    // is the only reason this event is worth recording.
    indexMock.mockResolvedValueOnce(H.list())
      .mockRejectedValueOnce(new api.CaseStudyRequestError('TimeoutError', 'slow'));
    H.mount();
    await H.settle();
    H.click('[id="stories-filter-capability-agents"]');
    await H.settle();
    expect(filterEvent).not.toHaveBeenCalled();
  });

  it('records a card click with its rank, and nothing that identifies a repository', async () => {
    H.mount();
    await H.settle();
    H.click('[data-case-study="sample-record"] a.cbv2-cs-card__link');
    expect(cardClickEvent).toHaveBeenCalledTimes(1);
    const payload = cardClickEvent.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.slug).toBe('sample-record');
    expect(payload.position).toBe(1);
    expect(payload.source).toBe('stories-index');
    const forbidden = tracking.FORBIDDEN_EVENT_DATA_KEYS;
    expect(forbidden.length).toBeGreaterThan(20);
    expect(Object.keys(payload).filter((key) => forbidden.includes(key))).toEqual([]);
  });

  it('ignores a click that activated nothing', async () => {
    H.mount();
    await H.settle();
    H.click('[data-case-study="sample-record"]');
    expect(cardClickEvent).not.toHaveBeenCalled();
  });
});
