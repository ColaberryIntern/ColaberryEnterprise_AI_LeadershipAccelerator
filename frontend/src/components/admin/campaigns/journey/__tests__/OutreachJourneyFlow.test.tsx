import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import OutreachJourneyFlow from '../OutreachJourneyFlow';
import * as api from '../../../../../services/intelligenceApi';

/**
 * react-dom/client + act, not @testing-library/react — RTL is NOT a dependency of
 * this repo (checked), and adding one to write a test would be a lockfile change
 * for convenience. Same convention as StatCard.test.tsx.
 */

jest.mock('../../../../../services/intelligenceApi');

/**
 * jsdom reports every element as 0×0 and has no ResizeObserver, so the chart falls
 * back to its FALLBACK_WIDTH and the REAL recharts Sankey lays out against that.
 * Nothing about recharts is stubbed — the component that actually draws the bands
 * is the one under test.
 */

const mockedApi = api as jest.Mocked<typeof api>;

let container: HTMLDivElement;
let root: Root;

async function render(node: React.ReactElement) {
  await act(async () => {
    root.render(node);
  });
}

/** Let the fetch promise chain settle. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function text(): string {
  return container.textContent ?? '';
}

function button(name: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button')).find(
    (b) => (b.textContent ?? '').trim() === name,
  );
  if (!found) throw new Error(`No button named "${name}". Buttons: ${
    Array.from(container.querySelectorAll('button')).map((b) => `"${(b.textContent ?? '').trim()}"`).join(', ')
  }`);
  return found as HTMLButtonElement;
}

function select(id: string): HTMLSelectElement {
  const el = container.querySelector<HTMLSelectElement>(`#${id}`);
  if (!el) throw new Error(`No select #${id}`);
  return el;
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

async function change(el: HTMLSelectElement, value: string) {
  await act(async () => {
    // React 18 tracks the value setter; bypass it so the synthetic onChange fires.
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

const node = (id: string, type: string, label: string, count: number, extra: object = {}) =>
  ({ id, type, label, count, metrics: {}, ...extra }) as any;
const edge = (from: string, to: string, volume: number) =>
  ({ from, to, label: 'moves', volume }) as any;

const VALIDATION = {
  total_leads: 1000,
  leads_with_first_touch: 200,
  leads_unengaged: 500,
  leads_in_campaigns: 180,
  leads_enrolled: 60,
  leads_paid: 15,
  leads_with_visitor: 220,
  leads_contacted: 400,
  leads_contacted_no_visit: 300,
  leads_engaged: 120,
  leads_opened: 80,
  leads_ignored: 200,
  warnings: [],
} as any;

function graphPayload(over: object = {}) {
  return {
    nodes: [
      node('src_marketing', 'source', 'Marketing', 400),
      node('outreach_email', 'outreach', 'Email Outreach', 400),
      node('engagement_engaged', 'engagement', 'Engaged', 120),
      node('engagement_ignored', 'engagement', 'Ignored', 280),
      node('entry_cory_chat', 'entry', 'Cory Chat', 120),
      node('campaign_c1', 'campaign', 'Spring Push', 120, {
        brand_id: 'b1',
        brand_name: 'Colaberry Enterprise',
      }),
      node('outcome_enrolled', 'outcome', 'Enrolled', 60),
    ],
    edges: [
      edge('src_marketing', 'outreach_email', 400),
      edge('outreach_email', 'engagement_engaged', 120),
      edge('outreach_email', 'engagement_ignored', 280),
      edge('engagement_engaged', 'entry_cory_chat', 120),
      edge('entry_cory_chat', 'campaign_c1', 120),
      edge('campaign_c1', 'outcome_enrolled', 60),
    ],
    validation: VALIDATION,
    brands: [
      {
        brand_id: 'b1',
        brand_name: 'Colaberry Enterprise',
        attributed: true,
        campaign_count: 1,
        lead_count: 120,
      },
      {
        brand_id: '__unattributed__',
        brand_name: 'Unattributed',
        attributed: false,
        campaign_count: 2,
        lead_count: 30,
      },
    ],
    brand_filter: null,
    ...over,
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedApi.getCampaignGraph.mockResolvedValue({ data: graphPayload() } as any);
  mockedApi.getGraphEdgeUsers.mockResolvedValue({
    data: { users: [], total: 0, page: 1, limit: 50 },
  } as any);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe('OutreachJourneyFlow — the replacement is in place', () => {
  it('renders the journey panel with its explanatory line', async () => {
    await render(<OutreachJourneyFlow />);
    await settle();
    expect(text()).toContain('Outreach Journey Flow');
    expect(text()).toContain('Follow every lead from its origin to enrollment and revenue');
  });

  it('reports loading before the data arrives', async () => {
    let resolve: (v: any) => void = () => {};
    mockedApi.getCampaignGraph.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }) as any,
    );
    await render(<OutreachJourneyFlow />);
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    await act(async () => {
      resolve({ data: graphPayload() });
    });
    await settle();
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('derives each KPI rate from its own denominator', async () => {
    await render(<OutreachJourneyFlow />);
    await settle();
    expect(text()).toContain('1,000');
    // 120 engaged is 30% of the 400 REACHED, not 12% of the 1,000 total.
    expect(text()).toContain('30.0% of leads reached');
    // 15 paid of 60 enrolled.
    expect(text()).toContain('25.0% of those enrolled');
  });
});

describe('OutreachJourneyFlow — filters drive one population', () => {
  it('asks for all time and no brand on first load', async () => {
    await render(<OutreachJourneyFlow />);
    await settle();
    // Fourth argument is the campaign scope added for the Campaign 360 Journey tab (T018);
    // undefined here because the Campaigns page is not campaign-scoped.
    expect(mockedApi.getCampaignGraph).toHaveBeenCalledWith('all', false, undefined, undefined);
  });

  it('refetches when the time window changes', async () => {
    await render(<OutreachJourneyFlow />);
    await settle();
    await change(select('journey-time'), '30d');
    await settle();
    expect(mockedApi.getCampaignGraph).toHaveBeenLastCalledWith('30d', false, undefined, undefined);
  });

  it('offers only the windows the backend actually implements', async () => {
    await render(<OutreachJourneyFlow />);
    await settle();
    const values = Array.from(select('journey-time').options).map((o) => o.value);
    // A '90d' option would silently mean "all time" on this backend.
    expect(values).toEqual(['all', '30d', '7d', '3d', '24h']);
  });

  it('refetches scoped to a brand and labels the active filter', async () => {
    await render(<OutreachJourneyFlow />);
    await settle();
    await change(select('journey-brand'), 'b1');
    await settle();
    expect(mockedApi.getCampaignGraph).toHaveBeenLastCalledWith('all', false, 'b1', undefined);
    expect(text()).toContain('Brand: Colaberry Enterprise');
  });

  it('forwards a campaignId to the API and locks the brand selector to that campaign', async () => {
    // The Campaign 360 Journey tab hands its campaign down; before this test nothing checked
    // that the id reached the request (the T018 verifier's finding).
    await render(<OutreachJourneyFlow campaignId="c0000000-0000-4000-8000-000000000001" />);
    await settle();
    expect(mockedApi.getCampaignGraph).toHaveBeenLastCalledWith('all', false, undefined, 'c0000000-0000-4000-8000-000000000001');
    expect((select('journey-brand') as HTMLSelectElement).disabled).toBe(true);
  });

  it('keeps every brand option after one is selected', async () => {
    await render(<OutreachJourneyFlow />);
    await settle();
    await change(select('journey-brand'), 'b1');
    await settle();
    const options = Array.from(select('journey-brand').options).map((o) => o.textContent);
    expect(options).toEqual(['All brands', 'Colaberry Enterprise (1)', 'Unattributed (2)']);
  });

  it('resets every filter at once', async () => {
    await render(<OutreachJourneyFlow />);
    await settle();
    await change(select('journey-brand'), 'b1');
    await settle();
    await change(select('journey-time'), '7d');
    await settle();
    await click(button('Reset'));
    await settle();
    expect(select('journey-brand').value).toBe('__all__');
    expect(select('journey-time').value).toBe('all');
  });
});

describe('OutreachJourneyFlow — the table is the diagram', () => {
  it('reports the same total in both views', async () => {
    await render(<OutreachJourneyFlow />);
    await settle();
    // 400+120+280+120+120+60 = 1,100
    expect(text()).toContain('1,100 lead movements');

    await click(button('Table'));
    await settle();
    expect(text()).toContain('6 paths · 1,100 lead movements');
  });

  it('lists one row per drawn band', async () => {
    await render(<OutreachJourneyFlow />);
    await settle();
    await click(button('Table'));
    await settle();
    // 6 bands + 1 header row
    expect(container.querySelectorAll('tr')).toHaveLength(7);
  });

  it('draws one interactive ribbon per band in flow view', async () => {
    await render(<OutreachJourneyFlow />);
    await settle();
    expect(container.querySelectorAll('path.journey-ribbon')).toHaveLength(6);
  });

  it('gives every ribbon an accessible description', async () => {
    await render(<OutreachJourneyFlow />);
    await settle();
    const labels = Array.from(container.querySelectorAll('path.journey-ribbon')).map((p) =>
      p.getAttribute('aria-label'),
    );
    expect(labels).toContain(
      'Marketing to Email Outreach: 400 leads, 100.0 percent of Marketing. Activate to list these leads.',
    );
  });

  it('makes every ribbon keyboard reachable', async () => {
    await render(<OutreachJourneyFlow />);
    await settle();
    const ribbons = Array.from(container.querySelectorAll('path.journey-ribbon'));
    expect(ribbons.every((p) => p.getAttribute('tabindex') === '0')).toBe(true);
  });
});

describe('OutreachJourneyFlow — drill-down', () => {
  it('calls the edge-user endpoint with the selected band', async () => {
    await render(<OutreachJourneyFlow />);
    await settle();
    await click(button('Table'));
    await settle();

    // Rows are sorted by volume, so the first is src_marketing → outreach_email.
    const firstInspect = container.querySelectorAll('tbody tr')[0].querySelector('button')!;
    await click(firstInspect);
    await settle();

    expect(mockedApi.getGraphEdgeUsers).toHaveBeenCalledWith(
      'src_marketing',
      'outreach_email',
      1,
      50,
    );
    expect(text()).toContain('Marketing → Email Outreach');
  });

  it('closes the drill-down with Escape', async () => {
    await render(<OutreachJourneyFlow />);
    await settle();
    await click(button('Table'));
    await settle();
    await click(container.querySelectorAll('tbody tr')[0].querySelector('button')!);
    await settle();
    expect(text()).toContain('Marketing → Email Outreach');

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    await settle();
    expect(text()).not.toContain('Marketing → Email Outreach');
  });

  it('surfaces a failed drill-down instead of showing an empty list', async () => {
    mockedApi.getGraphEdgeUsers.mockRejectedValue({
      response: { data: { error: 'edge query failed' } },
    });
    await render(<OutreachJourneyFlow />);
    await settle();
    await click(button('Table'));
    await settle();
    await click(container.querySelectorAll('tbody tr')[0].querySelector('button')!);
    await settle();
    expect(text()).toContain('edge query failed');
  });

  it('refuses to drill into a grouped band', async () => {
    mockedApi.getCampaignGraph.mockResolvedValue({
      data: graphPayload({
        nodes: [
          node('entry_cory_chat', 'entry', 'Cory Chat', 90),
          ...Array.from({ length: 9 }, (_, i) =>
            node(`campaign_c${i}`, 'campaign', `Campaign ${i}`, 10),
          ),
        ],
        edges: Array.from({ length: 9 }, (_, i) => edge('entry_cory_chat', `campaign_c${i}`, 10)),
      }),
    } as any);

    await render(<OutreachJourneyFlow />);
    await settle();
    await click(button('Table'));
    await settle();

    const groupedRow = Array.from(container.querySelectorAll('tbody tr')).find((tr) =>
      (tr.textContent ?? '').includes('Other campaigns'),
    )!;
    expect(groupedRow).toBeDefined();
    expect(groupedRow.querySelector('button')!.disabled).toBe(true);
  });
});

describe('OutreachJourneyFlow — journey detail toggle', () => {
  it('folds campaigns without changing the total or refetching', async () => {
    await render(<OutreachJourneyFlow />);
    await settle();
    expect(text()).toContain('1,100 lead movements');

    await click(button('First touch'));
    await settle();

    expect(text()).toContain('1,100 lead movements');
    // A client-side reshape of the same population, not a new query.
    expect(mockedApi.getCampaignGraph).toHaveBeenCalledTimes(1);
  });
});

describe('OutreachJourneyFlow — empty, error and warning states', () => {
  it('states an empty view rather than rendering nothing', async () => {
    mockedApi.getCampaignGraph.mockResolvedValue({
      data: { nodes: [], edges: [], validation: VALIDATION, brands: [] },
    } as any);
    await render(<OutreachJourneyFlow />);
    await settle();
    expect(text()).toContain('No lead journeys in this view.');
  });

  it('distinguishes a failed request from an empty funnel', async () => {
    mockedApi.getCampaignGraph.mockRejectedValue({
      response: { data: { error: 'upstream exploded' } },
    });
    await render(<OutreachJourneyFlow />);
    await settle();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(text()).toContain('The journey could not be loaded.');
    expect(text()).toContain('upstream exploded');
  });

  it('retries after an error', async () => {
    mockedApi.getCampaignGraph.mockRejectedValueOnce(new Error('network'));
    await render(<OutreachJourneyFlow />);
    await settle();
    expect(text()).toContain('The journey could not be loaded.');

    mockedApi.getCampaignGraph.mockResolvedValue({ data: graphPayload() } as any);
    await click(button('Try again'));
    await settle();
    expect(text()).toContain('1,100 lead movements');
  });

  it('shows the graph engine’s own warning rather than an invented one', async () => {
    mockedApi.getCampaignGraph.mockResolvedValue({
      data: graphPayload({
        validation: {
          ...VALIDATION,
          warnings: ['All 25 campaigns belong to Colaberry Enterprise.'],
        },
      }),
    } as any);
    await render(<OutreachJourneyFlow />);
    await settle();
    expect(text()).toContain('All 25 campaigns belong to Colaberry Enterprise.');
  });

  it('derives the largest leak from the data on screen', async () => {
    await render(<OutreachJourneyFlow />);
    await settle();
    // 280 arrive at Ignored and none leave. "journeys", not "leads": band volumes
    // count paths taken and node counts count distinct people, and live data shows
    // the two do not reconcile.
    expect(text()).toContain('280 journeys stop at Ignored');
    expect(text()).toContain('What needs attention');
  });
});
