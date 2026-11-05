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
  // Two flushes: one for listGovOpportunities resolving, one for the resulting setFeed re-render.
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
}

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  jest.clearAllMocks();
});

// DetailsModal calls the matcher on open; default it to empty so tests that don't care don't break.
beforeEach(() => {
  (factoryApi.matchServicesToOpportunity as jest.Mock).mockResolvedValue({ matches: [], catalogSize: 0 });
});

describe('AdminGovOpportunitiesPage — dashboard redesign (honesty rails preserved)', () => {
  it('renders the legacy scores as advisory chips and never says "best fit"', async () => {
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue(liveFeed);
    await renderPage();
    const text = container.textContent ?? '';
    expect(text).toContain('79');   // priority chip
    expect(text).toContain('80');   // fit chip
    expect(text).toContain('Legacy discovery scores are advisory, not verified company fit');
    expect(text).not.toContain('best fit');
  });

  it('shows Unassessed for BOTH an absent and an explicitly-null verdict (one badge per row)', async () => {
    const absent: GovOpportunity = { ...candidate, uuid: 'ab', vetVerdict: undefined, vetVerdictPresent: false };
    const nulled: GovOpportunity = { ...candidate, uuid: 'nu', vetVerdict: null, vetVerdictPresent: true };
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue({ opportunities: [absent, nulled], source: 'live', snapshotDate: null, snapshotReason: null });
    await renderPage();
    const unassessed = Array.from(container.querySelectorAll('.badge')).filter((b) => b.textContent === 'Unassessed');
    expect(unassessed.length).toBe(2);
  });

  it('explains a flagged verdict with its reason + method and marks a weak legacy assessment (never a candidate)', async () => {
    const flagged: GovOpportunity = { ...candidate, uuid: 'fl', title: 'Out Of Domain RFP', vetVerdict: { status: 'no_bid', reason: 'construction', method: 'title_regex', evidence: null }, vetVerdictPresent: true };
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue({ opportunities: [flagged], source: 'live', snapshotDate: null, snapshotReason: null });
    await renderPage();
    const text = container.textContent ?? '';
    expect(text).toContain('Flagged for review');
    expect(text).toContain('no bid — construction');
    expect(text).toContain('method: title_regex');
    expect(text).toContain('legacy, unevidenced (weak)');
  });

  it('"Qualify" routes to the qualification workspace carrying the clicked title as a DISPLAY hint (no canonical id derived from the title)', async () => {
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue(liveFeed);
    await renderPage();
    const qualify = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Qualify'));
    expect(qualify).toBeDefined();
    await act(async () => { qualify!.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    const target = (mockNavigate as jest.Mock).mock.calls[0][0] as string;
    expect(target).toContain('/admin/gov-qualification?gws=gws%3A');  // opens the ZIP workspace keyed off the discovery row uuid
    expect(target).toContain('from=');                                // carries the clicked proposal for display
    expect(target).not.toContain('canonical=');                       // but NEVER a title-derived canonical id
  });

  it('row: unverified value, Source link, deadline warning; live pill in the header', async () => {
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue(liveFeed);
    await renderPage();
    const text = container.textContent ?? '';
    expect(text).toContain('Live from Opportunity Pulse');
    expect(text).toContain('$1.0M');
    expect(text).toContain('unverified');
    expect(text).toContain('not revenue');   // the pipeline card never calls an estimate revenue
    const sourceLink = Array.from(container.querySelectorAll('a')).find((a) => a.textContent?.includes('Source'));
    expect(sourceLink!.getAttribute('href')).toBe('https://dallascityhall.bonfirehub.com/opportunities/1');
    expect(container.querySelector('.ri-error-warning-line')).toBeTruthy(); // deadline verification warning
  });

  it('summarises the pipeline and distribution without presenting estimates as revenue', async () => {
    const other: GovOpportunity = { ...candidate, uuid: 'o2', title: 'Advisory Services', agency: 'U3P', category: 'Consulting', fitScore: 70, priorityScore: 54, estimatedValue: 250000, closeDate: '2026-10-05' };
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue({ opportunities: [candidate, other], source: 'live', snapshotDate: null, snapshotReason: null });
    await renderPage();
    const text = container.textContent ?? '';
    expect(text).toContain('Pipeline value');
    expect(text).toContain('Priority mix');
    expect(text).toContain('Fit mix');
    // IT vs Consulting split surfaced
    expect(text).toMatch(/IT \$1\.0M/);
    expect(text).toMatch(/Consulting \$250K|Consulting \$0K/);
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

  // ── Discovery upgrade: show more, good-fits, decent filter, details popup, team dismiss/restore ──
  const goodFit: GovOpportunity = { ...candidate, uuid: 'g1', title: 'High Fit Platform', fitScore: 80, priorityScore: 78 };
  const lowFit: GovOpportunity = { ...candidate, uuid: 'l1', title: 'Low Fit Services', agency: 'U3P', category: 'Consulting', fitScore: 50, priorityScore: 40 };

  const findButton = (label: string) => Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === label);
  const kpi = (label: string) => {
    const card = Array.from(container.querySelectorAll('.admin-stat-card'))
      .find((c) => c.querySelector('.admin-stat-card__label')?.textContent === label);
    return card?.querySelector('.admin-stat-card__value')?.textContent?.trim();
  };
  const clickEl = async (el: Element) => {
    await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
  };

  it('shows a Good fits count (fit ≥ 75) and a Decent options filter', async () => {
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue({ opportunities: [goodFit, lowFit], source: 'live', snapshotDate: null, snapshotReason: null, totalAvailable: 50 });
    await renderPage();
    const text = container.textContent ?? '';
    expect(text).toContain('Good fits');
    expect(text).toContain('Decent options');
    expect(text).toContain('decent'); // the good-fits hint names the decent threshold
  });

  it('the Decent options filter hides a fit<60 row', async () => {
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue({ opportunities: [goodFit, lowFit], source: 'live', snapshotDate: null, snapshotReason: null, totalAvailable: 50 });
    await renderPage();
    expect(container.textContent ?? '').toContain('Low Fit Services'); // both shown initially
    const toggle = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Decent options'));
    await clickEl(toggle!);
    const text = container.textContent ?? '';
    expect(text).toContain('High Fit Platform'); // fit 80 kept
    expect(text).not.toContain('Low Fit Services'); // fit 50 hidden
  });

  it('KPI cards recompute when a filter is applied (they reflect the filtered view, not the full set)', async () => {
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue({ opportunities: [goodFit, lowFit], source: 'live', snapshotDate: null, snapshotReason: null, totalAvailable: 50 });
    await renderPage();
    expect(kpi('Candidates')).toBe('2');   // both in view by default
    expect(kpi('Good fits')).toBe('1');    // only the fit-80 row
    const toggle = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Decent options'));
    await clickEl(toggle!);
    expect(kpi('Candidates')).toBe('1');   // the fit-50 row is filtered out → KPI drops
    expect(kpi('Good fits')).toBe('1');    // the fit-80 row stays
  });

  it('shows how many are available vs shown', async () => {
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue({ opportunities: [goodFit, lowFit], source: 'live', snapshotDate: null, snapshotReason: null, totalAvailable: 50, dismissedCount: 3 });
    await renderPage();
    const text = container.textContent ?? '';
    expect(text).toMatch(/Showing\s*2\s*of\s*50/);
    expect(text).toContain('3'); // dismissed count surfaced
  });

  it('says how many left the list because they are assigned to interns, and where they went', async () => {
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue({ opportunities: [goodFit], source: 'live', snapshotDate: null, snapshotReason: null, totalAvailable: 50, dismissedCount: 0, assignedCount: 2 });
    await renderPage();
    expect(container.textContent ?? '').toMatch(/2\s*assigned to interns \(see Interns > Gov Contracts\)/);
  });

  it('shows no assigned note when nothing is assigned, or when the field is absent', async () => {
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue({ opportunities: [goodFit], source: 'live', snapshotDate: null, snapshotReason: null, totalAvailable: 50, dismissedCount: 0 });
    await renderPage();
    expect(container.textContent ?? '').not.toContain('assigned to interns');
  });

  it('Details opens a popup with why-it-surfaced + the PRELIMINARY, UNVERIFIED overview', async () => {
    const withSummary: GovOpportunity = { ...candidate, uuid: 's1', title: 'Summarized RFP', preliminarySummary: 'A courts case-management modernization.' };
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue({ opportunities: [withSummary], source: 'live', snapshotDate: null, snapshotReason: null });
    await renderPage();
    await clickEl(findButton('Details')!);
    const text = container.textContent ?? '';
    expect(text).toContain('Why it surfaced');
    expect(text).toContain('Project overview');
    expect(text).toContain('Preliminary, unverified'); // the honesty label
    expect(text).toContain('not confirmed requirements');
    expect(text).toContain('A courts case-management modernization.');
  });

  it('Details shows suggested services (advisory) with the "suggested — confirm" label and the overlap reason', async () => {
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue(liveFeed);
    (factoryApi.matchServicesToOpportunity as jest.Mock).mockResolvedValue({ matches: [
      { id: 'data', name: 'Managed Data Services', category: 'Data', score: 2, strength: 'moderate', reason: 'Matches on keywords: data analytics', matchedKeywords: ['data analytics'], categoryMatched: false, matchedNaics: [] },
    ], catalogSize: 10 });
    await renderPage();
    await clickEl(findButton('Details')!);
    const text = container.textContent ?? '';
    expect(text).toContain('Services we could offer');
    expect(text).toContain('suggested — confirm');
    expect(text).toContain('Managed Data Services');
    expect(text).toContain('Matches on keywords: data analytics');
    expect(factoryApi.matchServicesToOpportunity).toHaveBeenCalled();
  });

  it('Details shows the empty-state when no services match', async () => {
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue(liveFeed);
    (factoryApi.matchServicesToOpportunity as jest.Mock).mockResolvedValue({ matches: [], catalogSize: 10 });
    await renderPage();
    await clickEl(findButton('Details')!);
    expect(container.textContent ?? '').toContain('No suggested services');
  });

  it('Details overview falls back to an explicit "not available yet" when no summary', async () => {
    const noSummary: GovOpportunity = { ...candidate, uuid: 'n1', title: 'No Summary RFP', preliminarySummary: null };
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue({ opportunities: [noSummary], source: 'live', snapshotDate: null, snapshotReason: null });
    await renderPage();
    await clickEl(findButton('Details')!);
    expect(container.textContent ?? '').toContain('No preliminary summary available yet');
  });

  it('Dismiss calls the API with the OP uuid and removes the row', async () => {
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue({ opportunities: [goodFit, lowFit], source: 'live', snapshotDate: null, snapshotReason: null, totalAvailable: 50 });
    (factoryApi.dismissGovOpportunity as jest.Mock).mockResolvedValue({ dismissed: { opportunity_key: 'g1', restored_at: null } });
    await renderPage();
    const dismissBtn = findButton('Dismiss'); // the row dismiss button (icon + visually-hidden "Dismiss")
    expect(dismissBtn).toBeDefined();
    await clickEl(dismissBtn!);
    expect(factoryApi.dismissGovOpportunity).toHaveBeenCalledWith('g1', expect.objectContaining({ title: 'High Fit Platform' }));
    expect(container.textContent ?? '').not.toContain('High Fit Platform'); // row removed optimistically
  });

  it('the Hidden list loads on open, explains each hide, and restores from any browser', async () => {
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue({ opportunities: [goodFit], source: 'live', snapshotDate: null, snapshotReason: null, totalAvailable: 50, dismissedCount: 2 });
    (factoryApi.listHiddenGovOpportunities as jest.Mock).mockResolvedValue({ hidden: [
      { opportunityKey: 'h1', title: 'AI Hid This', agency: 'City', reason: 'ai_not_a_fit', dismissedBy: 'gov-opp-sweep', dismissedAt: null },
      { opportunityKey: 'h2', title: 'A Person Hid This', agency: 'County', reason: null, dismissedBy: 'x@y.com', dismissedAt: null },
    ] });
    (factoryApi.restoreGovOpportunity as jest.Mock).mockResolvedValue({ restored: { opportunity_key: 'h1', restored_at: '2026-11-05T00:00:00Z' } });
    await renderPage();
    expect(factoryApi.listHiddenGovOpportunities).not.toHaveBeenCalled();
    const disclosure = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Hidden (2)'));
    await clickEl(disclosure!);
    await act(async () => { await Promise.resolve(); });
    const text = container.textContent ?? '';
    expect(text).toContain('AI Hid This');
    expect(text).toContain('AI says not a fit');
    expect(text).toContain('Dismissed by a person');
    const calls = (factoryApi.listGovOpportunities as jest.Mock).mock.calls.length;
    await clickEl(Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Restore'))!);
    await act(async () => { await Promise.resolve(); });
    expect(factoryApi.restoreGovOpportunity).toHaveBeenCalledWith('h1');
    expect(container.textContent ?? '').not.toContain('AI Hid This');
    expect((factoryApi.listGovOpportunities as jest.Mock).mock.calls.length).toBeGreaterThan(calls); // the board reloads
  });

  it('Restore stays reachable when every row is hidden and the board is empty', async () => {
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue({ opportunities: [], source: 'live', snapshotDate: null, snapshotReason: null, totalAvailable: 50, dismissedCount: 4 });
    await renderPage();
    expect(container.textContent ?? '').toContain('No discovered candidates');
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent?.includes('Hidden (4)'))).toBe(true);
  });

  it('a failed Hidden load says so instead of showing an empty list', async () => {
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue({ opportunities: [goodFit], source: 'live', snapshotDate: null, snapshotReason: null, dismissedCount: 1 });
    (factoryApi.listHiddenGovOpportunities as jest.Mock).mockRejectedValue(new Error('down'));
    await renderPage();
    await clickEl(Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Hidden (1)'))!);
    await act(async () => { await Promise.resolve(); });
    expect(container.textContent ?? '').toContain('Could not load the hidden list.');
    expect(container.textContent ?? '').not.toContain('Nothing is hidden.');
  });

  it('shows no Hidden control when nothing is hidden', async () => {
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue({ ...liveFeed, dismissedCount: 0 });
    await renderPage();
    expect(container.textContent ?? '').not.toContain('Hidden (');
  });

  // ── Approval stays a separate fact from the AI's star ──
  it('labels human approval "Approved" when the board sent no stage, replacing Unassessed', async () => {
    const approved: GovOpportunity = { ...candidate, uuid: 'v1', title: 'Approved Platform', vetting: { stage: 'vetted', decision: 'approved_bid_pursuit', approvalStatus: 'approved' } };
    (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue({ opportunities: [approved], source: 'live', snapshotDate: null, snapshotReason: null });
    await renderPage();
    const badges = Array.from(container.querySelectorAll('.badge'));
    expect(badges.some((b) => b.textContent === 'Approved')).toBe(true);
    expect(badges.some((b) => b.textContent === 'Vetted')).toBe(false);
    expect(badges.some((b) => b.textContent === 'Unassessed')).toBe(false);
  });

  // ── The stages, the same groups as the morning email ──
  describe('stages', () => {
    const counts = { needs_zip: 1, analyzing: 1, vetted: 1, needs_read: 1, approved: 1, flagged: 0, below_bar: 3 };
    const star: GovOpportunity = { ...candidate, uuid: 's1', title: 'Star Bid', boardStage: 'vetted', priorityScore: 10, aiVetting: { status: 'completed', verdict: 'pursue', reason: 'A strong match for our work.', coveragePct: 80 } };
    const zip: GovOpportunity = { ...candidate, uuid: 'z1', title: 'Zip Bid', boardStage: 'needs_zip', priorityScore: 99 };
    const read: GovOpportunity = { ...candidate, uuid: 'r1', title: 'Read Bid', boardStage: 'needs_read', aiVetting: { status: 'completed', verdict: 'inconclusive', reason: 'The AI could not call this one.', coveragePct: null } };
    const ok: GovOpportunity = { ...candidate, uuid: 'a1', title: 'Approved Bid', boardStage: 'approved' };
    const busy: GovOpportunity = { ...candidate, uuid: 'b1', title: 'Busy Bid', boardStage: 'analyzing' };
    const staged = { opportunities: [zip, star, read, ok, busy], source: 'live', snapshotDate: null, snapshotReason: null, totalAvailable: 50, boardCounts: counts };

    it('stars a vetted row and shows the AI reason', async () => {
      (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue(staged);
      await renderPage();
      const badges = Array.from(container.querySelectorAll('.badge')).map((b) => b.textContent);
      expect(badges).toContain('\u2B50 AI vetted');
      expect(badges).toContain('Awaiting ZIP');
      expect(badges).toContain('Needs your read');
      expect(badges).toContain('AI analyzing');
      expect(container.textContent ?? '').toContain('A strong match for our work.');
    });

    it('chip counts come from the server, and a chip filters to its stage and toggles off', async () => {
      (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue(staged);
      await renderPage();
      const chip = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('\u2B50 Vetted 1'));
      expect(chip).toBeDefined();
      await clickEl(chip!);
      expect(container.textContent ?? '').toContain('Star Bid');
      expect(container.textContent ?? '').not.toContain('Zip Bid');
      await clickEl(chip!);
      expect(container.textContent ?? '').toContain('Zip Bid');
    });

    it('the default order puts work needing a person first, even over a higher priority', async () => {
      (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue(staged);
      await renderPage();
      const text = container.textContent ?? '';
      expect(text.indexOf('Star Bid')).toBeLessThan(text.indexOf('Zip Bid'));
      expect(text.indexOf('Read Bid')).toBeLessThan(text.indexOf('Zip Bid'));
    });

    it('the main button says what the stage calls for', async () => {
      (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue(staged);
      await renderPage();
      const words = Array.from(container.querySelectorAll('button.btn-danger')).map((b) => b.textContent?.trim());
      expect(words).toEqual(expect.arrayContaining(['Upload ZIP', 'Read', 'Build & assign', 'Open']));
    });

    it('marks a bid shown from saved details after it left the feed', async () => {
      (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue({ ...staged, opportunities: [{ ...star, fromSnapshot: true }] });
      await renderPage();
      expect(container.textContent ?? '').toContain('Left the feed');
    });

    it('says how many were assigned and where they went', async () => {
      (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue({ ...staged, assignedCount: 2 });
      await renderPage();
      expect(container.textContent ?? '').toMatch(/2\s*assigned to interns \(see Interns > Gov Contracts\)/);
    });

    it('a stage of flagged goes to the flagged section, never the candidates table', async () => {
      const flaggedRow: GovOpportunity = { ...candidate, uuid: 'f1', title: 'Flag Bid', boardStage: 'flagged', vetVerdict: { status: 'no_bid', reason: 'No' } };
      (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue({ ...staged, opportunities: [zip, flaggedRow] });
      await renderPage();
      expect(container.querySelector('tbody')?.textContent).not.toContain('Flag Bid');
      expect(container.textContent ?? '').toContain('Flag Bid');
    });

    it('renders AI text as text, never as markup', async () => {
      const evil: GovOpportunity = { ...star, aiVetting: { status: 'completed', verdict: 'pursue', reason: '<img src=x onerror=alert(1)>', coveragePct: 80 } };
      (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue({ ...staged, opportunities: [evil] });
      await renderPage();
      expect(container.querySelector('img')).toBeNull();
      expect(container.textContent ?? '').toContain('<img src=x');
    });

    it('with no stages from the server, the page still works and shows no chips', async () => {
      (factoryApi.listGovOpportunities as jest.Mock).mockResolvedValue(liveFeed);
      await renderPage();
      expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent?.includes('Awaiting ZIP'))).toBe(false);
      expect(container.textContent ?? '').toContain('Digital Evidence Platform');
    });
  });
});
