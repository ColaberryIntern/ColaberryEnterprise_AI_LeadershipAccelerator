import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import GovProjectPortalPage from './GovProjectPortalPage';
import * as api from '../../../services/govProjectPortalApi';

jest.mock('../../../services/govProjectPortalApi');

const baseView = (over: any = {}): any => ({
  projectId: 'dp-A', name: 'TxDOT Claims Search', status: 'discovery',
  tracks: [], requirements: [], requirementCounts: { total: 0, proposal: 0, build: 0 },
  build: { buildStoryCount: 0, releases: [], stories: [], orphanedStories: [] },
  viewerCanVerify: false, agency: 'TxDOT OGC', keyDates: [{ date: '2026-11-06', text: 'Proposals due' }], commitFeed: [],
  buildSummary: { studentProjectId: 'sp-1', releases: [{ key: 'r0', name: 'Release 0', status: 'in_progress', stories: [{ storyId: 'STORY-001', title: 'Case dashboard', releaseKey: 'r0', status: 'in_progress', verified: false }] }], rollup: { total: 1, verified: 0, complete: 0, inProgress: 1, blocked: 0, notStarted: 0, pct: 0 } },
  proposalDocuments: [{ key: 'technical', title: 'Technical Proposal', status: 'not_started', contentHtml: null, version: 0, gate: false, order: 11, requirementIds: ['R1'], comments: [], draftedAt: null, acceptedAt: null }],
  overallProgress: { buildVerified: 0, buildTotal: 1, docsAccepted: 0, docsTotal: 1, pct: 0 },
  ...over,
});

let container: HTMLDivElement; let root: Root;
async function render(projectId = 'dp-A') {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await act(async () => { root.render(<MemoryRouter initialEntries={[`/portal/gov-projects/${projectId}`]}><Routes><Route path="/portal/gov-projects/:projectId" element={<GovProjectPortalPage />} /></Routes></MemoryRouter>); });
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
}
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const tab = (name: string): HTMLButtonElement => Array.from(container.querySelectorAll('.gck-tab')).find((b) => b.textContent?.includes(name)) as HTMLButtonElement;
const click = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); }); };
const btn = (text: string, scope: ParentNode = container): HTMLButtonElement => Array.from(scope.querySelectorAll('button')).find((b) => b.textContent?.includes(text)) as HTMLButtonElement;

describe('GovProjectPortalPage v2 — Build + Proposal cockpit', () => {
  it('renders the bar (name, agency), the overall % and the Build tab (releases → stories + deep-link)', async () => {
    (api.getStudentGovProject as jest.Mock).mockResolvedValue(baseView());
    await render();
    const text = container.textContent ?? '';
    expect(text).toContain('TxDOT Claims Search');
    expect(text).toContain('TxDOT OGC');
    expect(text).toContain('Overall completion');
    // Overview is the default tab now; open Build to see releases -> stories + the deep-link
    await click(tab('Build'));
    const buildText = container.textContent ?? '';
    expect(buildText).toContain('STORY-001');
    expect(buildText).toContain('Case dashboard');
    const link = Array.from(container.querySelectorAll('a')).find((a) => a.textContent?.includes('build workspace')) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/portal/projects');
  });

  it('Proposal tab: a document card opens the drawer, and Draft with AI calls the API', async () => {
    (api.getStudentGovProject as jest.Mock).mockResolvedValue(baseView());
    (api.draftGovProposalDocument as jest.Mock).mockResolvedValue({ key: 'technical', status: 'drafted' });
    await render();
    await click(tab('Proposal'));
    const card = Array.from(container.querySelectorAll('.gck-tcard')).find((c) => c.textContent?.includes('Technical Proposal')) as HTMLButtonElement;
    expect(card).toBeTruthy();
    await click(card);
    const drawer = container.querySelector('.gck-drawer')!;
    expect(drawer).toBeTruthy();
    expect(drawer.textContent).toContain('Not drafted yet');
    await click(btn('Draft with AI', drawer));
    expect(api.draftGovProposalDocument).toHaveBeenCalledWith('dp-A', 'technical');
  });

  it('a reviewer sees Accept on a drafted document and it calls the API; a student does not', async () => {
    const drafted = { key: 'technical', title: 'Technical Proposal', status: 'drafted', contentHtml: '<p>Our approach.</p>', version: 1, gate: false, order: 11, requirementIds: ['R1'], comments: [], draftedAt: '2026-10-20', acceptedAt: null };
    // student: no Accept
    (api.getStudentGovProject as jest.Mock).mockResolvedValue(baseView({ viewerCanVerify: false, proposalDocuments: [drafted] }));
    await render();
    await click(tab('Proposal'));
    await click(Array.from(container.querySelectorAll('.gck-tcard')).find((c) => c.textContent?.includes('Technical Proposal'))!);
    expect(Array.from(container.querySelectorAll('.gck-drawer button')).some((b) => b.textContent === 'Accept')).toBe(false);
    expect(container.querySelector('.gck-doc-preview')?.innerHTML).toContain('Our approach.'); // the sanitized preview renders
    act(() => root.unmount()); container.remove();
    // reviewer: Accept present + calls API
    (api.getStudentGovProject as jest.Mock).mockResolvedValue(baseView({ viewerCanVerify: true, proposalDocuments: [drafted] }));
    (api.acceptGovProposalDocument as jest.Mock).mockResolvedValue({ ...drafted, status: 'accepted' });
    await render();
    await click(tab('Proposal'));
    await click(Array.from(container.querySelectorAll('.gck-tcard')).find((c) => c.textContent?.includes('Technical Proposal'))!);
    const acceptBtn = Array.from(container.querySelectorAll('.gck-drawer button')).find((b) => b.textContent === 'Accept') as HTMLButtonElement;
    expect(acceptBtn).toBeTruthy();
    await click(acceptBtn);
    expect(api.acceptGovProposalDocument).toHaveBeenCalledWith('dp-A', 'technical');
  });

  it('shows "not found" on a 404 and an error state on a non-404', async () => {
    (api.getStudentGovProject as jest.Mock).mockRejectedValue({ response: { status: 404 } });
    await render('dp-OTHER');
    expect(container.textContent ?? '').toContain('Project not found');
    act(() => root.unmount()); container.remove();
    (api.getStudentGovProject as jest.Mock).mockRejectedValue({ response: { status: 500 } });
    await render();
    expect(container.querySelector('[data-testid="gov-project-error"]')).toBeTruthy();
  });
});

describe('GovProjectPortalPage: Overview tab (read-only project brief)', () => {
  const withOverview = (over: any = {}): any => baseView({
    requirements: [
      { canonicalReqId: 'R1', statement: 'Vendor shall provide a claims search portal.', priority: 'high', tracks: ['proposal', 'build'], evidenceState: 'open' },
      { canonicalReqId: 'R2', statement: 'System shall support single sign-on.', priority: 'medium', tracks: ['build'], evidenceState: 'satisfied' },
    ],
    requirementCounts: { total: 2, proposal: 1, build: 2 },
    submissionChecklist: {
      items: [
        { requirementId: 'R1', statement: 'Technical approach narrative', status: 'drafting', approved: false, openGapCount: 2 },
        { requirementId: 'R2', statement: 'SSO design note', status: 'approved', approved: true, openGapCount: 0 },
      ],
      counts: { total: 2, approved: 1, remaining: 1 }, ready: false,
    },
    ...over,
  });

  it('is the default tab and renders the solicitation, the established requirements and the price-free readiness', async () => {
    (api.getStudentGovProject as jest.Mock).mockResolvedValue(withOverview());
    await render();
    expect(tab('Overview').getAttribute('aria-selected')).toBe('true');
    const overview = container.querySelector('.gck-overview');
    expect(overview).toBeTruthy();
    const text = overview!.textContent ?? '';
    // solicitation facts + the detected key-date line (the bar shows the date; the text line is unique to Overview)
    expect(text).toContain('TxDOT OGC');
    expect(text).toContain('Proposals due');
    // established requirements (the compliance matrix) + the counts split
    expect(text).toContain('Vendor shall provide a claims search portal.');
    expect(text).toContain('System shall support single sign-on.');
    expect(text).toContain('2 total');
    expect(text).toContain('1 proposal');
    // price-free submission readiness
    expect(text).toContain('Technical approach narrative');
    expect(text).toContain('1/2 approved');
  });

  it('is strictly read-only: the Overview surface has no inputs, editors or buttons', async () => {
    (api.getStudentGovProject as jest.Mock).mockResolvedValue(withOverview());
    await render();
    const overview = container.querySelector('.gck-overview')!;
    expect(overview.querySelectorAll('input, textarea, select, [contenteditable="true"]').length).toBe(0);
    expect(overview.querySelectorAll('button').length).toBe(0);
  });
});
