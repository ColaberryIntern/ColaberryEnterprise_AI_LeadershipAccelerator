import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import GovDossierPanel from './GovDossierPanel';
import * as dossierApi from '../../../services/adminGovDossierApi';
import type { DossierLibrary } from '../../../services/adminGovDossierApi';

// No @testing-library here: render via react-dom/client + act and drive the DOM directly (same convention as the
// other admin page tests). FACT_CATEGORIES is kept real so grouping works; only the network fns are mocked.
jest.mock('../../../services/adminGovDossierApi', () => ({
  ...jest.requireActual('../../../services/adminGovDossierApi'),
  getDossier: jest.fn(),
  addDossierItem: jest.fn(),
  approveDossierItem: jest.fn(),
  listCompanyDocs: jest.fn(),
  uploadCompanyDoc: jest.fn(),
  approveCompanyDoc: jest.fn(),
  deleteCompanyDoc: jest.fn(),
  getDossierNeeds: jest.fn(),
  fillNeedGroup: jest.fn(),
  getCategories: jest.fn(),
  suggestCategories: jest.fn(),
  activateCategory: jest.fn(),
}));

/** Set a controlled input/textarea value the way React's synthetic onChange expects (native setter + input event). */
function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

const refGroup = {
  groupSlug: 'past_performance', groupLabel: 'Past projects and references', groupKind: 'reference' as const,
  subject: 'reporting', subjectLabel: 'Reporting and analytics', blocking: 'fatal' as const,
  projects: [{ projectId: 'p1', projectName: 'Harris County' }, { projectId: 'p2', projectName: 'Dallas ISD' }],
  bidCount: 2,
  concepts: [{ conceptId: 'past_performance', label: 'Past projects and references', asks: ['Add a past-performance reference'], needKeys: ['reference:1'] }],
  needKeys: ['reference:1'],
};

const lib = (over: Partial<DossierLibrary> = {}): DossierLibrary => ({
  facts: [{ id: 'f1', key: 'UEI', value: 'ABC123', source: null, category: 'registrations', approved: false }],
  references: [{ id: 'r1', client: 'City of Plano', scope: 'Permitting', contractValue: '$1.2M', dates: '2023-2025', contact: 'Jane Roe', phone: null, email: null, approved: true }],
  personnel: [{ id: 'p1', name: 'Ada Lovelace', role: 'Technical Lead', resumeHtml: null, approved: false }],
  ...over,
});

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement; let root: Root;
const settle = async (): Promise<void> => { for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); }); };
async function renderPage(embedded = false): Promise<void> {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await act(async () => { root.render(<GovDossierPanel embedded={embedded} />); });
  await settle();
}

beforeEach(() => {
  (dossierApi.getDossier as jest.Mock).mockResolvedValue(lib());
  (dossierApi.approveDossierItem as jest.Mock).mockResolvedValue({ ok: true, id: 'f1', approved: true });
  (dossierApi.listCompanyDocs as jest.Mock).mockResolvedValue({ documents: [{ id: 'd1', name: 'capability.pdf', status: 'ready', approved: false, chunkCount: 4, embeddedCount: 4, truncated: false, createdAt: null }] });
  (dossierApi.approveCompanyDoc as jest.Mock).mockResolvedValue({ ok: true, id: 'd1', approved: true });
  (dossierApi.getDossierNeeds as jest.Mock).mockResolvedValue({ needs: [], groups: [] });
  (dossierApi.getCategories as jest.Mock).mockResolvedValue({ active: [], pending: [] });
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

describe('GovDossierPanel (standalone)', () => {
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

  it('folds the open needs into a group card: a Reference, its subject, its bids, and a Fill action', async () => {
    (dossierApi.getDossierNeeds as jest.Mock).mockResolvedValue({ needs: [], groups: [refGroup] });
    await renderPage();
    const rows = container.querySelectorAll('[data-testid="need-group-row"]');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Reference');
    expect(rows[0].textContent).toContain('Past projects and references');
    expect(rows[0].textContent).toContain('Reporting and analytics'); // subject chip - not interchangeable
    expect(rows[0].textContent).toContain('Harris County');
    expect(rows[0].textContent).toContain('Dallas ISD');
    expect(rows[0].textContent).toContain('2 bids');
    expect(container.querySelector('[data-testid="group-fill"]')).not.toBeNull();
  });

  it('fills a reference group as one record for every bid at once, tagged with its subject', async () => {
    (dossierApi.getDossierNeeds as jest.Mock).mockResolvedValue({ needs: [], groups: [refGroup] });
    (dossierApi.fillNeedGroup as jest.Mock).mockResolvedValue({ ok: true, resolved: 2, groups: [] });
    await renderPage();
    const fill = container.querySelector('[data-testid="group-fill"]') as HTMLButtonElement;
    await act(async () => { fill.click(); });
    await settle();
    expect(container.querySelector('[data-testid="group-fill-modal"]')).not.toBeNull();
    const client = container.querySelector('[data-testid="fill-client"]') as HTMLInputElement;
    await act(async () => { typeInto(client, 'City Reporting Dashboard'); });
    const save = container.querySelector('[data-testid="group-fill-save"]') as HTMLButtonElement;
    await act(async () => { save.click(); });
    await settle();
    expect(dossierApi.fillNeedGroup).toHaveBeenCalledWith(expect.objectContaining({
      groupSlug: 'past_performance', subject: 'reporting', record: expect.objectContaining({ client: 'City Reporting Dashboard' }),
    }));
  });

  it('suggests groups for ungrouped questions and lets the admin activate a proposal', async () => {
    (dossierApi.suggestCategories as jest.Mock).mockResolvedValue({ ok: true, scanned: 3, proposed: 1, pending: [{ slug: 'cmmc', label: 'CMMC attestation', kind: 'fact', subject: 'security', status: 'pending', source: 'ai', confidence: 0.8, exampleAsk: 'provide your CMMC level' }] });
    (dossierApi.activateCategory as jest.Mock).mockResolvedValue({ ok: true, slug: 'cmmc' });
    await renderPage();
    const suggest = container.querySelector('[data-testid="suggest-groups"]') as HTMLButtonElement;
    await act(async () => { suggest.click(); });
    await settle();
    expect(dossierApi.suggestCategories).toHaveBeenCalled();
    const pending = container.querySelector('[data-testid="pending-categories"]')!;
    expect(pending.textContent).toContain('CMMC attestation');
    const activateBtn = Array.from(pending.querySelectorAll('button')).find((b) => b.textContent === 'Activate') as HTMLButtonElement;
    await act(async () => { activateBtn.click(); });
    await settle();
    expect(dossierApi.activateCategory).toHaveBeenCalledWith('cmmc');
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

describe('GovDossierPanel embedded on Our Services', () => {
  afterEach(() => { window.history.replaceState(null, '', '/'); });

  it('starts closed with the counts and the waiting-for-approval line, and opens on click', async () => {
    await renderPage(true);
    expect(container.querySelector('#dossier')).not.toBeNull();
    expect(container.textContent).toContain('Gov company dossier');
    expect(container.textContent).toContain('1 facts, 1 references, 1 people. 2 waiting for approval.');
    expect(container.querySelector('[data-testid="fact-row"]')).toBeNull();
    const toggle = container.querySelector('[data-testid="dossier-toggle"]') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await act(async () => { toggle.click(); });
    await settle();
    expect(container.querySelectorAll('[data-testid="fact-row"]').length).toBe(1);
    expect(toggle.textContent).toBe('Close dossier');
  });

  it('opens by itself when the URL is #dossier (the old /admin/gov-dossier link redirects there)', async () => {
    window.history.replaceState(null, '', '/admin/gov-services#dossier');
    await renderPage(true);
    expect(container.querySelectorAll('[data-testid="fact-row"]').length).toBe(1);
  });

  it('says so when the dossier cannot load, instead of loading forever', async () => {
    (dossierApi.getDossier as jest.Mock).mockRejectedValue(new Error('down'));
    await renderPage(true);
    expect(container.textContent).toContain('Could not load the dossier. Open it to retry.');
  });
});
