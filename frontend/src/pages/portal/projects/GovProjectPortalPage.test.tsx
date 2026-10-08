import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import GovProjectPortalPage from './GovProjectPortalPage';
import * as api from '../../../services/govProjectPortalApi';

jest.mock('../../../services/govProjectPortalApi');

const VIEW = {
  projectId: 'dp-A', name: 'TxDOT Claims Search', status: 'discovery',
  tracks: [
    { trackType: 'proposal', status: 'unassessed', hasBuild: false },
    { trackType: 'solution_build', status: 'in_progress', hasBuild: true },
  ],
  requirements: [{ canonicalReqId: 'REQ-1', statement: 'Provide a claims search database', priority: 'must', tracks: ['proposal', 'solution_build'], evidenceState: 'unassessed' }],
  requirementCounts: { total: 1, proposal: 1, build: 1 },
  build: {
    buildStoryCount: 1,
    releases: [{ key: 'r0', name: 'Release 0 — initial build', storyIds: ['STORY-REQ-1'] }],
    stories: [{
      id: 'STORY-REQ-1', requirementId: 'REQ-1', title: 'Provide a claims search database', release: 'r0', status: 'unassigned',
      statement: 'Provide a claims search database', acceptance: ['The solution demonstrably satisfies: Provide a claims search database'],
      prompt: '# STORY-REQ-1\nProvide a claims search database\ntraced back to REQ-1',
      evidence: [],
    }],
  },
  viewerCanVerify: false,
};

let container: HTMLDivElement; let root: Root;
async function render(projectId = 'dp-A') {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/portal/gov-projects/${projectId}`]}>
        <Routes><Route path="/portal/gov-projects/:projectId" element={<GovProjectPortalPage />} /></Routes>
      </MemoryRouter>,
    );
  });
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
}
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

describe('GovProjectPortalPage (student restricted view)', () => {
  it('renders the assigned project: name, both tracks, build-linked indicator, requirements', async () => {
    (api.getStudentGovProject as jest.Mock).mockResolvedValue(VIEW);
    await render();
    const text = container.textContent ?? '';
    expect(text).toContain('TxDOT Claims Search');
    expect(text).toContain('Proposal track');
    expect(text).toContain('Build track');
    expect(text).toContain('Build project linked');
    expect(text).toContain('Provide a claims search database');
    expect(api.getStudentGovProject).toHaveBeenCalledWith('dp-A');
  });

  it('P3-T3: shows the build story and reveals its prompt on demand (the student works a real generated prompt)', async () => {
    (api.getStudentGovProject as jest.Mock).mockResolvedValue(VIEW);
    await render();
    expect(container.textContent ?? '').toContain('Build stories');
    expect(container.textContent ?? '').toContain('STORY-REQ-1');
    expect(container.textContent ?? '').not.toContain('traced back to REQ-1'); // prompt hidden until opened
    const btn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Open the build prompt')) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    await act(async () => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    expect(container.textContent ?? '').toContain('traced back to REQ-1'); // revealed on click
  });

  it('P3-T3 evidence hand-in: a student submits evidence for a story (recorded; reviewer verifies, not self)', async () => {
    (api.getStudentGovProject as jest.Mock).mockResolvedValue(VIEW);
    (api.submitBuildStoryEvidence as jest.Mock).mockResolvedValue({ id: 'ev-1', storyId: 'STORY-REQ-1', canonicalReqId: 'REQ-1', description: 'built it', artifactRef: null, status: 'submitted', submittedAt: null });
    await render();
    expect(container.textContent ?? '').toContain('a reviewer verifies it'); // honest about who verifies
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
    await act(async () => { setValue.call(textarea, 'Built the search database; screenshot attached.'); textarea.dispatchEvent(new Event('input', { bubbles: true })); await Promise.resolve(); });
    const submitBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Submit evidence')) as HTMLButtonElement;
    await act(async () => { submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    expect(api.submitBuildStoryEvidence).toHaveBeenCalledWith('dp-A', 'STORY-REQ-1', expect.objectContaining({ canonicalReqId: 'REQ-1', description: 'Built the search database; screenshot attached.' }));
  });

  it('P3-T3 verify UI: a reviewer (viewerCanVerify) sees Verify/Reject on a submitted hand-in and a student does NOT', async () => {
    const withEvidence = (canVerify: boolean) => ({
      ...VIEW, viewerCanVerify: canVerify,
      build: { ...VIEW.build, stories: [{ ...VIEW.build.stories[0], evidence: [{ id: 'ev-1', storyId: 'STORY-REQ-1', canonicalReqId: 'REQ-1', description: 'built it', artifactRef: null, status: 'submitted', submittedAt: null }] }] },
    });
    // student: no verify control, and the hand-in form IS shown
    (api.getStudentGovProject as jest.Mock).mockResolvedValue(withEvidence(false));
    await render();
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent === 'Verify')).toBe(false);
    expect(container.textContent ?? '').toContain('a reviewer verifies it'); // the student sees the hand-in form
    act(() => root.unmount()); container.remove();
    // reviewer: Verify/Reject controls appear, the hand-in form does NOT, and clicking Verify calls the API
    (api.getStudentGovProject as jest.Mock).mockResolvedValue(withEvidence(true));
    (api.verifyBuildStoryEvidence as jest.Mock).mockResolvedValue({ id: 'ev-1', storyId: 'STORY-REQ-1', canonicalReqId: 'REQ-1', description: 'built it', artifactRef: null, status: 'verified', submittedAt: null });
    await render();
    expect(container.textContent ?? '').not.toContain('a reviewer verifies it'); // the reviewer does not get the hand-in form
    const verifyBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Verify') as HTMLButtonElement;
    expect(verifyBtn).toBeTruthy();
    await act(async () => { verifyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); await Promise.resolve(); });
    expect(api.verifyBuildStoryEvidence).toHaveBeenCalledWith('dp-A', 'ev-1', 'verified');
  });

  it('shows a "not found" page on a 404 (unassigned project) — never leaks that it exists', async () => {
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
