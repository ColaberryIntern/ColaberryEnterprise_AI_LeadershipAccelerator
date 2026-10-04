import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

/**
 * The calendar's month view, and the toggle between it and the list.
 *
 * The thing worth testing here is not the squares - `monthGrid` owns those and is tested on its
 * own. It is the wiring: that a month view asks the server for the WHOLE grid rather than the 1st
 * to the 30th (otherwise the cells either side read as "nothing scheduled" when something is),
 * that the chosen view survives in the URL, and that clicking a day takes you to that day.
 */

const mockGet = jest.fn();
jest.mock('../../../../utils/api', () => ({ __esModule: true, default: { get: (...a: unknown[]) => mockGet(...a), post: jest.fn() } }));

import AdminMarketingCalendarPage from '../AdminMarketingCalendarPage';
import { MarketingBrandProvider } from '../MarketingBrandContext';

let container: HTMLDivElement;
let root: Root;

function row(id: string, scheduledFor: string, title: string) {
  return {
    id, brandId: 'b-1', brandName: 'Refactored.ai', brandTimeZone: 'America/Chicago',
    channels: ['linkedin_member'], title, scheduledFor, status: 'scheduled',
  };
}

async function renderAt(url: string): Promise<void> {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[url]}>
        <MarketingBrandProvider store={null} load={async () => ({ brands: [], scope_mode: 'migration_open' } as never)}>
          <AdminMarketingCalendarPage />
        </MarketingBrandProvider>
      </MemoryRouter>,
    );
  });
}

function lastParams(): Record<string, unknown> {
  const call = mockGet.mock.calls.at(-1) as [string, { params: Record<string, unknown> }];
  return call[1].params;
}

beforeEach(() => {
  mockGet.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

describe('month view', () => {
  it('asks for the whole grid, not just the first to the last of the month', async () => {
    mockGet.mockResolvedValue({ data: { items: [] } });
    await renderAt('/admin/marketing/calendar?view=month&month=2026-09');
    // September 2026 opens on a Tuesday, so the grid starts Monday 31 August and runs into October.
    expect(lastParams().start).toBe('2026-08-31');
    expect(String(lastParams().end)).toMatch(/^2026-10-/);
    expect(container.querySelector('[data-testid="month-title"]')?.textContent).toBe('September 2026');
  });

  it('puts each post in its Central day, and a card carries the Central time', async () => {
    mockGet.mockResolvedValue({ data: { items: [
      row('c-1', '2026-09-18T15:00:00.000Z', 'Free AI class'),
      // 8 PM Central on the 30th, which is already 1 October in UTC.
      row('c-2', '2026-10-01T01:00:00.000Z', 'Late one'),
    ] } });
    await renderAt('/admin/marketing/calendar?view=month&month=2026-09');

    const day18 = container.querySelector('[data-testid="month-cell-2026-09-18"]')!;
    expect(day18.textContent).toContain('Free AI class');
    expect(day18.textContent).toContain('10:00 AM');
    expect(day18.querySelector('a')?.getAttribute('href')).toBe('/admin/marketing/composer/c-1');

    const day30 = container.querySelector('[data-testid="month-cell-2026-09-30"]')!;
    expect(day30.textContent).toContain('Late one');
    // And NOT on 1 October, which is where a UTC reading would have filed it.
    expect(container.querySelector('[data-testid="month-cell-2026-10-01"]')!.textContent).not.toContain('Late one');
  });

  it('shows the grid when the month is empty, rather than an empty state that hides its shape', async () => {
    mockGet.mockResolvedValue({ data: { items: [] } });
    await renderAt('/admin/marketing/calendar?view=month&month=2026-09');
    expect(container.querySelector('[data-testid="month-view"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid^="month-cell-"]').length).toBe(35);
  });

  it('a failed request says so in the month view too, and shows no grid', async () => {
    mockGet.mockRejectedValue(new Error('boom'));
    await renderAt('/admin/marketing/calendar?view=month&month=2026-09');
    expect(container.textContent).toContain('could not be loaded');
    expect(container.querySelector('[data-testid="month-view"]')).toBeNull();
  });

  it('stepping to the next month refetches that month', async () => {
    mockGet.mockResolvedValue({ data: { items: [] } });
    await renderAt('/admin/marketing/calendar?view=month&month=2026-09');
    const next = container.querySelector('[aria-label="Next month"]') as HTMLButtonElement;
    await act(async () => { next.click(); });
    expect(container.querySelector('[data-testid="month-title"]')?.textContent).toBe('October 2026');
    expect(String(lastParams().start)).toMatch(/^2026-09-2[0-9]$/);
  });

  it('clicking a day drops into the list for that day alone', async () => {
    mockGet.mockResolvedValue({ data: { items: [row('c-1', '2026-09-18T15:00:00.000Z', 'Free AI class')] } });
    await renderAt('/admin/marketing/calendar?view=month&month=2026-09');
    const dayButton = container.querySelector('[data-testid="month-cell-2026-09-18"] button') as HTMLButtonElement;
    await act(async () => { dayButton.click(); });
    expect(container.querySelector('[data-testid="month-view"]')).toBeNull();
    expect(lastParams()).toMatchObject({ start: '2026-09-18', end: '2026-09-18' });
    expect((container.querySelector('#cal-start') as HTMLInputElement).value).toBe('2026-09-18');
  });
});

describe('the toggle', () => {
  it('opens as a list, with the date range, when the URL says nothing', async () => {
    mockGet.mockResolvedValue({ data: { items: [] } });
    await renderAt('/admin/marketing/calendar');
    expect(container.querySelector('[data-testid="month-view"]')).toBeNull();
    expect(container.querySelector('#cal-start')).not.toBeNull();
  });

  it('switches to the month and hides the range inputs it no longer drives', async () => {
    mockGet.mockResolvedValue({ data: { items: [] } });
    await renderAt('/admin/marketing/calendar');
    const monthButton = Array.from(container.querySelectorAll('[data-testid="calendar-view-toggle"] button'))
      .find((b) => b.textContent === 'Month') as HTMLButtonElement;
    await act(async () => { monthButton.click(); });
    expect(container.querySelector('[data-testid="month-view"]')).not.toBeNull();
    // Leaving them visible would imply they still control what is shown. They do not.
    expect(container.querySelector('#cal-start')).toBeNull();
    expect(monthButton.getAttribute('aria-pressed')).toBe('true');
  });

  it('an unusable month in the URL falls back to this month rather than rendering nothing', async () => {
    mockGet.mockResolvedValue({ data: { items: [] } });
    await renderAt('/admin/marketing/calendar?view=month&month=bogus');
    expect(container.querySelector('[data-testid="month-view"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="month-view-empty"]')).toBeNull();
  });
});
