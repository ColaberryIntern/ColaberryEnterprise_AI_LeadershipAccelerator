import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ServiceCatalogTable, { filterCatalog, type CatalogFilter } from '../ServiceCatalogTable';
import ServiceIndustryHeatmap from '../ServiceIndustryHeatmap';
import ServiceEvidenceBarChart from '../ServiceEvidenceBarChart';
import ServiceInvestQuadrant from '../ServiceInvestQuadrant';
import { summary, svc } from '../__fixtures__/summaryFixtures';
import type { EvidenceService } from '../../../../services/ourServicesApi';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
async function render(ui: React.ReactElement): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(ui); });
}
afterEach(() => {
  if (!root) return; // the pure filterCatalog tests render nothing
  act(() => { root.unmount(); });
  container.remove();
});

const services = (): EvidenceService[] => [...summary().services, svc({ id: 'svc-r', name: 'Service R', status: 'retired', evidenceScore: 10, evidenceTier: 'thin' })];

const table = (filter: CatalogFilter, list: EvidenceService[] = services(), handlers: Partial<Record<'onPromote' | 'onAddService', jest.Mock>> = {}): React.ReactElement => (
  <ServiceCatalogTable services={list} descriptions={{ 'svc-a': 'Desc A' }} currentYear={2026} filter={filter} onFilter={jest.fn()} busyId={null}
    onEvidence={jest.fn()} onEdit={jest.fn()} onRetire={jest.fn()} onPromote={handlers.onPromote ?? jest.fn()} onAddService={handlers.onAddService ?? jest.fn()} />
);

describe('filterCatalog', () => {
  it('Active / Growth / Needs evidence / All, strongest first', () => {
    const ids = (f: CatalogFilter): string[] => filterCatalog(services(), f).map((s) => s.id);
    expect(ids('active')).toEqual(['svc-a', 'svc-b']);
    expect(ids('growth')).toEqual(['svc-c']);
    expect(ids('weak')).toEqual(['svc-b', 'svc-c']); // under 40, retired excluded
    expect(ids('all')).toEqual(['svc-a', 'svc-r', 'svc-b', 'svc-c']);
  });
});

describe('ServiceCatalogTable', () => {
  it('renders evidence, freshness and unknown matches honestly', async () => {
    await render(table('active', [svc({ openOpportunityMatches: null })]));
    const row = container.querySelector('[data-testid="catalog-row-svc-a"]')!;
    expect(row.textContent).toContain('75');
    expect(row.textContent).toContain('2026');
    expect(row.textContent).toContain('—'); // null matches render as a dash, not 0
  });

  it('a row expands into its case-study cards; an unproven row explains itself', async () => {
    await render(table('all'));
    const toggle = (name: string): HTMLButtonElement => Array.from(container.querySelectorAll('button[aria-expanded]')).find((b) => b.textContent?.includes(name)) as HTMLButtonElement;
    await act(async () => { toggle('Service A').click(); });
    expect(toggle('Service A').getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('Case Study 1');
    expect(container.textContent).toContain('Cycle time: faster');
    await act(async () => { toggle('Service B').click(); });
    expect(container.textContent).toContain('No case study linked yet');
  });

  it('Promote is disabled on a growth service until it has a confirmed case study', async () => {
    const onPromote = jest.fn();
    await render(table('growth', [svc({ id: 'g0', status: 'growth', insideCount: 0, outsideCount: 0 }), svc({ id: 'g1', name: 'Service G', status: 'growth' })], { onPromote }));
    const promotes = Array.from(container.querySelectorAll('button')).filter((b) => b.textContent?.includes('Promote')) as HTMLButtonElement[];
    expect(promotes.map((b) => b.disabled)).toEqual([true, false]); // same score, so by name: Service A (no proof), Service G
    await act(async () => { promotes[1].click(); });
    expect(onPromote).toHaveBeenCalledTimes(1);
  });

  it('empty states: no services at all, and an empty filter', async () => {
    const onAddService = jest.fn();
    await render(table('active', [], { onAddService }));
    expect(container.textContent).toContain('No services yet');
    act(() => { root.unmount(); }); container.remove();
    await render(table('growth', [svc()]));
    expect(container.textContent).toContain('No growth services');
  });
});

describe('chart and heatmap empty states', () => {
  it('no confirmed links: the bar chart and heatmap say so instead of drawing zeros', async () => {
    const bare = [svc({ insideCount: 0, outsideCount: 0, caseStudies: [], evidenceScore: 0, evidenceTier: 'none' })];
    await render(<><ServiceEvidenceBarChart services={bare} /><ServiceIndustryHeatmap services={bare} matrix={{ industries: [], cells: [] }} /></>);
    expect(container.textContent).toContain('No confirmed case studies yet. Link one from Intake.');
  });
  it('the quadrant is hidden when open matches are unknown', async () => {
    await render(<ServiceInvestQuadrant services={[svc({ openOpportunityMatches: null })]} feed={{ source: 'unavailable', openCount: null }} />);
    expect(container.textContent).toContain('not available right now');
  });
});
