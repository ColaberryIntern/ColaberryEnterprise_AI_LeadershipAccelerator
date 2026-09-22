import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import AdminGovOpportunitiesPage from './AdminGovOpportunitiesPage';
import * as factoryApi from '../../services/factoryApi';
import type { GovOpportunityFeed } from '../../services/factoryApi';

// No @testing-library in this repo: render via react-dom/client + act and read container.textContent.
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ ...jest.requireActual('react-router-dom'), useNavigate: () => mockNavigate }));
jest.mock('../../services/factoryApi');

const snapshotFeed: GovOpportunityFeed = {
  opportunities: [
    { uuid: 'u1', title: 'Agenda RFP', agency: 'Harris County', closeDate: '2026-06-22', fitScore: 70, estimatedValue: 300000, sourceUrl: 'https://x.bonfirehub.com/opportunities/1', pursued: true },
  ],
  source: 'snapshot',
  snapshotDate: '2026-06-08',
};

let container: HTMLDivElement;
let root: Root;

async function renderPage() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<MemoryRouter><AdminGovOpportunitiesPage /></MemoryRouter>); });
  await act(async () => { await Promise.resolve(); });
}

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  jest.clearAllMocks();
});

describe('AdminGovOpportunitiesPage', () => {
  it('renders the best-fit cards with the honest SNAPSHOT banner', async () => {
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue(snapshotFeed);
    await renderPage();
    const text = container.textContent ?? '';
    expect(text).toContain('Government Opportunities');
    expect(text).toContain('Agenda RFP');
    expect(text).toContain('Harris County');
    expect(text).toContain('Fit 70');
    expect(text).toContain('Snapshot');
    expect(text).toContain('as of 2026-06-08'); // honestly dated, not presented as live
  });

  it('shows the LIVE banner when the source is live', async () => {
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue({ ...snapshotFeed, source: 'live', snapshotDate: null });
    await renderPage();
    expect(container.textContent ?? '').toContain('Live from Opportunity Pulse');
  });

  it('renders the priority badge, sector tag, and dollar value on a live card', async () => {
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue({
      opportunities: [
        { uuid: 'u9', title: 'Digital Evidence Platform', agency: 'City of Dallas', closeDate: '2026-10-23', fitScore: 80, priorityScore: 79, estimatedValue: 1000000, category: 'IT Services', sourceUrl: 'https://dallascityhall.bonfirehub.com/opportunities/1', pursued: false },
      ],
      source: 'live', snapshotDate: null,
    });
    await renderPage();
    const text = container.textContent ?? '';
    expect(text).toContain('Priority 79');       // the badge that was missing before
    expect(text).toContain('Fit 80');
    expect(text).toContain('IT Services');        // sector tag beside the agency
    expect(text).toContain('$1.0M');              // dollars, not $100.0M (cents bug would show that)
  });

  it('Start working creates the contract and navigates into the Command Center', async () => {
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue(snapshotFeed);
    (factoryApi.startGovOpportunity as jest.Mock).mockResolvedValue({ deliveryProjectId: 'dp-gov-1', created: true });
    await renderPage();

    const start = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Start working'));
    expect(start).toBeDefined();
    await act(async () => { start!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { await Promise.resolve(); });

    expect(factoryApi.startGovOpportunity).toHaveBeenCalledWith('u1', { title: 'Agenda RFP', agency: 'Harris County' });
    expect(mockNavigate).toHaveBeenCalledWith('/admin/factory?contract=dp-gov-1');
  });

  it('shows an error message when loading fails', async () => {
    (factoryApi.listGovOpportunities as jest.Mock).mockRejectedValue(new Error('boom'));
    await renderPage();
    expect(container.textContent ?? '').toContain('Could not load government opportunities');
  });
});
