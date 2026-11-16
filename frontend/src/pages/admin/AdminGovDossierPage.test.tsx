import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import AdminGovDossierPage from './AdminGovDossierPage';
import * as dossierApi from '../../services/adminGovDossierApi';
import type { DossierLibrary } from '../../services/adminGovDossierApi';

// No @testing-library here: render via react-dom/client + act and drive the DOM directly (same convention as the
// other admin page tests). FACT_CATEGORIES is kept real so grouping works; only the network fns are mocked.
jest.mock('../../services/adminGovDossierApi', () => ({
  ...jest.requireActual('../../services/adminGovDossierApi'),
  getDossier: jest.fn(),
  addDossierItem: jest.fn(),
  approveDossierItem: jest.fn(),
  listCompanyDocs: jest.fn(),
  uploadCompanyDoc: jest.fn(),
  approveCompanyDoc: jest.fn(),
  deleteCompanyDoc: jest.fn(),
}));

const lib = (over: Partial<DossierLibrary> = {}): DossierLibrary => ({
  facts: [{ id: 'f1', key: 'UEI', value: 'ABC123', source: null, category: 'registrations', approved: false }],
  references: [{ id: 'r1', client: 'City of Plano', scope: 'Permitting', contractValue: '$1.2M', dates: '2023-2025', contact: 'Jane Roe', phone: null, email: null, approved: true }],
  personnel: [{ id: 'p1', name: 'Ada Lovelace', role: 'Technical Lead', resumeHtml: null, approved: false }],
  ...over,
});

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement; let root: Root;
const settle = async (): Promise<void> => { for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); }); };
async function renderPage(): Promise<void> {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await act(async () => { root.render(<AdminGovDossierPage />); });
  await settle();
}

beforeEach(() => {
  (dossierApi.getDossier as jest.Mock).mockResolvedValue(lib());
  (dossierApi.approveDossierItem as jest.Mock).mockResolvedValue({ ok: true, id: 'f1', approved: true });
  (dossierApi.listCompanyDocs as jest.Mock).mockResolvedValue({ documents: [{ id: 'd1', name: 'capability.pdf', status: 'ready', approved: false, chunkCount: 4, embeddedCount: 4, truncated: false, createdAt: null }] });
  (dossierApi.approveCompanyDoc as jest.Mock).mockResolvedValue({ ok: true, id: 'd1', approved: true });
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

describe('AdminGovDossierPage', () => {
  it('loads the dossier and renders a row per item, draft rows showing an Approve action', async () => {
    await renderPage();
    expect(container.querySelectorAll('[data-testid="fact-row"]').length).toBe(1);
    expect(container.querySelectorAll('[data-testid="reference-row"]').length).toBe(1);
    expect(container.querySelectorAll('[data-testid="personnel-row"]').length).toBe(1);
    // The draft fact has an Approve button; the approved reference does not.
    const factRow = container.querySelector('[data-testid="fact-row"]')!;
    expect(factRow.textContent).toContain('Approve');
    const refRow = container.querySelector('[data-testid="reference-row"]')!;
    expect(refRow.textContent).toContain('Approved');
  });

  it('approves a draft fact and reloads', async () => {
    await renderPage();
    const btn = Array.from(container.querySelectorAll('[data-testid="fact-row"] button')).find((b) => b.textContent === 'Approve') as HTMLButtonElement;
    await act(async () => { btn.click(); });
    await settle();
    expect(dossierApi.approveDossierItem).toHaveBeenCalledWith('fact', 'f1');
    expect(dossierApi.getDossier).toHaveBeenCalledTimes(2); // initial load + reload after approve
  });

  it('lists company documents with an upload control', async () => {
    await renderPage();
    expect(dossierApi.listCompanyDocs).toHaveBeenCalled();
    expect(container.querySelector('[data-testid="doc-upload"]')).not.toBeNull();
    const docRows = container.querySelectorAll('[data-testid="doc-row"]');
    expect(docRows.length).toBe(1);
    expect(docRows[0].textContent).toContain('capability.pdf');
  });
});
