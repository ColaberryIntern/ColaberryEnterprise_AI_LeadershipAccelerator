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
