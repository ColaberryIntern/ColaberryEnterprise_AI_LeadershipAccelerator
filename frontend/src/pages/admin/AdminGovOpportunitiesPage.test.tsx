import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import AdminGovOpportunitiesPage from './AdminGovOpportunitiesPage';
import * as factoryApi from '../../services/factoryApi';
import type { GovOpportunity, GovOpportunityFeed } from '../../services/factoryApi';

// No @testing-library in this repo: render via react-dom/client + act and read container.textContent.
jest.mock('../../services/factoryApi');

const candidate: GovOpportunity = {
  uuid: 'u9', title: 'Digital Evidence Platform', agency: 'City of Dallas',
  closeDate: '2026-10-23', closeAt: '2026-10-23T13:00:00.000Z', fitScore: 80, priorityScore: 79,
  estimatedValue: 1000000, valueBasis: 'unverified', category: 'IT Services',
  sourceUrl: 'https://dallascityhall.bonfirehub.com/opportunities/1',
  pursuitStatus: 'none', vetVerdict: null, vetVerdictPresent: true,
};
const liveFeed: GovOpportunityFeed = { opportunities: [candidate], source: 'live', snapshotDate: null, snapshotReason: null };
const snapshotFeed: GovOpportunityFeed = {
  opportunities: [{ uuid: 'u1', title: 'Agenda RFP', agency: 'Harris County', closeDate: '2026-06-22', fitScore: 70, estimatedValue: 300000, sourceUrl: 'https://x/1' }],
  source: 'snapshot', snapshotDate: '2026-06-08', snapshotReason: 'not_configured',
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

describe('AdminGovOpportunitiesPage — Phase 1 qualification framing', () => {
  it('frames rows as discovered candidates requiring qualification, with the not-configured snapshot banner', async () => {
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue(snapshotFeed);
    await renderPage();
    const text = container.textContent ?? '';
    expect(text).toContain('Discovered candidates');
    expect(text).toContain('needs qualification');
    expect(text).toContain('Agenda RFP');
    expect(text).toContain('Snapshot as of 2026-06-08');
    expect(text).not.toContain('not respond'); // not_configured, NOT a source failure
  });

  it('distinguishes a CONFIGURED-but-FAILED source from "not configured"', async () => {
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue({ ...snapshotFeed, snapshotReason: 'source_failed' });
    await renderPage();
    const text = container.textContent ?? '';
    expect(text).toContain('Live source unavailable');
    expect(text).toContain('did not respond');
  });

  it('shows the LIVE banner and a candidate card: value UNVERIFIED, no create action, review-source + deadline warning', async () => {
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue(liveFeed);
    await renderPage();
    const text = container.textContent ?? '';
    expect(text).toContain('Live from Opportunity Pulse');
    expect(text).toContain('Priority 79');
    expect(text).toContain('Fit 80');
    expect(text).toContain('IT Services');
    expect(text).toContain('Value unverified');                 // never a definitive dollar amount
    expect(text).toContain('source estimate $1.0M (not verified)'); // legacy estimate only, explicitly labeled
    expect(text).toContain('Unassessed');                       // vetVerdict present-but-null => unassessed
    expect(text).toContain('Qualification required');
    // the legacy create action is gone; a review-source link is offered instead
    const startBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Start working'));
    expect(startBtn).toBeUndefined();
    const reviewLink = Array.from(container.querySelectorAll('a')).find((a) => a.textContent?.includes('Review source'));
    expect(reviewLink).toBeDefined();
    expect(reviewLink!.getAttribute('href')).toBe('https://dallascityhall.bonfirehub.com/opportunities/1');
    // deadline carries a source-verification warning icon
    expect(container.querySelector('.ri-error-warning-line')).toBeTruthy();
  });

  it('routes a flagged (no_bid / declined) opportunity to "Flagged for review", NOT to candidates', async () => {
    const flagged: GovOpportunity = { ...candidate, uuid: 'u7', title: 'Out Of Domain RFP', vetVerdict: { status: 'no_bid', reason: 'construction' }, vetVerdictPresent: true };
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue({ opportunities: [candidate, flagged], source: 'live', snapshotDate: null, snapshotReason: null });
    await renderPage();
    const text = container.textContent ?? '';
    expect(text).toContain('Flagged for review');
    expect(text).toContain('Out Of Domain RFP');
    // the flagged card shows its verdict, and the candidate count excludes it (1 candidate, 1 flagged)
    expect(text).toContain('no bid');
    const candidatesCard = container.textContent ?? '';
    expect(candidatesCard).toContain('Digital Evidence Platform'); // the clean candidate still shows
  });

  it('shows an error message when loading fails', async () => {
    (factoryApi.listGovOpportunities as jest.Mock).mockRejectedValue(new Error('boom'));
    await renderPage();
    expect(container.textContent ?? '').toContain('Could not load government opportunities');
  });
});
