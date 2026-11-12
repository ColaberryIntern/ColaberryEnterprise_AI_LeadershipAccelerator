import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import GovProjectPortalPage from './GovProjectPortalPage';
import * as api from '../../../services/govProjectPortalApi';

jest.mock('../../../services/govProjectPortalApi');

/**
 * GovProjectPortalPage is the intern entry to a gov project. It owns the load state machine
 * (loading / ready / not_found / error) and mounts the SAME Proposal Studio cockpit the admin sees, READ-ONLY, fed by
 * the parity projection (getPortalGovCockpitFull) + the read-only reviewApi. These tests cover that contract: the
 * shell renders from the projection, the process rail navigates between the studio views, every panel the admin sees
 * renders but inside a disabled fieldset (read-only), and no dollar amount appears (stripped server-side). The
 * studio's own component behaviors are tested beside those components.
 */
const techDoc = {
  key: 'technical', title: 'Technical Proposal', status: 'drafted', docType: 'derived', contentHtml: '<p>Our approach.</p>',
  version: 1, gate: false, order: 11, requirementIds: ['R1'], comments: [], draftedAt: '2026-10-20', acceptedAt: null,
  latest: { versionId: 'v1', version: 1, scores: { coverage: 80, evaluator: 70, proof: 60, fact: 90, format: 95, clarity: 85 }, passes: false, pageCount: 3, createdAt: '2026-10-20' },
  currentGate: 'pink', openGapCount: 1, fatalCount: 0, superseded: false,
};
const baseView = (over: any = {}): any => ({
  projectId: 'dp-A', name: 'TxDOT Claims Search', status: 'proposal',
  tracks: [], requirements: [], requirementCounts: { total: 2, proposal: 1, build: 2 },
  build: { buildStoryCount: 0, releases: [], stories: [], orphanedStories: [] },
  viewerCanVerify: false, agency: 'TxDOT OGC', keyDates: [{ date: '2026-11-06', text: 'Proposals due' }], commitFeed: [],
  buildSummary: { studentProjectId: 'sp-1', releases: [], rollup: { total: 1, verified: 1, complete: 1, inProgress: 0, blocked: 0, notStarted: 0, pct: 100 } },
  buildArtifacts: [],
  proposalReadiness: { pct: 40, passing: 0, total: 1 },
  proposalDocuments: [techDoc],
  overallProgress: { buildVerified: 1, buildTotal: 1, docsAccepted: 0, docsTotal: 1, pct: 40 },
  ...over,
});

let container: HTMLDivElement; let root: Root;
async function render(projectId = 'dp-A') {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await act(async () => { root.render(<MemoryRouter initialEntries={[`/portal/gov-projects/${projectId}`]}><Routes><Route path="/portal/gov-projects/:projectId" element={<GovProjectPortalPage />} /></Routes></MemoryRouter>); });
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
}
beforeEach(() => {
  // The persistent agent panel (and Open items) read these on mount; without a promise they throw.
  // v4: the panel's top-needs cards read listNeeds (grouped), replacing the old listQuestions read.
  (api.portalGovStudioApi.listNeeds as jest.Mock).mockResolvedValue({ needs: [] });
  (api.portalGovStudioApi.listQuestions as jest.Mock).mockResolvedValue([]);
  (api.portalGovStudioApi.listActivity as jest.Mock).mockResolvedValue([]);
  // The page now mounts the cockpit read-only with the read-only reviewApi, so the reviewer/package panels read these.
  (api.portalGovReviewApiReadOnly.listReview as jest.Mock).mockResolvedValue({ versions: [], gates: [] });
  (api.portalGovReviewApiReadOnly.listSignatures as jest.Mock).mockResolvedValue({ signatures: [] });
  (api.portalGovReviewApiReadOnly.diffVersions as jest.Mock).mockResolvedValue({ segments: [] });
  // The studio offers its guided tour once per browser; pre-seed "seen" so it doesn't auto-open during these tests.
  try { window.localStorage.setItem('gps-tour-seen', '1'); } catch { /* jsdom always has storage */ }
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const step = (v: string): HTMLButtonElement => container.querySelector(`.gps-step[data-v="${v}"]`) as HTMLButtonElement;
const click = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); }); };

describe('GovProjectPortalPage — Proposal Studio shell', () => {
  it('renders the contract bar and the process rail from the student projection, Overview by default', async () => {
    (api.getPortalGovCockpitFull as jest.Mock).mockResolvedValue(baseView());
    await render();
    const text = container.textContent ?? '';
    expect(text).toContain('TxDOT Claims Search');
    expect(text).toContain('TxDOT OGC');
    expect(text).toContain('Proposal Studio');
    // the process rail carries each studio stage
    for (const v of ['overview', 'blueprint', 'documents', 'evidence', 'editor', 'gates', 'package', 'openitems']) {
      expect(step(v)).toBeTruthy();
    }
    // Overview (Where we are) is the default center view
    expect(container.querySelector('.gps-view')?.textContent).toContain('Where we are');
    expect(text).toContain('Proposal readiness');
  });

  it('navigates the rail: Document set shows the deliverables table, Review gates shows the check matrix', async () => {
    (api.getPortalGovCockpitFull as jest.Mock).mockResolvedValue(baseView());
    await render();
    await click(step('documents'));
    let center = container.querySelector('#gps-main')?.textContent ?? '';
    expect(center).toContain('Document set');
    expect(center).toContain('Technical Proposal');
    await click(step('gates'));
    center = container.querySelector('#gps-main')?.textContent ?? '';
    expect(center).toContain('Review gates');
    expect(center).toContain('Pink team');
    expect(center).toContain('Technical Proposal'); // the matrix row
  });

  it('read-only parity: the intern mounts the cockpit READ-ONLY (center wrapped in a disabled fieldset) with NO dollar amount anywhere', async () => {
    (api.getPortalGovCockpitFull as jest.Mock).mockResolvedValue(baseView({ viewerCanVerify: true }));
    await render();
    // the whole center is wrapped in a disabled <fieldset> — the one-point disable for every panel's controls
    expect((container.querySelector('#gps-main fieldset') as HTMLFieldSetElement | null)?.disabled).toBe(true);
    // the reviewer gate panel renders now that a (read-only) reviewApi is injected — same panel the admin sees
    await click(step('gates'));
    let center = container.querySelector('#gps-main')?.textContent ?? '';
    expect(center).toContain('Review gates');
    expect((container.querySelector('#gps-main fieldset') as HTMLFieldSetElement | null)?.disabled).toBe(true);
    // the package panel renders too; still no dollar amount on the cockpit body (the $ carrier is stripped server-side)
    await click(step('package'));
    center = container.querySelector('#gps-main')?.textContent ?? '';
    expect(center).toContain('Package');
    expect(center).not.toMatch(/\$\s?\d/);
  });

  it('shows "not found" on a 404 and an error state on a non-404', async () => {
    (api.getPortalGovCockpitFull as jest.Mock).mockRejectedValue({ response: { status: 404 } });
    await render('dp-OTHER');
    expect(container.querySelector('[data-testid="gov-project-not-found"]')).toBeTruthy();
    act(() => root.unmount()); container.remove();
    (api.getPortalGovCockpitFull as jest.Mock).mockRejectedValue({ response: { status: 500 } });
    await render();
    expect(container.querySelector('[data-testid="gov-project-error"]')).toBeTruthy();
  });
});
