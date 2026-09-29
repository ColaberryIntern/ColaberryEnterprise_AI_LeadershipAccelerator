/**
 * The Marketing Overview - the landing page that replaced the funnel dashboard on 2026-09-18.
 *
 * The property under test is the one the old page lacked entirely: every block is a door into
 * the page behind it. The old /admin/marketing had zero links to Brands, the Composer, the
 * Calendar or either queue, which is why Ali described the tab as "a lot of loose pieces".
 * A future edit that drops one of these links fails here rather than in his next complaint.
 *
 * The second property is honesty about accounts: a connected-but-expired token must never be
 * shown as "Connected", because as of 2026-09-18 nothing refreshes it and the next post on it
 * fails. That rule is proven on the backend in overviewHealth.test.ts; this suite proves the
 * page renders what the rule decided.
 */

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { MarketingBrandProvider } from '../MarketingBrandContext';
import { BRAND_STORAGE_KEY, type BrandStore } from '../brandScope';
import AdminMarketingOverviewPage from '../AdminMarketingOverviewPage';

// CRA's jest config resets mock implementations before every test, so they are primed in
// beforeEach rather than in these factories.
jest.mock('../../../../services/marketingOpsApi', () => ({
  getNeedsAttention: jest.fn(),
  getMarketingOverview: jest.fn(),
}));
jest.mock('../../../../services/adminBrandApi', () => ({ listBrands: jest.fn() }));

import * as opsApi from '../../../../services/marketingOpsApi';
import * as brandApi from '../../../../services/adminBrandApi';
import type { MarketingOverview } from '../../../../services/marketingOpsApi';

const BRAND = '22222222-2222-4222-8222-222222222222';
const NOW = Date.now();
const hoursFromNow = (h: number) => new Date(NOW + h * 3_600_000).toISOString();

function overview(over: Partial<MarketingOverview> = {}): MarketingOverview {
  return {
    upcoming: [],
    upcoming_truncated: false,
    accounts: [],
    handoff_providers: [],
    recent: { published: 0, since: hoursFromNow(-720), window_days: 30 },
    ...over,
  };
}

let container: HTMLDivElement;
let root: Root;

function prime(o: MarketingOverview = overview()) {
  (opsApi.getNeedsAttention as jest.Mock).mockResolvedValue({ items: [], excluded: [] });
  (opsApi.getMarketingOverview as jest.Mock).mockResolvedValue(o);
  (brandApi.listBrands as jest.Mock).mockResolvedValue({
    brands: [{ id: BRAND, name: 'Refactored.ai', slug: 'refactored', status: 'active', timezone: 'America/Chicago' }],
  });
}

const flush = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

function memoryStore(initial: Record<string, string> = {}): BrandStore {
  const data = { ...initial };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; }, removeItem: (k) => { delete data[k]; } };
}

/** The page as it is actually routed: inside the marketing frame that holds the brand. */
async function render(store: BrandStore = memoryStore()) {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={['/admin/marketing']}>
        <MarketingBrandProvider store={store} load={brandApi.listBrands as never}>
          <AdminMarketingOverviewPage />
        </MarketingBrandProvider>
      </MemoryRouter>,
    );
  });
  // Twice: one settle for the brand list, one for the page's own fetches. The page no longer
  // refetches when the list arrives - MarketingBrandContext keeps `params` identity stable -
  // but settling both keeps this suite off the machine's timing under a loaded parallel run.
  await flush();
  await flush();
}

const hrefs = () => Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
const text = () => container.textContent ?? '';

beforeEach(() => {
  prime();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

describe('every block is a door', () => {
  it('links to the composer, the calendar, brands and performance - even when empty', async () => {
    await render();
    const links = hrefs();
    expect(links).toContain('/admin/marketing/composer');
    expect(links).toContain('/admin/marketing/calendar');
    expect(links).toContain('/admin/marketing/brands');
    expect(links).toContain('/admin/marketing/performance');
  });

  it('each upcoming post opens in the composer', async () => {
    prime(overview({
      upcoming: [{
        id: 'post-1', title: 'Free AI class Thursday', brand_id: BRAND, brand_name: 'Refactored.ai',
        scheduled_for: hoursFromNow(26), status: 'scheduled', providers: ['linkedin_member'], late: false,
      }],
    }));
    await render();
    expect(hrefs()).toContain('/admin/marketing/composer/post-1');
    expect(text()).toContain('Free AI class Thursday');
    expect(text()).toContain('LinkedIn');
  });
});

describe('empty states name what is missing and where to go', () => {
  it('nothing scheduled points at the composer; no accounts points at brands', async () => {
    await render();
    expect(text()).toContain('Nothing scheduled');
    expect(text()).toContain('Write a post');
    expect(text()).toContain('No accounts connected');
    expect(text()).toContain('Connect an account');
  });
});

describe('account honesty', () => {
  it('an expired token reads as expired, never as Connected, and is not counted as usable', async () => {
    prime(overview({
      accounts: [{
        id: 'acc-1', brand_id: BRAND, brand_name: 'Refactored.ai', provider: 'linkedin_member',
        display_name: 'Ali Muwwakkil', health: 'expired',
        token_expires_at: hoursFromNow(-48), expires_in_days: -2,
      }],
      handoff_providers: ['linkedin_member', 'x'],
    }));
    await render();
    expect(text()).toContain('Token expired');
    expect(text()).toContain('expired 2 days ago');
    expect(text()).not.toContain('Connected');
    expect(text()).toContain('0 of 1 account can publish today');
  });

  it('a healthy account is counted, and the hand-posted networks are named', async () => {
    prime(overview({
      accounts: [{
        id: 'acc-1', brand_id: BRAND, brand_name: 'Refactored.ai', provider: 'linkedin_member',
        display_name: 'Ali Muwwakkil', health: 'ok',
        token_expires_at: hoursFromNow(24 * 55), expires_in_days: 55,
      }],
      handoff_providers: ['x', 'meta_instagram'],
    }));
    await render();
    expect(text()).toContain('Connected');
    expect(text()).toContain('1 of 1 account can publish today');
    expect(text()).toContain('Posted by hand: X');
    expect(text()).toContain('Instagram');
  });
});

describe('late posts', () => {
  it('are flagged, not rendered as ordinary rows', async () => {
    prime(overview({
      upcoming: [{
        id: 'post-late', title: 'Should have gone', brand_id: BRAND, brand_name: 'Refactored.ai',
        scheduled_for: hoursFromNow(-2), status: 'scheduled', providers: ['linkedin_member'], late: true,
      }],
    }));
    await render();
    expect(text()).toContain('Late');
  });
});

describe('failure', () => {
  it('shows an error with a retry, and does not fall through to the empty states', async () => {
    (opsApi.getMarketingOverview as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    await render();
    expect(text()).toContain('The overview could not be loaded.');
    // An error must not be dressed up as "nothing scheduled" - that reads as an answer.
    expect(text()).not.toContain('Nothing scheduled');
    const retry = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Retry');
    expect(retry).toBeDefined();

    await act(async () => { retry!.click(); });
    await flush();
    expect(text()).not.toContain('The overview could not be loaded.');
    expect(text()).toContain('Nothing scheduled');
  });
});

describe('brand scope', () => {
  it('reads the brand from the marketing frame, not from a picker of its own', async () => {
    // Until 2026-09-29 this page carried its own <select>, and the Brands page carried another
    // that disagreed with it. The frame holds the brand now; the page only reads it.
    await render(memoryStore({ [BRAND_STORAGE_KEY]: BRAND }));
    expect(container.querySelector('#overview-brand')).toBeNull();
    expect(opsApi.getMarketingOverview).toHaveBeenLastCalledWith({ brand_id: BRAND });
    expect(opsApi.getNeedsAttention).toHaveBeenLastCalledWith({ brand_id: BRAND });
  });

  it('All brands sends no brand filter at all', async () => {
    await render();
    expect(opsApi.getMarketingOverview).toHaveBeenCalledWith(undefined);
  });
});
