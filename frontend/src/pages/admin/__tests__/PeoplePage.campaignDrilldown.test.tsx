import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

/**
 * A Campaign 360 KPI card links to the people roster with `campaign` and `status` in the
 * URL. This proves the roster SENDS them to the API - the half the T017 verifier found
 * missing: the cards linked, the page ignored the filters, and every card opened the whole
 * roster under a scoped headline.
 */

const mockGet = jest.fn();
jest.mock('../../../utils/api', () => ({ __esModule: true, default: { get: (...a: unknown[]) => mockGet(...a) } }));

import PeoplePage from '../PeoplePage';
import { toDrilldownUrl } from '../../../adminOs/drilldown';
import { buildOverviewKpis } from '../../../components/campaign/campaignOverviewKpis';

const CAMPAIGN = 'c0000000-0000-4000-8000-000000000001';
let container: HTMLDivElement;
let root: Root;

async function renderAt(url: string): Promise<void> {
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[url]}><PeoplePage /></MemoryRouter>);
  });
}

function lastQuery(): URLSearchParams {
  const url = String(mockGet.mock.calls.at(-1)?.[0] ?? '');
  return new URLSearchParams(url.split('?')[1] ?? '');
}

beforeEach(() => {
  mockGet.mockReset().mockResolvedValue({ data: { rows: [], total: 0, visibleStages: [], limit: 50, offset: 0 } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

describe('the KPI drill-down reaches the API', () => {
  it('the Active card opens a roster that asks for campaign=<id>&status=active', async () => {
    const active = buildOverviewKpis(CAMPAIGN, { active: 12 }, 12).find((k) => k.key === 'active')!;
    await renderAt(toDrilldownUrl(active.drilldown));
    const q = lastQuery();
    expect(q.get('campaign')).toBe(CAMPAIGN);
    expect(q.get('status')).toBe('active');
    expect(container.querySelector('[data-testid="campaign-scope"]')?.textContent).toContain('status active');
  });

  it('the Total card asks for the campaign with no status', async () => {
    const total = buildOverviewKpis(CAMPAIGN, { active: 12 }, 12).find((k) => k.key === 'total')!;
    await renderAt(toDrilldownUrl(total.drilldown));
    const q = lastQuery();
    expect(q.get('campaign')).toBe(CAMPAIGN);
    expect(q.has('status')).toBe(false);
  });

  it('the Removed card asks for exactly the status the card counted', async () => {
    const removed = buildOverviewKpis(CAMPAIGN, { removed: 2 }, 2).find((k) => k.key === 'removed')!;
    await renderAt(toDrilldownUrl(removed.drilldown));
    expect(lastQuery().get('status')).toBe('removed');
  });

  it('a plain visit sends no campaign filter and shows no scope banner', async () => {
    await renderAt('/admin/people');
    const q = lastQuery();
    expect(q.has('campaign')).toBe(false);
    expect(container.querySelector('[data-testid="campaign-scope"]')).toBeNull();
  });
});
