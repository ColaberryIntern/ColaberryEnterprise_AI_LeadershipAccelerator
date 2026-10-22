import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

/*
 * The mocks are created INSIDE the factories and read back through the typed import. Declaring
 * them as `const` above a `jest.mock` call does not work: babel hoists the call above the
 * declarations, so the factory runs while those bindings are still in their temporal dead zone
 * ("Cannot access 'mockX' before initialization"). This is the shape that avoids both that and
 * the out-of-scope-variable guard.
 */
jest.mock('../../../../services/landingPageApi', () => ({
  listLandingPages: jest.fn(),
  createLandingPage: jest.fn(),
  reviseLandingPage: jest.fn(),
  publishLandingPage: jest.fn(),
  unpublishLandingPage: jest.fn(),
  previewLandingPage: jest.fn(),
  // The page loads traffic for the table on mount. An explicit mock factory replaces the
  // WHOLE module, so an export missing here is `undefined` at the call site - which failed every
  // test in this file with "fetchLandingPageTraffic is not a function", not just the ones that
  // care about traffic. Resolving empty leaves the rows unmeasured and everything else unchanged.
  fetchLandingPageTraffic: jest.fn(),
  errorMessage: (_e: unknown, fallback: string) => fallback,
}));

jest.mock('../MarketingBrandContext', () => ({ useMarketingBrand: jest.fn() }));

jest.mock('../../../../components/admin/shell', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  SectionCard: ({ title, children }: { title?: string; children?: React.ReactNode }) => (
    <section><h2>{title}</h2>{children}</section>
  ),
}));

import * as lpApi from '../../../../services/landingPageApi';
import { useMarketingBrand } from '../MarketingBrandContext';

const mockListLandingPages = lpApi.listLandingPages as jest.Mock;
const mockCreateLandingPage = lpApi.createLandingPage as jest.Mock;
const mockReviseLandingPage = lpApi.reviseLandingPage as jest.Mock;
const mockPublishLandingPage = lpApi.publishLandingPage as jest.Mock;
const mockUnpublishLandingPage = lpApi.unpublishLandingPage as jest.Mock;
const mockPreviewLandingPage = lpApi.previewLandingPage as jest.Mock;
const mockFetchTraffic = lpApi.fetchLandingPageTraffic as jest.Mock;
const mockUseBrand = useMarketingBrand as jest.Mock;

import AdminLandingPagesPage from '../AdminLandingPagesPage';
import { ALL_BRANDS } from '../brandScope';

/**
 * The landing-page authoring screen.
 *
 * The assertion that matters most is the preview one. The obvious implementation is an iframe
 * with `src` pointed at the admin preview endpoint, and it would 401 on every load: this app
 * authenticates with a Bearer header that a browser does not attach to an iframe navigation. So
 * the test pins that the HTML is FETCHED and handed over as `srcDoc`, which is the thing a
 * well-meaning simplification would undo.
 */

let container: HTMLDivElement;
let root: Root;

const BRAND = { id: 'b-1', slug: 'colaberry-training', name: 'Colaberry Training' };

function page(over: Record<string, unknown> = {}) {
  return {
    id: 'lp-1', name: 'Six-week build', kind: 'hosted', status: 'draft',
    slug: 'six-week-build', path: '/lp/colaberry-training/six-week-build',
    brand_id: 'b-1', site_slug: 'training', published_at: null,
    repo_path: null, repo_commit: null, updated_at: '2026-10-02T12:00:00.000Z',
    ...over,
  };
}

async function render() {
  await act(async () => { root.render(<AdminLandingPagesPage />); });
}

const q = (testid: string) => container.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
const text = () => container.textContent ?? '';

/**
 * Type into a controlled React input.
 *
 * Assigning `el.value` directly does NOT work: React 18 tracks the value property on the node
 * and treats an unchanged tracker as "no change", so state never updates and the component never
 * re-renders. The value has to go through the prototype's native setter for React to see it.
 */
function type(el: HTMLElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mockUseBrand.mockReturnValue({ brandId: BRAND.id, brand: BRAND });
  mockListLandingPages.mockResolvedValue([page()]);
  mockPreviewLandingPage.mockResolvedValue('<!doctype html><title>t</title><h1>Ship an AI project</h1>');
  // Set HERE and not in the mock factory: `jest.clearAllMocks()` above wipes a
  // `mockResolvedValue` declared at mock-definition time, leaving a bare fn that returns
  // undefined - which fails as "Cannot read properties of undefined (reading 'then')" in
  // the page's traffic load, in every test in this file. Most of these tests are not about the
  // numbers; the load just has to resolve. The ones that ARE override this.
  mockFetchTraffic.mockResolvedValue({ traffic: [], window_days: 30 });
});

afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

describe('a brand has to be chosen first', () => {
  it('says so instead of showing an empty list', async () => {
    mockUseBrand.mockReturnValue({ brandId: ALL_BRANDS, brand: null });
    await render();

    expect(q('needs-brand')).not.toBeNull();
    expect(text()).toMatch(/belongs to one brand and only ever shows for that brand/);
    expect(mockListLandingPages).not.toHaveBeenCalled();
  });

  it('loads only this brand\'s pages once one is chosen', async () => {
    await render();
    expect(mockListLandingPages).toHaveBeenCalledWith({ brand_id: 'b-1' });
  });
});

describe('the preview is fetched, not framed', () => {
  it('renders the HTML through srcDoc, never a src URL', async () => {
    await render();
    await act(async () => { q('lp-select-lp-1')!.click(); });

    const frame = q('lp-preview') as HTMLIFrameElement;
    expect(frame).not.toBeNull();
    // A `src` here would 401: the Bearer header is not attached to an iframe navigation.
    expect(frame.getAttribute('src')).toBeNull();
    expect(frame.getAttribute('srcdoc')).toContain('Ship an AI project');
    expect(mockPreviewLandingPage).toHaveBeenCalledWith('lp-1');
  });

  it('sandboxes the frame with no permissions at all', async () => {
    await render();
    await act(async () => { q('lp-select-lp-1')!.click(); });
    expect((q('lp-preview') as HTMLIFrameElement).getAttribute('sandbox')).toBe('');
  });

  it('shows the reason when the page cannot be rendered, rather than an empty frame', async () => {
    mockPreviewLandingPage.mockRejectedValue(new Error('nope'));
    await render();
    await act(async () => { q('lp-select-lp-1')!.click(); });

    expect(q('lp-preview')).toBeNull();
    expect(q('lp-preview-error')!.textContent).toMatch(/preview could not be rendered/);
  });
});

describe('building from a brief', () => {
  it('refuses until there is a name AND a usable brief, and says which is missing', async () => {
    await render();
    expect((q('lp-build') as HTMLButtonElement).disabled).toBe(true);
    expect(q('lp-build-blocker')!.textContent).toMatch(/Give the page a name/);
  });

  it('names the brief as the blocker once the name is filled', async () => {
    await render();
    const name = q('lp-name') as HTMLInputElement;
    await act(async () => {
      type(name, 'November cohort');
    });
    expect(q('lp-build-blocker')!.textContent).toMatch(/Paste the brief/);
  });

  it('suggests the public URL from the name, so the slug is not a surprise', async () => {
    await render();
    const name = q('lp-name') as HTMLInputElement;
    await act(async () => {
      type(name, 'November Cohort');
    });
    expect(text()).toContain('/lp/colaberry-training/november-cohort');
  });

  it('surfaces placeholders and unsupported claims as two separate problems', async () => {
    mockCreateLandingPage.mockResolvedValue({
      page: page(), content: {}, model: 'm', repaired: false,
      placeholders: ['[price]'], unverifiedClaims: ['figure 92%'],
    });
    await render();

    // One field per act. Both inside a single act left the second update unapplied, which showed
    // up here as a Build button that stayed disabled.
    await act(async () => { type(q('lp-name')!, 'November cohort'); });
    await act(async () => {
      type(q('lp-source')!, 'A six-week cohort for working analysts who want to ship a real AI project.');
    });
    // Asserted before the DOM check: a still-disabled button would click silently and the
    // failure would read as "no warnings rendered" instead of "the build never ran".
    expect((q('lp-build') as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { (q('lp-build') as HTMLButtonElement).click(); });
    expect(mockCreateLandingPage).toHaveBeenCalled();
    // `build` awaits the create AND the reload; one more tick lets both settle.
    await act(async () => { await Promise.resolve(); });

    const warnings = q('lp-warnings')!.textContent ?? '';
    expect(warnings).toMatch(/Fill these in before publishing: \[price\]/);
    expect(warnings).toMatch(/does not support these, so check or remove them: figure 92%/);
  });
});

describe('publishing', () => {
  it('publishes with the slug in the form', async () => {
    mockPublishLandingPage.mockResolvedValue({ page: page({ status: 'published' }), url: '/lp/colaberry-training/six-week-build' });
    await render();
    await act(async () => { q('lp-select-lp-1')!.click(); });
    await act(async () => { (q('lp-publish') as HTMLButtonElement).click(); });

    expect(mockPublishLandingPage).toHaveBeenCalledWith('lp-1', 'six-week-build');
    expect(text()).toMatch(/Live at \/lp\/colaberry-training\/six-week-build/);
  });

  it('is blocked with a reason when there is no slug anywhere', async () => {
    mockListLandingPages.mockResolvedValue([page({ slug: null })]);
    await render();
    await act(async () => { q('lp-select-lp-1')!.click(); });

    expect((q('lp-publish') as HTMLButtonElement).disabled).toBe(true);
    expect(q('lp-publish-blocker')!.textContent).toMatch(/cannot be built without one/);
  });

  it('a live page offers unpublish instead of publish, and locks its URL', async () => {
    mockListLandingPages.mockResolvedValue([page({ status: 'published' })]);
    await render();
    await act(async () => { q('lp-select-lp-1')!.click(); });

    expect((q('lp-publish') as HTMLButtonElement).disabled).toBe(true);
    expect((q('lp-unpublish') as HTMLButtonElement).disabled).toBe(false);
    expect((q('lp-slug') as HTMLInputElement).disabled).toBe(true);
    expect(text()).toMatch(/anything already posted points here/);
  });

  it('warns about a malformed slug as it is typed', async () => {
    await render();
    await act(async () => { q('lp-select-lp-1')!.click(); });
    const slug = q('lp-slug') as HTMLInputElement;
    await act(async () => {
      type(slug, 'Not A Slug');
    });
    expect(q('lp-slug-problem')!.textContent).toMatch(/Lower-case letters, numbers and dashes only/);
    expect((q('lp-publish') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('revising', () => {
  it('needs something to say before it will ask for a change', async () => {
    await render();
    await act(async () => { q('lp-select-lp-1')!.click(); });
    expect((q('lp-revise') as HTMLButtonElement).disabled).toBe(true);
  });

  it('sends the feedback and re-renders the preview', async () => {
    mockReviseLandingPage.mockResolvedValue({
      page: page(), content: {}, model: 'm', repaired: false, placeholders: [], unverifiedClaims: [],
    });
    await render();
    await act(async () => { q('lp-select-lp-1')!.click(); });

    const fb = q('lp-feedback') as HTMLTextAreaElement;
    await act(async () => {
      type(fb, 'Make the headline about the mentor review.');
    });
    await act(async () => { (q('lp-revise') as HTMLButtonElement).click(); });

    // The 4th argument is the revision mode, and 'tweak' is the default - the behaviour this
    // screen had before Rebuild existed. The 3rd is the optional re-sent brief, unused here.
    expect(mockReviseLandingPage).toHaveBeenCalledWith(
      'lp-1', 'Make the headline about the mentor review.', undefined, 'tweak',
    );
    // Twice: once on selection, once after the change - otherwise the operator approves the old page.
    expect(mockPreviewLandingPage).toHaveBeenCalledTimes(2);
  });
});

describe('a legacy external path', () => {
  it('explains itself rather than offering edits it cannot do', async () => {
    mockListLandingPages.mockResolvedValue([page({ kind: 'external_path', status: 'published', path: '/free-class' })]);
    await render();
    await act(async () => { q('lp-select-lp-1')!.click(); });

    expect(q('lp-not-hosted')!.textContent).toMatch(/not a page built here/);
    expect(q('lp-preview')).toBeNull();
    expect(q('lp-publish')).toBeNull();
    expect(mockPreviewLandingPage).not.toHaveBeenCalled();
  });
});

describe('a failed list is not an empty one', () => {
  it('says the load failed rather than claiming there are no pages', async () => {
    mockListLandingPages.mockRejectedValue(new Error('boom'));
    await render();

    expect(text()).toMatch(/could not be loaded/);
  });
});

/**
 * One table: the numbers sit on the row and the detail opens underneath it.
 *
 * Ali, 2026-10-16: "Allow the stats to be on the line of the Landing page and allow the user to
 * drill down into the details." `landingPageRowStats.test.ts` proves the join arithmetic; these
 * prove it reaches the DOM, which is a different claim - a correct join whose result never gets
 * rendered looks identical from the unit tests and identical to the old table on screen.
 */
describe('stats on the row', () => {
  const traffic = (over: Record<string, unknown> = {}) => ({
    brand_slug: 'colaberry-training', slug: 'six-week-build', status: 'published',
    views: 38, visitors: 16, identified_leads: 2, ad_clicks: 2,
    cta_clicks: 8, cta_clickers: 4, engaged_visitors: 9,
    first_seen: '2026-10-01T12:00:00Z', last_seen: '2026-10-15T12:00:00Z',
    ...over,
  });

  it('puts this page\'s visitor count on its own line', async () => {
    mockFetchTraffic.mockResolvedValue({ traffic: [traffic()], window_days: 30 });
    await render();
    await act(async () => { await Promise.resolve(); });

    expect(q('lp-visitors-lp-1')!.textContent).toBe('16');
    expect(q('lp-row-summary-lp-1')!.textContent).toBe('16 visitors, 4 clicked');
  });

  it('does not take another brand\'s numbers for the same slug', async () => {
    // The whole reason the join key is the path. A slug-only join would print 999 here.
    mockFetchTraffic.mockResolvedValue({
      traffic: [traffic({ brand_slug: 'refactored', visitors: 999 })], window_days: 30,
    });
    await render();
    await act(async () => { await Promise.resolve(); });

    expect(q('lp-visitors-lp-1')!.textContent).not.toBe('999');
    expect(q('lp-visitors-lp-1')!.textContent).toBe('—');
  });

  it('shows a dash for a page that was never published, not a zero', async () => {
    mockListLandingPages.mockResolvedValue([page({ path: null, status: 'draft' })]);
    mockFetchTraffic.mockResolvedValue({ traffic: [traffic()], window_days: 30 });
    await render();
    await act(async () => { await Promise.resolve(); });

    expect(q('lp-visitors-lp-1')!.textContent).toBe('—');
    expect(q('lp-row-summary-lp-1')!.textContent).toBe('Not published yet');
  });

  it('keeps the table readable when traffic cannot be loaded at all', async () => {
    mockFetchTraffic.mockRejectedValue(new Error('down'));
    await render();
    await act(async () => { await Promise.resolve(); });

    // The pages are still workable; only the numbers are missing.
    expect(q('lp-row-lp-1')).not.toBeNull();
    expect(q('lp-visitors-lp-1')!.textContent).toBe('—');
  });
});

describe('drilling into one page', () => {
  it('opens the detail under its own row, and closes it again', async () => {
    await render();
    expect(q('lp-details-lp-1')).toBeNull();

    await act(async () => { q('lp-select-lp-1')!.click(); });
    expect(q('lp-details-lp-1')).not.toBeNull();
    expect(q('lp-select-lp-1')!.textContent).toBe('Close');

    await act(async () => { q('lp-select-lp-1')!.click(); });
    expect(q('lp-details-lp-1')).toBeNull();
    expect(q('lp-select-lp-1')!.textContent).toBe('Open');
  });

  it('shows the full metric strip only once a row is open', async () => {
    mockFetchTraffic.mockResolvedValue({
      traffic: [{
        brand_slug: 'colaberry-training', slug: 'six-week-build', status: 'published',
        views: 38, visitors: 16, identified_leads: 2, ad_clicks: 2,
        cta_clicks: 8, cta_clickers: 4, engaged_visitors: 9,
        first_seen: '2026-10-01T12:00:00Z', last_seen: '2026-10-15T12:00:00Z',
      }],
      window_days: 30,
    });
    await render();
    await act(async () => { await Promise.resolve(); });

    // Collapsed, the page is listed once - the standalone traffic panel that used to repeat
    // every page above this table is gone.
    expect(q('lp-detail-traffic')).toBeNull();

    await act(async () => { q('lp-select-lp-1')!.click(); });
    expect(q('lp-detail-traffic')!.textContent).toContain('38');
  });
});

/**
 * Adjust versus Rebuild.
 *
 * The revise prompt always ended with "leave everything else alone", which is right for "drop the
 * FAQ" and a contradiction for "rebuild this under the new design" - and the model resolved the
 * contradiction by changing almost nothing. The control has to reach the request, or the fix is
 * only in the prompt builder and the operator still gets the cap.
 */
describe('choosing how much a revision may change', () => {
  const openAndType = async (text: string) => {
    await render();
    await act(async () => { q('lp-select-lp-1')!.click(); });
    type(q('lp-feedback')!, text);
    await act(async () => { await Promise.resolve(); });
  };

  it('starts on Adjust, so nothing rebuilds by accident', async () => {
    await openAndType('Drop the FAQ');
    expect(q('lp-mode-tweak')!.getAttribute('aria-pressed')).toBe('true');
    expect(q('lp-mode-redesign')!.getAttribute('aria-pressed')).toBe('false');
    expect(q('lp-revise')!.textContent).toBe('Apply the change');
  });

  it('sends redesign once Rebuild is chosen', async () => {
    mockReviseLandingPage.mockResolvedValue({
      page: page(), content: { v: 2 }, placeholders: [], unverifiedClaims: [], model: 'm', repaired: false,
    });
    await openAndType('Rebuild this under the new design');
    await act(async () => { q('lp-mode-redesign')!.click(); });
    expect(q('lp-revise')!.textContent).toBe('Rebuild the page');

    await act(async () => { q('lp-revise')!.click(); });
    expect(mockReviseLandingPage).toHaveBeenCalledWith(
      'lp-1', 'Rebuild this under the new design', undefined, 'redesign',
    );
  });

  it('says what each mode will do, before it is used', async () => {
    await openAndType('Drop the FAQ');
    expect(q('lp-mode-hint')!.textContent).toContain('leaves the rest of the page alone');
    await act(async () => { q('lp-mode-redesign')!.click(); });
    expect(q('lp-mode-hint')!.textContent).toContain('the facts cannot');
  });

  it('passes the server notice through when the two controls disagree', async () => {
    // The case that used to be silent: a rebuild-shaped request answered as an adjustment.
    mockReviseLandingPage.mockResolvedValue({
      page: page(), content: { v: 2 }, placeholders: [], unverifiedClaims: [], model: 'm', repaired: false,
      modeNotice: 'This reads like a request to rebuild the page, but the revision is set to adjust.',
    });
    await openAndType('Redesign the whole page');
    await act(async () => { q('lp-revise')!.click(); });
    await act(async () => { await Promise.resolve(); });

    expect(text()).toContain('reads like a request to rebuild');
  });
});
