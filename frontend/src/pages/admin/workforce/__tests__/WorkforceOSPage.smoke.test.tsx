import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import WorkforceOSPage from '../WorkforceOSPage';

/**
 * Render-only smoke tests for WorkforceOSPage — no @testing-library/react (not
 * installed in this repo; adding it is a dependency-introduction decision, not
 * made here), matching the existing convention in
 * frontend/src/components/admin/kitConfig/__tests__/panels.smoke.test.tsx. Uses
 * react-dom/client + act directly since this page fetches over a real useEffect
 * and needs its async load() to actually resolve, not just a static markup dump.
 *
 * Org-chart hierarchy build (2026-08-19): the previous "Director roster —
 * unchanged regression" and "Live Agents section — generic, real data"
 * describe blocks are REMOVED here, not rewritten — that DOM (the static
 * AI_ORG director tiles + office drawer, and the separate Live Agents grid)
 * no longer exists on this page (see WorkforceOSPage.tsx's own header
 * comment). Coverage for the real replacement surface
 * (OrgChartSection.tsx — drill-down/drill-through, honest empty states) lives
 * in its own dedicated test file,
 * frontend/src/pages/admin/workforce/orgchart/__tests__/OrgChartSection.test.tsx,
 * not a rewritten copy of these blocks here. What remains under test below
 * (Activity Timeline) is untouched by this run — same tests, same fixtures.
 */

jest.mock('../../../../utils/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require('../../../../utils/api').default as { get: jest.Mock; post: jest.Mock };

const DIRECTOR = { slug: 'curriculum', name: 'Dr. Elena Vasquez', role: 'Curriculum Director', department: 'Curriculum', avatar: '#5BA63C', supervisor: 'chief_of_staff', mission: 'm', ops_domain: 'curriculum', workload: 2, status: 'active' };
const COS = { slug: 'chief_of_staff', name: 'Miles Chen', role: 'Chief of Staff', department: 'Executive', avatar: '#2E6A86', supervisor: 'ceo', mission: 'm', ops_domain: null, workload: 1, status: 'active' };

const REESE_EVENT = { agent_id: 'agent-reese', agent_name: 'Reese', agent_display_name: 'Reese', ticket_id: 't1', ticket_number: 12, title: 'Reached out to a struggling student', type: 'reese_autonomous_outreach', status: 'in_progress', priority: 'high', occurred_at: '2026-08-10T00:00:00Z' };

function mockApi({ activity = [REESE_EVENT] }: { activity?: any[] }) {
  api.get.mockImplementation((url: string) => {
    if (url === '/api/admin/workforce/roster') return Promise.resolve({ data: { employees: [COS, DIRECTOR] } });
    if (url === '/api/admin/workforce/briefing') return Promise.resolve({ data: { briefing: { good_morning: 'Morning', yesterday: 'y', priorities: [], risks: [], wins: [] }, health: { overall: 80, band: 'Good', subs: [] } } });
    if (url === '/api/admin/workforce/messages') return Promise.resolve({ data: { messages: [] } });
    if (url === '/api/admin/workforce/analytics') return Promise.resolve({ data: { employees: 3, tasks_total: 0, by_status: {}, meetings: 0, messages: 0 } });
    if (url === '/api/admin/workforce/live-agents/activity') return Promise.resolve({ data: { activity } });
    // OrgChartSection (org-chart hierarchy build) fetches its own data over
    // the same mocked `api` module — an empty-but-valid response so it
    // renders cleanly rather than surfacing an unrelated error banner in
    // these Activity-Timeline-focused tests. Its own dedicated fixtures live
    // in OrgChartSection.test.tsx.
    if (url === '/api/admin/workforce/org-chart') {
      return Promise.resolve({ data: { organization: { id: 'org-colaberry', name: 'Colaberry' }, humans: [], leadership: [], staff: [], unresolved: [], generated_at: '2026-08-19T00:00:00Z' } });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
  api.post.mockResolvedValue({ data: { meeting: { meeting_date: '2026-08-12', agenda: {}, contributions: [], action_items: [], participants: [] } } });
}

let container: HTMLDivElement;
let root: Root;

async function renderPage() {
  await act(async () => {
    root.render(<MemoryRouter><WorkforceOSPage /></MemoryRouter>);
    // Let the effect's async load() (Promise.all of already-resolved mocks) settle.
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

describe('Activity Timeline — real data only', () => {
  it('renders a real Reese event with its ticket type badge', async () => {
    mockApi({ activity: [REESE_EVENT] });
    await renderPage();

    expect(container.textContent).toContain('Activity Timeline');
    expect(container.textContent).toContain('Reached out to a struggling student');
    expect(container.textContent).toContain('Reese Outreach'); // getTicketTypeLabel('reese_autonomous_outreach')
  });

  it('renders an honest empty state when there is no real activity — correct for AI_ORG-only, Reese-free scenarios', async () => {
    mockApi({ activity: [] });
    await renderPage();

    expect(container.textContent).toContain('No activity yet');
  });

  // T008 (ticket-ux-fixes run) — Ali's live feedback: "AI org task for the timeline
  // should be clickable to go to the tickets - just like they are in the agent
  // dashboard." + "Format the time everywhere you see it to cst."
  it('makes each timeline entry a real link to its ticket, reusing the exact route pattern AgentDetailPage uses', async () => {
    mockApi({ activity: [REESE_EVENT] });
    await renderPage();

    const link = container.querySelector('a[href="/admin/tickets?open=t1"]');
    expect(link).toBeTruthy();
    expect(link?.textContent).toContain('Reached out to a struggling student');
  });

  it('renders the timeline timestamp with a CST/CDT label, never the browser-local unlabeled toLocaleString() shape', async () => {
    mockApi({ activity: [REESE_EVENT] }); // occurred_at: '2026-08-10T00:00:00Z'
    await renderPage();

    // 2026-08-10T00:00:00Z is 7:00 PM Central the prior day during CDT.
    expect(container.textContent).toContain('7:00 PM CDT');
    expect(container.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });
});
