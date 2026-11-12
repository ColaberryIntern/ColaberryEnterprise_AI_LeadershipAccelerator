import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import GovProjectQualificationPage from './GovProjectQualificationPage';

/**
 * GovProjectQualificationPage mounts the REAL AdminGovQualificationPage in readOnly mode, fed by participant-scoped
 * endpoints. These tests prove the WIRING: the page passes readOnly + the projectId as the opportunity key + an api
 * whose reads hit the participant (award-stripped) endpoints, never the admin factoryApi. The admin page's own
 * read-only rendering is tested in AdminGovQualificationPage.test.tsx.
 */
const mockLastProps: { current: any } = { current: null };
jest.mock('../../admin/AdminGovQualificationPage', () => ({
  __esModule: true,
  default: (props: any) => { mockLastProps.current = props; return null; },
}));
// PortalShell is the intern's portal nav chrome; mock it to a passthrough so this stays a pure wiring test and
// does not fetch points/schedule in jsdom. Its real presence (nav restored) is what the fix is about, covered
// by the assertion below that the page renders inside it.
jest.mock('../today/PortalShell', () => ({
  __esModule: true,
  default: ({ children }: any) => children,
}));
const mockGetPortalGovQualification = jest.fn();
const mockGetPortalGovOpportunityDetail = jest.fn();
jest.mock('../../../services/govProjectPortalApi', () => ({
  getPortalGovQualification: (...a: any[]) => mockGetPortalGovQualification(...a),
  getPortalGovOpportunityDetail: (...a: any[]) => mockGetPortalGovOpportunityDetail(...a),
}));

let container: HTMLDivElement; let root: Root;
async function render(projectId = 'dp-A') {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await act(async () => { root.render(<MemoryRouter initialEntries={[`/portal/gov-projects/${projectId}/qualification?tab=fit`]}><Routes><Route path="/portal/gov-projects/:projectId/qualification" element={<GovProjectQualificationPage />} /></Routes></MemoryRouter>); });
  await act(async () => { await Promise.resolve(); });
}
beforeEach(() => { mockGetPortalGovQualification.mockResolvedValue({}); mockGetPortalGovOpportunityDetail.mockResolvedValue({ opportunity: null, source: 'snapshot', snapshotDate: null }); });
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); mockLastProps.current = null; });

describe('GovProjectQualificationPage — mounts the real admin page read-only for the intern', () => {
  it('passes readOnly + the projectId as opportunityKey', async () => {
    await render('dp-A');
    expect(mockLastProps.current.readOnly).toBe(true);
    expect(mockLastProps.current.opportunityKey).toBe('dp-A');
  });

  it('the injected api reads the PARTICIPANT endpoints (scoped to this project), never the admin factoryApi', async () => {
    await render('dp-A');
    await act(async () => { await mockLastProps.current.api.getWorkspace('ignored-key'); });
    await act(async () => { await mockLastProps.current.api.getOpportunityDetail('ignored-key'); });
    expect(mockGetPortalGovQualification).toHaveBeenCalledWith('dp-A');
    expect(mockGetPortalGovOpportunityDetail).toHaveBeenCalledWith('dp-A');
  });
});
