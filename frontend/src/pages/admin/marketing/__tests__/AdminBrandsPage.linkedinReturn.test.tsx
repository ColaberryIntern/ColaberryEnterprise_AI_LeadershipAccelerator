/**
 * The last hop of connecting a LinkedIn account: LinkedIn sends the browser back to a URL the
 * backend chooses, and THIS page must be what renders there. The first version of the callback
 * returned to /admin/marketing/brands - a path no route serves - so the operator would have
 * approved on LinkedIn and landed on the 404 page while the account was silently saved. Caught
 * by the task verifier, 2026-09-16. This test mounts the page under the SAME <Route path> that
 * adminRoutes.tsx declares, at the backend's return path; the backend constant is pinned by
 * linkedInCallbackRoutes.test.ts. A move of the route in adminRoutes.tsx would still need a
 * human to update both - stated, not hidden.
 */

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AdminBrandsPage from '../AdminBrandsPage';
import { RedirectKeepingQuery } from '../../../../routes/adminRoutes';

/** Kept in step with backend/src/routes/linkedInCallbackRoutes.ts DEFAULT_RETURN_PATH by hand; a mismatch fails the route assertion below. */
const BACKEND_RETURN_PATH = '/admin/marketing/brands';
/** The pre-2026-09-17 path. Still live as a query-preserving redirect, for bookmarks and for a callback in flight during a deploy. */
const LEGACY_PATH = '/admin/brands';
const BRAND = '22222222-2222-4222-8222-222222222222';

// CRA's jest config resets mock implementations before every test, so they are set in
// beforeEach below rather than in these factories.
jest.mock('../../../../services/adminBrandApi', () => ({ listBrands: jest.fn(), getBrandSendReadiness: jest.fn() }));
jest.mock('../../../../services/channelAccountApi', () => ({
  getVaultStatus: jest.fn(), getLinkedInStatus: jest.fn(), listChannelAccounts: jest.fn(), revokeChannelAccount: jest.fn(),
  startLinkedInConnect: jest.fn(), errorMessageOf: jest.fn(),
}));

import * as brandApi from '../../../../services/adminBrandApi';
import * as accountApi from '../../../../services/channelAccountApi';

let container: HTMLDivElement;
let root: Root;

function primeMocks() {
  (brandApi.listBrands as jest.Mock).mockResolvedValue({ brands: [{ id: BRAND, name: 'Colaberry', slug: 'colaberry', status: 'active', timezone: 'America/Chicago' }], scope_mode: 'scoped' });
  (brandApi.getBrandSendReadiness as jest.Mock).mockResolvedValue({ brand: null, domains: [], profiles: [] });
  (accountApi.getVaultStatus as jest.Mock).mockResolvedValue({ available: true });
  (accountApi.getLinkedInStatus as jest.Mock).mockResolvedValue({ configured: true });
  (accountApi.listChannelAccounts as jest.Mock).mockResolvedValue([]);
  (accountApi.startLinkedInConnect as jest.Mock).mockResolvedValue({ url: 'https://www.linkedin.com/oauth/v2/authorization?x=1' });
  (accountApi.errorMessageOf as jest.Mock).mockImplementation((_e: unknown, fallback: string) => fallback);
}

/** The real admin route for the Brands page, as adminRoutes.tsx declares it. */
function renderAt(url: string) {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/admin/marketing/brands" element={<AdminBrandsPage />} />
          <Route path="/admin/brands" element={<RedirectKeepingQuery to="/admin/marketing/brands" />} />
          <Route path="*" element={<div data-testid="not-found">404</div>} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

beforeEach(() => {
  primeMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

const flush = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

describe('coming back from LinkedIn', () => {
  it('the backend return path renders the Brands page, not the 404 page', async () => {
    renderAt(`${BACKEND_RETURN_PATH}?linkedin=connected&brand=${BRAND}&account=acct-1`);
    await flush();
    expect(container.querySelector('[data-testid="not-found"]')).toBeNull();
    expect(container.textContent).toMatch(/Connected accounts/);
  });

  it('?linkedin=connected shows the success notice', async () => {
    renderAt(`${BACKEND_RETURN_PATH}?linkedin=connected&brand=${BRAND}&account=acct-1`);
    await flush();
    const notice = container.querySelector('[data-testid="linkedin-connect-notice"]');
    expect(notice).not.toBeNull();
    expect(notice!.textContent).toMatch(/LinkedIn account connected/);
    expect(notice!.className).toMatch(/alert-success/);
  });

  it('?linkedin=error&reason=cancelled says so in words, and an unknown reason is still a sentence', async () => {
    renderAt(`${BACKEND_RETURN_PATH}?linkedin=error&brand=${BRAND}&reason=cancelled`);
    await flush();
    expect(container.querySelector('[data-testid="linkedin-connect-notice"]')!.textContent).toMatch(/cancelled before finishing\. Nothing was saved/);
    act(() => { root.unmount(); });
    root = createRoot(container);
    renderAt(`${BACKEND_RETURN_PATH}?linkedin=error&reason=SomethingNew`);
    await flush();
    expect(container.querySelector('[data-testid="linkedin-connect-notice"]')!.textContent).toMatch(/failed \(SomethingNew\)/);
  });

  it('the legacy /admin/brands still lands on the page, carrying the callback query with it', async () => {
    // A bare <Navigate> would drop the query and show a connected operator a page with nothing
    // on it to say so. The redirect keeps it.
    renderAt(`${LEGACY_PATH}?linkedin=connected&brand=${BRAND}&account=acct-1`);
    await flush();
    expect(container.querySelector('[data-testid="not-found"]')).toBeNull();
    expect(container.querySelector('[data-testid="linkedin-connect-notice"]')!.textContent).toMatch(/LinkedIn account connected/);
  });

  it('with no ?linkedin= there is no notice', async () => {
    renderAt(BACKEND_RETURN_PATH);
    await flush();
    expect(container.querySelector('[data-testid="linkedin-connect-notice"]')).toBeNull();
  });
});
