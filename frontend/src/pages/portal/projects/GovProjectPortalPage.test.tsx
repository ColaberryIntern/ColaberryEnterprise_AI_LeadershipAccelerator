import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import GovProjectPortalPage from './GovProjectPortalPage';
import * as api from '../../../services/govProjectPortalApi';

jest.mock('../../../services/govProjectPortalApi');

/**
 * GovProjectPortalPage is the STUDENT entry to a gov project. It owns the load state machine
 * (loading / ready / not_found / error) and hands the one student-safe projection to the Proposal Studio shell.
 * These tests cover that contract: the shell renders from the projection, the process rail navigates between the
 * studio views, and the student projection never carries pricing or reviewer-only gate controls (the portal passes
 * no review API). The studio's own component behaviors are tested beside those components.
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
  (api.portalGovStudioApi.listQuestions as jest.Mock).mockResolvedValue([]);
  (api.portalGovStudioApi.listActivity as jest.Mock).mockResolvedValue([]);
  // The studio offers its guided tour once per browser; pre-seed "seen" so it doesn't auto-open during these tests.
  try { window.localStorage.setItem('gps-tour-seen', '1'); } catch { /* jsdom always has storage */ }
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const step = (v: string): HTMLButtonElement => container.querySelector(`.gps-step[data-v="${v}"]`) as HTMLButtonElement;
const click = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); }); };

describe('GovProjectPortalPage — Proposal Studio shell', () => {
  it('renders the contract bar and the process rail from the student projection, Overview by default', async () => {
    (api.getStudentGovProject as jest.Mock).mockResolvedValue(baseView());
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
    (api.getStudentGovProject as jest.Mock).mockResolvedValue(baseView());
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

  it('the student projection leaks no pricing and no reviewer gate controls', async () => {
    (api.getStudentGovProject as jest.Mock).mockResolvedValue(baseView());
    await render();
    // Review gates: no reviewApi → no reviewer gate-control panel
    await click(step('gates'));
    expect(container.querySelector('#gps-main')?.textContent ?? '').not.toContain('Reviewer gate controls');
    // Package: portal has no review API → the reviewer-assembles button, no sealed-price envelope
    await click(step('package'));
    const pkg = container.querySelector('#gps-main')?.textContent ?? '';
    expect(pkg).toContain('Package');
    expect(pkg).not.toContain('Sealed');
    expect(pkg).not.toContain('admin only');
    const exportBtn = Array.from(container.querySelectorAll('#gps-main button')).find((b) => /assemble|export/i.test(b.textContent ?? '')) as HTMLButtonElement;
    expect(exportBtn?.disabled).toBe(true);
  });

  it('shows "not found" on a 404 and an error state on a non-404', async () => {
    (api.getStudentGovProject as jest.Mock).mockRejectedValue({ response: { status: 404 } });
    await render('dp-OTHER');
    expect(container.querySelector('[data-testid="gov-project-not-found"]')).toBeTruthy();
    act(() => root.unmount()); container.remove();
    (api.getStudentGovProject as jest.Mock).mockRejectedValue({ response: { status: 500 } });
    await render();
    expect(container.querySelector('[data-testid="gov-project-error"]')).toBeTruthy();
  });
});
