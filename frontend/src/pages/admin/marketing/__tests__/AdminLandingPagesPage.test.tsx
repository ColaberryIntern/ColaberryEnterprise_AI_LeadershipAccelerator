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
    slug: 'six-week-build', path: '/p/colaberry-training/six-week-build',
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
    expect(text()).toContain('/p/colaberry-training/november-cohort');
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
    mockPublishLandingPage.mockResolvedValue({ page: page({ status: 'published' }), url: '/p/colaberry-training/six-week-build' });
    await render();
    await act(async () => { q('lp-select-lp-1')!.click(); });
    await act(async () => { (q('lp-publish') as HTMLButtonElement).click(); });

    expect(mockPublishLandingPage).toHaveBeenCalledWith('lp-1', 'six-week-build');
    expect(text()).toMatch(/Live at \/p\/colaberry-training\/six-week-build/);
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

    expect(mockReviseLandingPage).toHaveBeenCalledWith('lp-1', 'Make the headline about the mentor review.');
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
