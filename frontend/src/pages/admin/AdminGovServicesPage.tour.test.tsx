import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import AdminGovServicesPage from './AdminGovServicesPage';
import * as factoryApi from '../../services/factoryApi';
import * as ourServicesApi from '../../services/ourServicesApi';
import * as linkApi from '../../services/caseStudyServiceLinkApi';
import * as caseStudyAdminApi from '../../services/caseStudyAdminApi';
import { OUR_SERVICES_TOUR } from '../../components/admin/ourServices/ourServicesTourSteps';
import { summary } from '../../components/admin/ourServices/__fixtures__/summaryFixtures';

/** The "How this page works" walkthrough and the case-study side panel, driven through the real page. */
jest.mock('../../services/factoryApi');
jest.mock('../../services/ourServicesApi');
jest.mock('../../services/caseStudyServiceLinkApi');
jest.mock('../../services/caseStudyAdminApi');
jest.mock('../../components/visuals/MermaidDiagram', () => () => null);
jest.mock('../../components/admin/ourServices/ServiceEvidenceBarChart', () => () => <div />);
jest.mock('../../components/admin/ourServices/ServiceInvestQuadrant', () => () => <div />);
jest.mock('../../components/admin/ourServices/EvidenceTierDonut', () => () => <div />);
jest.mock('../../components/admin/ourServices/CatalogGrowthChart', () => () => <div />);
jest.mock('../../components/admin/ourServices/ServiceFamilyChart', () => () => <div />);

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
const settle = async (): Promise<void> => { for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); }); };
const click = async (el: Element, init: MouseEventInit = {}): Promise<void> => {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init })); });
  await settle();
};
const key = async (k: string): Promise<void> => { await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: k })); }); await settle(); };
const q = (sel: string): HTMLElement | null => container.querySelector(sel);
const btn = (text: string): HTMLButtonElement => Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === text) as HTMLButtonElement;

const record = (over: Record<string, unknown> = {}) => ({
  caseStudy: { id: 'cs-9', title: 'Case Study 9', status: 'draft', industry: 'Industry Two', primaryCapability: 'Forecasting', canonicalSummary: 'A forecasting model for a utility.', ...over },
});

beforeAll(() => {
  Object.assign(URL, { createObjectURL: jest.fn(), revokeObjectURL: jest.fn() });
});
beforeEach(async () => {
  // CRA's jest config sets resetMocks, which wipes implementations before every test; set them here, not in beforeAll.
  (URL.createObjectURL as jest.Mock).mockReturnValue('blob:doc');
  (factoryApi.listServiceOfferings as jest.Mock).mockResolvedValue([]);
  (ourServicesApi.getEvidenceSummary as jest.Mock).mockResolvedValue(summary());
  (caseStudyAdminApi.getCaseStudy as jest.Mock).mockResolvedValue(record());
  (linkApi.listLinksForCaseStudy as jest.Mock).mockResolvedValue([
    { id: 'l1', state: 'confirmed', serviceName: 'Service A' }, { id: 'l2', state: 'suggested', serviceName: 'Service B' }, { id: 'l3', state: 'rejected', serviceName: 'Service C' },
  ]);
  (ourServicesApi.getCaseStudySourceFile as jest.Mock).mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<MemoryRouter><AdminGovServicesPage /></MemoryRouter>); });
  await settle();
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); jest.clearAllMocks(); });

describe('How this page works', () => {
  it('every tour step points at a section that is on the page', () => {
    for (const s of OUR_SERVICES_TOUR) expect(q(`[data-tour="${s.target}"]`)).not.toBeNull();
  });

  it('walks every step in order, then Finish closes it', async () => {
    await click(q('[data-testid="start-tour"]')!);
    for (let i = 0; i < OUR_SERVICES_TOUR.length; i += 1) {
      expect(q('[data-testid="tour-card"]')?.textContent).toContain(`Step ${i + 1} of ${OUR_SERVICES_TOUR.length}`);
      expect(q('#tour-title')?.textContent).toBe(OUR_SERVICES_TOUR[i].title);
      await click(btn(i === OUR_SERVICES_TOUR.length - 1 ? 'Finish' : 'Next'));
    }
    expect(q('[data-testid="guided-tour"]')).toBeNull();
  });

  it('Back is disabled on the first step; arrows move; Escape closes', async () => {
    await click(q('[data-testid="start-tour"]')!);
    expect(btn('Back').disabled).toBe(true);
    await key('ArrowRight');
    expect(q('#tour-title')?.textContent).toBe(OUR_SERVICES_TOUR[1].title);
    await key('ArrowLeft');
    expect(q('#tour-title')?.textContent).toBe(OUR_SERVICES_TOUR[0].title);
    await key('Escape');
    expect(q('[data-testid="guided-tour"]')).toBeNull();
  });
});

describe('Reading a case study in the side panel', () => {
  it('an outside title opens the panel in the page with its summary, services and the original PDF', async () => {
    await click(q('[data-testid="open-case-study-cs-9"]')!);
    const drawer = q('[data-testid="case-study-drawer"]')!;
    expect(drawer).not.toBeNull();
    expect(drawer.textContent).toContain('A forecasting model for a utility.');
    expect(drawer.textContent).toContain('Internal only, never published');
    expect(q('[data-testid="drawer-links"]')?.textContent).toContain('Service A');
    expect(q('[data-testid="drawer-links"]')?.textContent).not.toContain('Service C'); // dismissed links are hidden
    expect(drawer.querySelector('iframe')?.getAttribute('src')).toBe('blob:doc');
    expect(ourServicesApi.getCaseStudySourceFile).toHaveBeenCalledWith('cs-9');
  });

  it('an inside title opens the panel without asking for a document', async () => {
    (caseStudyAdminApi.getCaseStudy as jest.Mock).mockResolvedValue(record({ id: 'cs-1', title: 'Case Study 1', canonicalSummary: null }));
    // cs-1 is an inside case study under Service A; open its row first.
    const row = q('[data-testid="catalog-row-svc-a"]')!;
    await click(row.querySelector('button') ?? row);
    const link = q('[data-testid="open-case-study-cs-1"]');
    expect(link).not.toBeNull();
    await click(link!);
    const drawer = q('[data-testid="case-study-drawer"]')!;
    expect(drawer.textContent).toContain('Inside · Project Factory');
    expect(drawer.textContent).toContain('No summary yet');
    expect(drawer.querySelector('iframe')).toBeNull();
    expect(ourServicesApi.getCaseStudySourceFile).not.toHaveBeenCalled();
  });

  it('a missing original says so instead of an empty frame; Escape closes the panel', async () => {
    (ourServicesApi.getCaseStudySourceFile as jest.Mock).mockResolvedValue(null);
    await click(q('[data-testid="open-case-study-cs-9"]')!);
    expect(q('[data-testid="case-study-drawer"]')?.textContent).toContain('No original document is on file');
    await key('Escape');
    expect(q('[data-testid="case-study-drawer"]')).toBeNull();
  });

  it('Ctrl+click keeps the browser default (full record in a new tab) and does not open the panel', async () => {
    await click(q('[data-testid="open-case-study-cs-9"]')!, { ctrlKey: true });
    expect(q('[data-testid="case-study-drawer"]')).toBeNull();
  });
});
