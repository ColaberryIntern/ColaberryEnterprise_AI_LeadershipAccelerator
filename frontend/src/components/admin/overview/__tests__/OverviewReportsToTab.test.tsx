import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import OverviewReportsToTab from '../OverviewReportsToTab';
import { AgentDetailReportsTo } from '../../../../services/agentDetailApi';

// Overview sub-tabs, Reports to (2026-09-10) — Ali: "show a mermaid chart of
// Reeses position and all postions of everyone above reese." Pins the real
// new logic this sub-tab adds: parsing resolveReportsToChainWithTrail()'s
// trail strings ("<name> (agent)", terminated by " -> [human|dangling|unset]")
// into a real Mermaid flowchart, upward from this agent to a real human.
// MermaidDiagram itself (CDN-loaded rendering) is out of scope here — it has
// its own established test coverage via OrgChartSection.test.tsx; this file
// only proves the chart STRING this component builds is correct.

jest.mock('../../../visuals/MermaidDiagram', () => ({
  __esModule: true,
  default: ({ chart, caption }: { chart: string; caption?: string }) => (
    <div data-testid="mermaid-stub" data-caption={caption}>{chart}</div>
  ),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

async function renderTab(reportsTo: AgentDetailReportsTo | null, agentDisplayName = 'Reese') {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <OverviewReportsToTab reportsTo={reportsTo} agentDisplayName={agentDisplayName} />
      </MemoryRouter>,
    );
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe('OverviewReportsToTab — Mermaid chain chart', () => {
  it('builds a chart chaining this agent through AI Leadership up to the real resolved human', async () => {
    const reportsTo: AgentDetailReportsTo = {
      trail: ['Reese (agent)', 'workforce_intelligence_engine (agent) -> [human]'],
      resolved_human: { id: 'h-1', name: 'Kes', email: 'kes@colaberry.com' },
      immediate_agent: { id: 'agent-wie', name: 'workforce_intelligence_engine' },
    };
    await renderTab(reportsTo);

    const chart = container.querySelector('[data-testid="mermaid-stub"]')?.textContent || '';
    expect(chart).toContain('flowchart TD');
    expect(chart).toContain('Reese');
    expect(chart).toContain('workforce_intelligence_engine');
    expect(chart).toContain('Kes');
    expect(chart).toContain('-->');
  });

  it('shows a real "broken chain" node when the trail dangles instead of resolving to a human', async () => {
    const reportsTo: AgentDetailReportsTo = {
      trail: ['Reese (agent) -> [dangling]'],
      resolved_human: null,
      immediate_agent: null,
    };
    await renderTab(reportsTo);

    const chart = container.querySelector('[data-testid="mermaid-stub"]')?.textContent || '';
    expect(chart).toContain('Chain does not resolve to a real human');
  });

  it('renders no diagram (and no crash) when this agent has no reports-to chain configured', async () => {
    await renderTab(null);
    expect(container.querySelector('[data-testid="mermaid-stub"]')).toBeNull();
    expect(container.textContent).toContain('No reports-to chain configured for this agent.');
  });
});
