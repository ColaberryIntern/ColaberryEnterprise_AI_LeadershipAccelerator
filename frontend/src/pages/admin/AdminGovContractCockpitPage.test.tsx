import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AdminGovContractCockpitPage from './AdminGovContractCockpitPage';
import * as adminGovContractsApi from '../../services/adminGovContractsApi';
import * as adminOrgApi from '../../services/adminOrgApi';

// StudioShell is the heavy cockpit; this page test only cares about the header's "View as" wiring.
jest.mock('../portal/projects/proposalStudio/StudioShell', () => () => <div data-testid="studio-shell" />);
jest.mock('../../services/adminGovContractsApi');
jest.mock('../../services/adminOrgApi');

const view = (over: Record<string, unknown> = {}) => ({
  projectId: 'p1', name: 'Crash Records', canonicalOpportunityId: null,
  ownerEnrollmentId: 'enr-9', ownerName: 'Aki Wam', ...over,
});

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
const settle = async (): Promise<void> => { for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); }); };

async function renderPage(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/admin/internship/gov-contract/p1']}>
        <Routes><Route path="/admin/internship/gov-contract/:projectId" element={<AdminGovContractCockpitPage />} /></Routes>
      </MemoryRouter>,
    );
  });
  await settle();
}

beforeEach(() => {
  (adminGovContractsApi.errorMessage as jest.Mock).mockReturnValue('err');
  (adminGovContractsApi.fetchGovContractCockpit as jest.Mock).mockResolvedValue(view());
  // The page now also renders GovManagementPanel, which fetches the management view on mount. The module is
  // auto-mocked, so stub it to resolve a minimal view - otherwise it returns undefined and the panel throws.
  (adminGovContractsApi.fetchGovManagement as jest.Mock).mockResolvedValue({
    deliveryProjectId: 'p1', studentProjectId: null, releases: [], rollup: null,
    submission: { status: 'preparing', outcome: 'pending', externallySubmittedAt: null, closeDate: null },
    potentialWin: { submitted: false, closeDate: null, valueCents: null, priced: false },
    dossier: { tenantId: null, factCount: 0, referenceCount: 0, personnelCount: 0 },
    openNeedCount: 0, exportReady: false,
  });
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); jest.clearAllMocks(); });

const btn = (): HTMLButtonElement | null => container.querySelector('[data-testid="cockpit-view-as"]');

describe('AdminGovContractCockpitPage: View as the assigned intern', () => {
  it('shows a "View as" button naming the assigned intern', async () => {
    await renderPage();
    expect(btn()).not.toBeNull();
    expect(btn()!.textContent).toContain('Aki Wam');
  });

  it('opens the read-only view-as session landing on the intern\'s gov cockpit', async () => {
    (adminOrgApi.getViewAsUrl as jest.Mock).mockResolvedValue('https://host/portal/view-as?token=xyz');
    const open = jest.spyOn(window, 'open').mockReturnValue(null);
    await renderPage();
    await act(async () => { btn()!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await settle();
    expect(adminOrgApi.getViewAsUrl).toHaveBeenCalledWith('enr-9');
    expect(open).toHaveBeenCalledWith(
      `https://host/portal/view-as?token=xyz&next=${encodeURIComponent('/portal/gov-projects/p1')}`,
      '_blank',
    );
    open.mockRestore();
  });

  it('shows no "View as" button when the contract has no assigned intern', async () => {
    (adminGovContractsApi.fetchGovContractCockpit as jest.Mock).mockResolvedValue(view({ ownerEnrollmentId: null }));
    await renderPage();
    expect(btn()).toBeNull();
  });
});
