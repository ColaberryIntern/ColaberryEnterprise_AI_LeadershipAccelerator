import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import MarketingStatTiles, { countPastDue } from '../MarketingStatTiles';

/**
 * The counts at the top of the Marketing overview.
 *
 * The thing worth testing here is not that four numbers render - it is that a number which
 * cannot be sourced never appears. Every other check in this suite exists to stop a confident
 * zero standing in for "we do not know".
 */

let container: HTMLDivElement;
let root: Root;

const full = {
  scheduled: 4,
  pastDue: 2,
  publishableChannels: 3,
  publishedRecently: 11,
  recentWindowDays: 30,
};

async function mount(props: React.ComponentProps<typeof MarketingStatTiles>) {
  await act(async () => {
    root.render(<MemoryRouter><MarketingStatTiles {...props} /></MemoryRouter>);
  });
}

const q = (testid: string) => container.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
const text = () => container.textContent ?? '';

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

describe('a number that is not working is omitted, not shown as zero', () => {
  it.each([
    ['scheduled', { ...full, scheduled: null }],
    ['pastDue', { ...full, pastDue: null }],
    ['publishableChannels', { ...full, publishableChannels: null }],
    ['publishedRecently', { ...full, publishedRecently: null }],
  ])('renders nothing at all when %s is unavailable', async (_name, props) => {
    // One missing value means the overview did not load, so none of the others can be trusted
    // either. "0 scheduled" is indistinguishable from an empty calendar, which is why this is
    // absence rather than a dash.
    await mount(props as React.ComponentProps<typeof MarketingStatTiles>);
    expect(q('marketing-stat-tiles')).toBeNull();
  });

  it('renders the row when every value is real', async () => {
    await mount(full);
    expect(q('marketing-stat-tiles')).not.toBeNull();
  });

  it('a genuine zero is still shown - it is a fact, not a gap', async () => {
    await mount({ ...full, scheduled: 0, publishedRecently: 0 });
    expect(q('stat-scheduled')!.textContent).toContain('0');
    expect(q('stat-published')!.textContent).toContain('0');
  });
});

describe('past due only appears when there is one', () => {
  it('is hidden at zero, so the row does not train people to ignore it', async () => {
    await mount({ ...full, pastDue: 0 });
    expect(q('stat-past-due')).toBeNull();
    expect(text()).not.toContain('Past due');
  });

  it('appears, and is marked as a problem, when something is late', async () => {
    await mount({ ...full, pastDue: 2 });
    const tile = q('stat-past-due')!;
    expect(tile.textContent).toContain('2');
    expect(tile.querySelector('.text-danger')).not.toBeNull();
  });
});

describe('every tile is a door', () => {
  it('each one links to the page that explains it', async () => {
    await mount(full);
    const href = (testid: string) => q(testid)!.getAttribute('href');
    expect(href('stat-scheduled')).toBe('/admin/marketing/calendar');
    expect(href('stat-past-due')).toBe('/admin/marketing/content');
    expect(href('stat-channels')).toBe('/admin/marketing/brands');
    expect(href('stat-published')).toBe('/admin/marketing/performance');
  });
});

describe('the labels say what the number is', () => {
  it('names the window on the published count rather than leaving "recently" to the reader', async () => {
    await mount({ ...full, recentWindowDays: 7 });
    expect(q('stat-published')!.textContent).toContain('Published in 7 days');
  });

  it('says channels that can PUBLISH, not channels connected', async () => {
    // The page counts accounts whose health is usable, which is a different and smaller number
    // than "connected". The label has to match what was counted.
    await mount(full);
    expect(q('stat-channels')!.textContent).toContain('Channels that can publish');
  });
});

describe('countPastDue trusts the server', () => {
  it('counts the rows the backend already marked late', () => {
    expect(countPastDue([{ late: true }, { late: false }, { late: true }])).toBe(2);
  });

  it('is zero for an empty schedule', () => {
    expect(countPastDue([])).toBe(0);
  });

  it('does not second-guess the flag from a timestamp', () => {
    // The row beneath this tile renders its "Late" badge from the same boolean. Recomputing it
    // from `scheduled_for` against the browser clock would let a drifted laptop show a tile that
    // disagrees with the list directly below it.
    const ancientButNotFlagged = [{ late: false, scheduled_for: '1999-01-01T00:00:00Z' }];
    expect(countPastDue(ancientButNotFlagged)).toBe(0);
  });
});
