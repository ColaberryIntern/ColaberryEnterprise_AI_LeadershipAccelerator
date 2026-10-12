import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import BrandSetupTabs from '../BrandSetupTabs';
import { BRAND_TABS, type BrandTabKey } from '../brandSetup';

/**
 * The counts on the brand setup tabs.
 *
 * Ali's prototype (2026-10-07) puts a number on Channels, Sending domains, Approvals and
 * Campaigns, so the page answers "is there anything in here?" without being clicked through.
 * Two of those were already carried; domains and campaigns were not.
 *
 * The behaviour worth pinning is the DIFFERENCE BETWEEN NULL AND ZERO. `domainCount` is null
 * until send readiness loads, and a badge reading 0 while that request is in flight is a
 * confident statement about a brand's setup that nothing has checked yet - the same mistake
 * MarketingStatTiles was built to avoid.
 */

let container: HTMLDivElement;
let root: Root;
let onGo: jest.Mock;

type Counts = { channels: number; approvals: number; domains: number | null; campaigns: number };
const COUNTS: Counts = { channels: 0, approvals: 0, domains: null, campaigns: 0 };

async function mount(counts: Partial<Counts> = {}, active: BrandTabKey = 'channels') {
  await act(async () => {
    root.render(<BrandSetupTabs active={active} counts={{ ...COUNTS, ...counts }} onGo={onGo} />);
  });
}

function tab(key: BrandTabKey) { return container.querySelector<HTMLElement>(`[data-testid="brand-tab-${key}"]`); }
function badgeOn(key: BrandTabKey) { return tab(key)!.querySelector('.badge'); }

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  onGo = jest.fn();
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

describe('every tab is reachable', () => {
  it('renders all five, in the order the work happens', async () => {
    await mount();
    const labels = Array.from(container.querySelectorAll('[data-testid^="brand-tab-"]')).map((el) => el.textContent?.trim());
    expect(labels).toEqual(BRAND_TABS.map((t) => t.label));
  });

  it('reports which tab was asked for', async () => {
    await mount();
    await act(async () => { tab('campaigns')!.click(); });
    expect(onGo).toHaveBeenCalledWith('campaigns');
  });
});

describe('a count that is not known yet is not shown as zero', () => {
  it('draws no badge on Sending domains while readiness has not loaded', async () => {
    await mount({ domains: null });
    expect(badgeOn('domains')).toBeNull();
  });

  it('draws no badge on Sending domains for a genuine zero either', async () => {
    // Consistent with the two counts that already shipped: a zero means "nothing here", which
    // the empty state inside the tab says better than a badge reading 0.
    await mount({ domains: 0 });
    expect(badgeOn('domains')).toBeNull();
  });

  it('shows the number once readiness has loaded it', async () => {
    await mount({ domains: 2 });
    expect(badgeOn('domains')!.textContent).toBe('2');
  });
});

describe('campaigns carry a count too', () => {
  it('shows how many campaigns this brand can post under', async () => {
    await mount({ campaigns: 3 });
    expect(badgeOn('campaigns')!.textContent).toBe('3');
  });

  it('shows nothing when the brand has none', async () => {
    await mount({ campaigns: 0 });
    expect(badgeOn('campaigns')).toBeNull();
  });
});

describe('the counts that already shipped still work', () => {
  it('badges channels and approvals independently', async () => {
    await mount({ channels: 2, approvals: 5 });
    expect(badgeOn('channels')!.textContent).toBe('2');
    expect(badgeOn('approvals')!.textContent).toBe('5');
  });

  it('puts each count on its OWN tab, not on whichever renders first', async () => {
    // A countFor() that fell through would put the channel count on domains too.
    await mount({ channels: 2, approvals: 0, domains: null, campaigns: 0 });
    expect(badgeOn('channels')!.textContent).toBe('2');
    expect(badgeOn('domains')).toBeNull();
    expect(badgeOn('approvals')).toBeNull();
    expect(badgeOn('campaigns')).toBeNull();
    expect(badgeOn('details')).toBeNull();
  });

  it('never badges Details, which has no number', async () => {
    await mount({ channels: 9, approvals: 9, domains: 9, campaigns: 9 });
    expect(badgeOn('details')).toBeNull();
  });
});
