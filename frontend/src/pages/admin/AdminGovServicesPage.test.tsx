import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import AdminGovServicesPage from './AdminGovServicesPage';
import * as factoryApi from '../../services/factoryApi';
import * as ourServicesApi from '../../services/ourServicesApi';
import * as linkApi from '../../services/caseStudyServiceLinkApi';
import type { ServiceOffering } from '../../services/factoryApi';
import { emptySummary, summary } from '../../components/admin/ourServices/__fixtures__/summaryFixtures';

// No @testing-library here: render via react-dom/client + act and drive the DOM directly.
jest.mock('../../services/factoryApi');
jest.mock('../../services/ourServicesApi');
jest.mock('../../services/caseStudyServiceLinkApi');
// The charts and the CDN-loaded Mermaid diagram have their own tests; jsdom has no layout to draw them in.
jest.mock('../../components/visuals/MermaidDiagram', () => () => null);
jest.mock('../../components/admin/ourServices/ServiceEvidenceBarChart', () => () => <div data-testid="chart-evidence" />);
jest.mock('../../components/admin/ourServices/ServiceInvestQuadrant', () => () => <div data-testid="chart-quadrant" />);
jest.mock('../../components/admin/ourServices/EvidenceTierDonut', () => () => <div data-testid="chart-tier" />);
jest.mock('../../components/admin/ourServices/CatalogGrowthChart', () => () => <div data-testid="chart-growth" />);
jest.mock('../../components/admin/ourServices/ServiceFamilyChart', () => () => <div data-testid="chart-family" />);

const offering = (over: Partial<ServiceOffering> = {}): ServiceOffering => ({
  id: 'svc-a', name: 'Service A', description: 'Dashboards and ETL', category: 'Data',
  keywords: ['dashboards'], naicsCodes: ['541511'], pscCodes: [], pastPerformance: null, owner: 'owner@example.com', status: 'active', ...over,
});

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;

const settle = async (): Promise<void> => { for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); }); };

async function renderPage(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<MemoryRouter><AdminGovServicesPage /></MemoryRouter>); });
  await settle();
}

beforeEach(() => {
  (factoryApi.listServiceOfferings as jest.Mock).mockResolvedValue([offering()]);
  (ourServicesApi.getEvidenceSummary as jest.Mock).mockResolvedValue(summary());
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); jest.clearAllMocks(); });

const click = async (el: Element): Promise<void> => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await settle(); };
const findButton = (text: string): HTMLButtonElement => Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(text)) as HTMLButtonElement;
const setField = (id: string, value: string): void => {
  const el = container.querySelector(`#${id}`) as HTMLInputElement | HTMLTextAreaElement;
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
const submitForm = async (): Promise<void> => {
  await act(async () => { container.querySelector('.modal form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await settle();
};

describe('AdminGovServicesPage: the evidence-backed catalog', () => {
  it('loads both reads (status=all) and renders the sections in mockup order', async () => {
    await renderPage();
    expect(factoryApi.listServiceOfferings).toHaveBeenCalledWith('all');
    expect(ourServicesApi.getEvidenceSummary).toHaveBeenCalledWith('all');
    const text = container.textContent ?? '';
    const order = ['Active services', 'Decide now', 'How Our Services grows', 'Evidence by service', 'Where to invest next', 'Evidence health', 'Service catalog', 'Service × industry coverage', 'Case study intake', 'Gaps from live proposals'];
    const positions = order.map((t) => text.indexOf(t));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(text).toContain('Dashboards and ETL'); // description joined from the catalog read
    expect(text).toContain('1 blocked');
  });

  it('the catalog filter is client-side over the one summary', async () => {
    await renderPage();
    expect(container.querySelector('[data-testid="catalog-row-svc-c"]')).toBeNull(); // growth hidden under Active
    await click(container.querySelector('[aria-label="Catalog filter"] button:nth-child(2)')!); // Growth
    expect(container.querySelector('[data-testid="catalog-row-svc-c"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="catalog-row-svc-a"]')).toBeNull();
    expect(ourServicesApi.getEvidenceSummary).toHaveBeenCalledTimes(1);
  });

  it('linking from Intake confirms the picked suggestion, then re-reads the summary', async () => {
    (linkApi.decideServiceLink as jest.Mock).mockResolvedValue({});
    await renderPage();
    await click(findButton('Link (internal only)'));
    expect(linkApi.decideServiceLink).toHaveBeenCalledWith('link-strong', 'confirmed');
    expect(linkApi.decideServiceLink).toHaveBeenCalledTimes(1);
    expect(ourServicesApi.getEvidenceSummary).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('linked to 1 service');
  });

  it('adds a service with parsed arrays, then reloads', async () => {
    (factoryApi.createServiceOffering as jest.Mock).mockResolvedValue(offering({ id: 'new' }));
    await renderPage();
    await click(findButton('Add service'));
    setField('svc-name', 'Service N');
    setField('svc-keywords', 'alpha, beta');
    setField('svc-naics', '541519');
    await submitForm();
    expect(factoryApi.createServiceOffering).toHaveBeenCalledWith(expect.objectContaining({ name: 'Service N', keywords: ['alpha', 'beta'], naicsCodes: ['541519'] }));
    expect(factoryApi.listServiceOfferings).toHaveBeenCalledTimes(2);
  });

  it('edits a service with the catalog fields prefilled', async () => {
    (factoryApi.updateServiceOffering as jest.Mock).mockResolvedValue(offering());
    await renderPage();
    await click(findButton('Edit'));
    expect((container.querySelector('#svc-desc') as HTMLTextAreaElement).value).toBe('Dashboards and ETL');
    setField('svc-name', 'Service A2');
    await submitForm();
    expect(factoryApi.updateServiceOffering).toHaveBeenCalledWith('svc-a', expect.objectContaining({ name: 'Service A2' }));
  });

  it('retires a service, then reloads', async () => {
    (factoryApi.retireServiceOffering as jest.Mock).mockResolvedValue(offering({ status: 'retired' }));
    await renderPage();
    await click(findButton('Retire'));
    expect(factoryApi.retireServiceOffering).toHaveBeenCalledWith('svc-a');
    expect(ourServicesApi.getEvidenceSummary).toHaveBeenCalledTimes(2);
  });

  it('an empty tenant reads honestly: no sample numbers, a way forward in each section', async () => {
    (factoryApi.listServiceOfferings as jest.Mock).mockResolvedValue([]);
    (ourServicesApi.getEvidenceSummary as jest.Mock).mockResolvedValue(emptySummary());
    await renderPage();
    const text = container.textContent ?? '';
    expect(text).toContain('No services yet');
    expect(text).toContain('Every case study is linked to a service. Nothing is blocked.');
    expect(text).toContain('No open pursuit has a Partly or New capability.');
    expect(text).toContain('no services yet'); // proven % and average have nothing to divide by
  });

  it('a failed summary shows an error and no evidence numbers', async () => {
    (ourServicesApi.getEvidenceSummary as jest.Mock).mockRejectedValue({ response: { data: { error: 'The government contracts workspace is not configured.' } } });
    await renderPage();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('workspace is not configured');
    expect(container.querySelector('[data-testid="kpi-row"]')).toBeNull();
  });
});
