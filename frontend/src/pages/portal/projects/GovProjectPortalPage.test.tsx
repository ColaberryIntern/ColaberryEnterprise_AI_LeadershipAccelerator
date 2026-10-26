import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import GovProjectPortalPage from './GovProjectPortalPage';
import * as api from '../../../services/govProjectPortalApi';

jest.mock('../../../services/govProjectPortalApi');

const BUILD_STORY = {
  id: 'STORY-REQ-1', requirementId: 'REQ-1', title: 'Provide a claims search database', release: 'r0',
  status: 'assigned', statement: 'Provide a claims search database',
  acceptance: ['The solution demonstrably satisfies: Provide a claims search database'],
  prompt: '# STORY-REQ-1\nProvide a claims search database\ntraced back to REQ-1',
  evidence: [], stage: 'build', owner: 'ai', mine: true, commit: null,
};
const VIEW: any = {
  projectId: 'dp-A', name: 'TxDOT Claims Search', status: 'discovery',
  tracks: [{ trackType: 'proposal', status: 'unassessed', hasBuild: false }, { trackType: 'solution_build', status: 'in_progress', hasBuild: true }],
  requirements: [{ canonicalReqId: 'REQ-1', statement: 'Provide a claims search database', priority: 'must', tracks: ['proposal', 'solution_build'], evidenceState: 'unassessed' }],
  requirementCounts: { total: 1, proposal: 1, build: 1 },
  build: { buildStoryCount: 1, releases: [{ key: 'r0', name: 'Release 0', storyIds: ['STORY-REQ-1'] }], stories: [BUILD_STORY], orphanedStories: [] },
  viewerCanVerify: false, agency: 'TxDOT OGC', keyDates: [{ date: '2026-11-06', text: 'Proposals due' }], commitFeed: [],
};

let container: HTMLDivElement; let root: Root;
async function render(projectId = 'dp-A') {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[`/portal/gov-projects/${projectId}`]}><Routes><Route path="/portal/gov-projects/:projectId" element={<GovProjectPortalPage />} /></Routes></MemoryRouter>);
  });
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
}
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const card = (key: string, track = 'Build'): HTMLButtonElement =>
  Array.from(container.querySelectorAll('.gck-tcard')).find((c) => (c.textContent ?? '').includes(key) && (c.textContent ?? '').includes(track)) as HTMLButtonElement;
const clickCard = async (key: string, track?: string) => { const c = card(key, track); await act(async () => { c.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); }); };
const btnIncluding = (text: string): HTMLButtonElement => Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(text)) as HTMLButtonElement;
const setTextarea = async (el: HTMLTextAreaElement, value: string) => {
  const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
  await act(async () => { set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); await Promise.resolve(); });
};

describe('GovProjectPortalPage — Build Cockpit', () => {
  it('renders the project bar (name, agency), the board and a build task card', async () => {
    (api.getStudentGovProject as jest.Mock).mockResolvedValue(VIEW);
    await render();
    const text = container.textContent ?? '';
    expect(text).toContain('TxDOT Claims Search');
    expect(text).toContain('TxDOT OGC');          // agency chip
    expect(text).toContain('Task board');
    expect(card('REQ-1')).toBeTruthy();
    expect(api.getStudentGovProject).toHaveBeenCalledWith('dp-A');
  });

  it('opening a build task reveals its Claude Code prompt in the drawer', async () => {
    (api.getStudentGovProject as jest.Mock).mockResolvedValue(VIEW);
    await render();
    expect(container.textContent ?? '').not.toContain('traced back to REQ-1'); // not shown until the card is opened
    await clickCard('REQ-1');
    expect(container.querySelector('.gck-drawer')).toBeTruthy();
    expect(container.querySelector('.gck-prompt')?.textContent ?? '').toContain('traced back to REQ-1');
  });

  it('evidence hand-in: a student submits from the drawer (recorded; a reviewer verifies, not self)', async () => {
    (api.getStudentGovProject as jest.Mock).mockResolvedValue(VIEW);
    (api.submitBuildStoryEvidence as jest.Mock).mockResolvedValue({ id: 'ev-1', status: 'submitted' });
    await render();
    await clickCard('REQ-1');
    expect(container.querySelector('.gck-drawer')?.textContent ?? '').toContain('A reviewer verifies it');
    await setTextarea(container.querySelector('.gck-drawer textarea') as HTMLTextAreaElement, 'Built the search database; screenshot attached.');
    await act(async () => { btnIncluding('Submit evidence').dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    expect(api.submitBuildStoryEvidence).toHaveBeenCalledWith('dp-A', 'STORY-REQ-1', expect.objectContaining({ canonicalReqId: 'REQ-1', description: 'Built the search database; screenshot attached.' }));
  });

  it('verify UI: a reviewer sees Verify in the drawer (and no hand-in form); a student sees the hand-in form (and no Verify)', async () => {
    const withEvidence = (canVerify: boolean) => ({ ...VIEW, viewerCanVerify: canVerify, build: { ...VIEW.build, stories: [{ ...BUILD_STORY, stage: 'matched', evidence: [{ id: 'ev-1', storyId: 'STORY-REQ-1', canonicalReqId: 'REQ-1', description: 'built it', artifactRef: null, status: 'submitted', submittedAt: null }] }] } });
    // student
    (api.getStudentGovProject as jest.Mock).mockResolvedValue(withEvidence(false));
    await render();
    await clickCard('REQ-1');
    expect(Array.from(container.querySelectorAll('.gck-drawer button')).some((b) => b.textContent === 'Verify')).toBe(false);
    expect(container.querySelector('.gck-drawer')?.textContent ?? '').toContain('A reviewer verifies it');
    act(() => root.unmount()); container.remove();
    // reviewer
    (api.getStudentGovProject as jest.Mock).mockResolvedValue(withEvidence(true));
    (api.verifyBuildStoryEvidence as jest.Mock).mockResolvedValue({ id: 'ev-1', status: 'verified' });
    await render();
    await clickCard('REQ-1');
    expect(container.querySelector('.gck-drawer')?.textContent ?? '').not.toContain('A reviewer verifies it'); // reviewer gets no hand-in form
    const verifyBtn = Array.from(container.querySelectorAll('.gck-drawer button')).find((b) => b.textContent === 'Verify') as HTMLButtonElement;
    expect(verifyBtn).toBeTruthy();
    await act(async () => { verifyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    expect(api.verifyBuildStoryEvidence).toHaveBeenCalledWith('dp-A', 'ev-1', 'verified');
  });

  it('surfaces PRESERVED (orphaned) work as a flagged card whose evidence is kept', async () => {
    (api.getStudentGovProject as jest.Mock).mockResolvedValue({ ...VIEW, build: { ...VIEW.build, orphanedStories: [{ id: 'STORY-OLD', requirementId: 'OLD', title: 'old story', statement: 'old work', release: 'orphaned', acceptance: [], status: 'assigned', orphaned: true, prompt: 'x', stage: 'matched', owner: 'ai', mine: false, commit: null, evidence: [{ id: 'ev-9', storyId: 'STORY-OLD', canonicalReqId: 'OLD', description: 'my submitted build', artifactRef: null, status: 'submitted', submittedAt: null }] }] } });
    await render();
    const c = card('OLD');
    expect(c).toBeTruthy();
    expect(c.textContent ?? '').toContain('preserved');
    await clickCard('OLD');
    expect(container.querySelector('.gck-drawer')?.textContent ?? '').toContain('my submitted build');
  });

  it('proposal (comment level): the proposal card opens read-only with the gap question', async () => {
    (api.getStudentGovProject as jest.Mock).mockResolvedValue({
      ...VIEW,
      proposal: { level: 'comment', canComment: true, canEdit: false, responses: [{ requirementId: 'PRP-1', statement: 'Security approach', status: 'draft', content: 'We will build the search index.', openGapCount: 1, gaps: [{ id: 'g1', question: 'Which system must it integrate with?', suggestions: [], resolution: 'open' }] }] },
      submissionChecklist: { items: [{ requirementId: 'PRP-1', statement: 'Security approach', status: 'draft', approved: false, openGapCount: 1, stage: 'build', owner: 'human', mine: false }], counts: { total: 1, approved: 0, remaining: 1 }, ready: false },
    });
    await render();
    await clickCard('PRP-1', 'Proposal');
    const drawer = container.querySelector('.gck-drawer')?.textContent ?? '';
    expect(drawer).toContain('We will build the search index.');
    expect(drawer).toContain('Which system must it integrate with?');
  });

  it('proposal (edit level): the drawer offers a draft editor, and Save draft calls the API', async () => {
    (api.getStudentGovProject as jest.Mock).mockResolvedValue({
      ...VIEW,
      proposal: { level: 'edit', canComment: true, canEdit: true, responses: [{ requirementId: 'PRP-1', statement: 'Security approach', status: 'unanswered', content: '', openGapCount: 0 }] },
      submissionChecklist: { items: [{ requirementId: 'PRP-1', statement: 'Security approach', status: 'unanswered', approved: false, openGapCount: 0, stage: 'todo', owner: 'human', mine: true }], counts: { total: 1, approved: 0, remaining: 1 }, ready: false },
    });
    (api.saveGovProposalResponse as jest.Mock).mockResolvedValue(undefined);
    await render();
    await clickCard('PRP-1', 'Proposal');
    await act(async () => { btnIncluding('Draft response').dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    await setTextarea(container.querySelector('.gck-drawer textarea') as HTMLTextAreaElement, 'We will deliver a claims search database.');
    await act(async () => { btnIncluding('Save draft').dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    expect(api.saveGovProposalResponse).toHaveBeenCalledWith('dp-A', 'PRP-1', 'We will deliver a claims search database.');
  });

  it('shows a "not found" page on a 404 — never leaks that it exists', async () => {
    (api.getStudentGovProject as jest.Mock).mockRejectedValue({ response: { status: 404 } });
    await render('dp-OTHER');
    expect(container.textContent ?? '').toContain('Project not found');
    expect(container.querySelector('[data-testid="gov-project-view"]')).toBeNull();
  });

  it('shows an error state (with retry) on a non-404 failure', async () => {
    (api.getStudentGovProject as jest.Mock).mockRejectedValue({ response: { status: 500 } });
    await render();
    expect(container.querySelector('[data-testid="gov-project-error"]')).toBeTruthy();
  });
});
