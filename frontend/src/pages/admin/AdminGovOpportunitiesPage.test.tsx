import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import AdminGovOpportunitiesPage from './AdminGovOpportunitiesPage';
import * as factoryApi from '../../services/factoryApi';
import type { GovOpportunity, GovOpportunityFeed } from '../../services/factoryApi';

// No @testing-library in this repo: render via react-dom/client + act and read container.textContent.
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ ...jest.requireActual('react-router-dom'), useNavigate: () => mockNavigate }));
jest.mock('../../services/factoryApi');

const candidate: GovOpportunity = {
  uuid: 'u9', title: 'Digital Evidence Platform', agency: 'City of Dallas',
  closeDate: '2026-10-23', closeAt: '2026-10-23T13:00:00.000Z', fitScore: 80, priorityScore: 79,
  estimatedValue: 1000000, valueBasis: 'unverified', category: 'IT Services',
  sourceUrl: 'https://dallascityhall.bonfirehub.com/opportunities/1',
  pursuitStatus: 'none', vetVerdict: null, vetVerdictPresent: true,
};
const liveFeed: GovOpportunityFeed = { opportunities: [candidate], source: 'live', snapshotDate: null, snapshotReason: null };

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

describe('AdminGovOpportunitiesPage — Phase 1 correction', () => {
  it('labels Fit/Priority as legacy discovery scores and drops "best fits" wording', async () => {
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue(liveFeed);
    await renderPage();
    const text = container.textContent ?? '';
    expect(text).toContain('Priority 79 (legacy)');
    expect(text).toContain('Fit 80 (legacy)');
    expect(text).toContain('Legacy discovery scores');   // caption: advisory, not verified fit
    expect(text).not.toContain('best fit');
  });

  it('shows Unassessed for BOTH an absent and an explicitly-null verdict', async () => {
    const absent: GovOpportunity = { ...candidate, uuid: 'ab', vetVerdict: undefined, vetVerdictPresent: false };
    const nulled: GovOpportunity = { ...candidate, uuid: 'nu', vetVerdict: null, vetVerdictPresent: true };
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue({ opportunities: [absent, nulled], source: 'live', snapshotDate: null, snapshotReason: null });
    await renderPage();
    const unassessed = Array.from(container.querySelectorAll('.badge')).filter((b) => b.textContent === 'Unassessed');
    expect(unassessed.length).toBe(2); // both cards render Unassessed
  });

  it('explains a flagged verdict with its reason + method, and marks a weak legacy (title_regex, unevidenced) assessment', async () => {
    const flagged: GovOpportunity = { ...candidate, uuid: 'fl', title: 'Out Of Domain RFP', vetVerdict: { status: 'no_bid', reason: 'construction', method: 'title_regex', evidence: null }, vetVerdictPresent: true };
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue({ opportunities: [flagged], source: 'live', snapshotDate: null, snapshotReason: null });
    await renderPage();
    const text = container.textContent ?? '';
    expect(text).toContain('Flagged for review');
    expect(text).toContain('no bid — construction');            // reason surfaced, not just "no bid"
    expect(text).toContain('method: title_regex');
    expect(text).toContain('legacy, unevidenced (weak)');       // weak-evidence marking
  });

  it('"Open project" opens an EXISTING project (navigates) — without restoring creation', async () => {
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue(liveFeed);
    (factoryApi.startGovOpportunity as jest.Mock).mockResolvedValue({ deliveryProjectId: 'dp-gov-1', created: false });
    await renderPage();
    const open = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Open project'));
    expect(open).toBeDefined();
    await act(async () => { open!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { await Promise.resolve(); });
    expect(factoryApi.startGovOpportunity).toHaveBeenCalledWith('u9', {});
    expect(mockNavigate).toHaveBeenCalledWith('/admin/factory?contract=dp-gov-1');
  });

  it('"Open project" on a not-yet-started opportunity explains qualification is required (409), does not navigate', async () => {
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue(liveFeed);
    (factoryApi.startGovOpportunity as jest.Mock).mockRejectedValue({ response: { status: 409, data: { qualificationRequired: true } } });
    await renderPage();
    const open = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Open project'))!;
    await act(async () => { open.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { await Promise.resolve(); });
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(container.textContent ?? '').toContain('No project exists for this opportunity yet');
  });

  it('candidate card: value UNVERIFIED, review-source link, deadline warning; distinct snapshot banners', async () => {
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue(liveFeed);
    await renderPage();
    const text = container.textContent ?? '';
    expect(text).toContain('Live from Opportunity Pulse');
    expect(text).toContain('Value unverified');
    expect(text).toContain('source estimate $1.0M (not verified)');
    const reviewLink = Array.from(container.querySelectorAll('a')).find((a) => a.textContent?.includes('Review source'));
    expect(reviewLink!.getAttribute('href')).toBe('https://dallascityhall.bonfirehub.com/opportunities/1');
    expect(container.querySelector('.ri-error-warning-line')).toBeTruthy(); // deadline verification warning
  });

  it('distinguishes a CONFIGURED-but-FAILED source from "not configured"', async () => {
    const snap: GovOpportunityFeed = { opportunities: [{ uuid: 'u1', title: 'Agenda RFP', agency: 'Harris County', closeDate: '2026-06-22', fitScore: 70, estimatedValue: 300000, sourceUrl: 'https://x/1' }], source: 'snapshot', snapshotDate: '2026-06-08', snapshotReason: 'source_failed' };
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue(snap);
    await renderPage();
    const text = container.textContent ?? '';
    expect(text).toContain('Live source unavailable');
    expect(text).toContain('did not respond');
  });

  it('shows an error message when loading fails', async () => {
    (factoryApi.listGovOpportunities as jest.Mock).mockRejectedValue(new Error('boom'));
    await renderPage();
    expect(container.textContent ?? '').toContain('Could not load government opportunities');
  });
});
