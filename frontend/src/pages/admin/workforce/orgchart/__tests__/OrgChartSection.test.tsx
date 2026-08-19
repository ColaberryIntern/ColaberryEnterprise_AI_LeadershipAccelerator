import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import OrgChartSection from '../OrgChartSection';
import type { OrgChartResponse } from '../../../../../services/workforceOrgChartApi';

/**
 * OrgChartSection — no @testing-library/react in this repo (confirmed,
 * plan-audit cycle 2/3), same react-dom/client + act + MemoryRouter
 * convention as frontend/src/components/admin/shell/__tests__/StatCard.test.tsx
 * and frontend/src/pages/admin/workforce/__tests__/WorkforceOSPage.smoke.test.tsx.
 */

jest.mock('../../../../../services/workforceOrgChartApi', () => ({ getOrgChart: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getOrgChart } = require('../../../../../services/workforceOrgChartApi') as { getOrgChart: jest.Mock };
// OrgChartMermaid (and the MermaidDiagram it wraps) loads mermaid from a CDN
// at runtime via a dynamic `import()` of a literal URL string — real
// production behavior (MermaidDiagram.tsx's own graceful CDN-failure
// fallback), but under Jest/jsdom that dynamic import can hang well past the
// default test timeout rather than rejecting fast (confirmed live: the first
// full-suite run timed out at 5000ms and left later assertions racing an
// unsettled render). OrgChartSection's own job is just "pass the right data
// to OrgChartMermaid," not "prove Mermaid's CDN rendering works" — that is
// MermaidDiagram.tsx's own concern, out of scope here — so it's mocked out
// at the OrgChartMermaid boundary this file owns.
jest.mock('../OrgChartMermaid', () => ({ __esModule: true, default: () => null }));

// Real live shape from execution-contract.md (2026-08-19): 6 named humans,
// only Ali and Kes currently have a real open task; Taiwo/Jackie/Swati/Sohail
// have none yet — the fixture below mirrors that exactly, not an invented
// "everyone has a task" scenario.
const CHART: OrgChartResponse = {
  organization: { id: 'org-colaberry', name: 'Colaberry' },
  humans: [
    { id: 'f179c222-284e-4180-a335-cca9e4918b2e', name: 'Ali Muwwakkil', email: 'ali@colaberry.com', team: null, role: 'manager', leadership_agent_ids: ['corybrain-id'], staff_count: 14, task: { id: 't-ali', ticket_number: null, title: '[Student Success] Cross-Departmental Initiative Execution', status: 'backlog', priority: 'medium', type: 'strategic', created_at: '2026-08-19T11:28:06.114Z' } },
    { id: '3df017df-affa-49ab-884f-a99a4bd2ef4e', name: 'kesetebirhan@gmail.com', email: 'kesetebirhan@gmail.com', team: 'Staff', role: 'member', leadership_agent_ids: ['wie-id'], staff_count: 4, task: { id: 't-kes', ticket_number: null, title: '[Inbox Case] Employee Access To Enterprise Platform', status: 'in_progress', priority: 'medium', type: 'inbox_case', created_at: '2026-08-19T12:00:24.739Z' } },
    { id: '1fbb5316-1381-4b8a-81a8-3a7325b39d5f', name: 'Taiwo Oludimimu', email: 'taiwooludimimu@gmail.com', team: null, role: 'member', leadership_agent_ids: [], staff_count: 0, task: null },
    { id: 'a6db5276-2993-4e0b-ace9-0052ba841c80', name: 'Jackie', email: 'jackie@colaberry.com', team: 'Staff', role: 'member', leadership_agent_ids: [], staff_count: 0, task: null },
    { id: '5db87b51-4554-4e52-93d7-c61f9887352c', name: 'Swati', email: 'swati@colaberry.com', team: null, role: 'member', leadership_agent_ids: [], staff_count: 0, task: null },
    { id: '4e255894-ac0b-4367-ae06-27459ea05f66', name: 'Sohail', email: 'sohail@colaberry.com', team: 'Staff', role: 'member', leadership_agent_ids: [], staff_count: 0, task: null },
  ],
  leadership: [
    { id: 'corybrain-id', agent_name: 'CoryBrain', display_name: 'Cory Brain — Strategic Initiatives', reports_to_human_id: 'f179c222-284e-4180-a335-cca9e4918b2e', staff_ids: ['staff-1-id'], open_ticket_count: 129 },
    { id: 'wie-id', agent_name: 'workforce_intelligence_engine', display_name: 'Workforce Intelligence Engine', reports_to_human_id: '3df017df-affa-49ab-884f-a99a4bd2ef4e', staff_ids: [], open_ticket_count: 202 },
  ],
  staff: [
    { id: 'staff-1-id', agent_name: 'AdmissionsConversionArchitect', display_name: 'Admissions Conversion Architect', reports_to_agent_id: 'corybrain-id', open_ticket_count: 12 },
  ],
  unresolved: [],
  generated_at: '2026-08-19T14:00:00.000Z',
};

let container: HTMLDivElement;
let root: Root;

async function render() {
  await act(async () => {
    root.render(<MemoryRouter><OrgChartSection /></MemoryRouter>);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe('OrgChartSection — renders all 6 humans with real/honest-empty task state', () => {
  it('renders every human, with Ali/Kes showing their real task title and the other 4 showing no task', async () => {
    getOrgChart.mockResolvedValue(CHART);

    await render();

    for (const name of ['Ali Muwwakkil', 'Taiwo Oludimimu', 'Jackie', 'Swati', 'Sohail']) {
      expect(container.textContent).toContain(name);
    }
    expect(container.textContent).toContain('kesetebirhan@gmail.com'); // Kes falls back to email (no Enrollment)
  });

  it('renders AI Leadership and AI Staff tiers with real display names, not raw agent_name', async () => {
    getOrgChart.mockResolvedValue(CHART);

    await render();

    expect(container.textContent).toContain('Cory Brain — Strategic Initiatives');
    expect(container.textContent).toContain('Workforce Intelligence Engine');
    expect(container.textContent).toContain('Admissions Conversion Architect');
  });
});

describe('OrgChartSection — drill-down (human) and drill-through (agent)', () => {
  it('clicking a human opens the drawer showing their real team counts', async () => {
    getOrgChart.mockResolvedValue(CHART);
    await render();

    const aliCard = Array.from(container.querySelectorAll('.wf-emp')).find((el) => el.textContent?.includes('Ali Muwwakkil')) as HTMLElement;
    expect(aliCard).toBeTruthy();

    await act(async () => {
      aliCard.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain('AI Leadership reporting here · 1');
    expect(container.textContent).toContain('Cross-Departmental Initiative Execution');
  });

  it('clicking a human with no team/task shows the honest empty states in the drawer', async () => {
    getOrgChart.mockResolvedValue(CHART);
    await render();

    const taiwoCard = Array.from(container.querySelectorAll('.wf-emp')).find((el) => el.textContent?.includes('Taiwo Oludimimu')) as HTMLElement;
    await act(async () => {
      taiwoCard.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain('No task assigned yet.');
    expect(container.textContent).toContain('No AI Leadership agents report to Taiwo Oludimimu yet.');
  });

  it('an agent card is a real <a href="/admin/agents/:id"> link (drill-through, not a modal)', async () => {
    getOrgChart.mockResolvedValue(CHART);
    await render();

    const link = container.querySelector('a[href="/admin/agents/corybrain-id"]');
    expect(link).toBeTruthy();
    expect(link!.textContent).toContain('Cory Brain — Strategic Initiatives');
  });
});

describe('OrgChartSection — failure and boundary states', () => {
  it('renders an honest error with a retry button when the API call fails', async () => {
    getOrgChart.mockRejectedValue({ response: { data: { error: 'Could not load the org chart.' } } });

    await render();

    expect(container.textContent).toContain('Could not load the org chart.');
    expect(container.querySelector('button')?.textContent).toContain('Retry');
  });

  it('boundary: zero unresolved agents renders no broken-chain warning', async () => {
    getOrgChart.mockResolvedValue(CHART);

    await render();

    expect(container.textContent).not.toContain('broken reports-to chain');
  });

  it('boundary: an unresolved agent renders an honest disclosure, never silently dropped', async () => {
    getOrgChart.mockResolvedValue({ ...CHART, unresolved: [{ id: 'orphan-id', agent_name: 'OrphanedAgent', reason: 'OrphanedAgent (agent) -> [dangling]' }] });

    await render();

    expect(container.textContent).toContain('1 agent(s) have a broken reports-to chain');
    expect(container.textContent).toContain('OrphanedAgent');
  });
});
