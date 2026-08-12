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
 * What's under test (T007/T008/T009, Reese Phase 4 — Workforce integration):
 *  (a) the pre-existing static Director roster + office-drawer click path is
 *      UNCHANGED by this run's additive Live Agents / Activity Timeline work;
 *  (b)/(c) the new Live Agents section is generic — it renders whatever real
 *      agents the API returns, 1 or 2, never hardcoded to "Reese";
 *  (d) an empty agent list renders an honest empty state, not a fabricated card;
 *  (e)/(f) the Activity Timeline renders real events when present and an honest
 *      empty state when not — this is the "Reese-only-today" success criterion.
 */

jest.mock('../../../../utils/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require('../../../../utils/api').default as { get: jest.Mock; post: jest.Mock };

const DIRECTOR = { slug: 'curriculum', name: 'Dr. Elena Vasquez', role: 'Curriculum Director', department: 'Curriculum', avatar: '#5BA63C', supervisor: 'chief_of_staff', mission: 'm', ops_domain: 'curriculum', workload: 2, status: 'active' };
const CEO = { slug: 'ceo', name: 'Ada Sterling', role: 'Chief Executive', department: 'Executive', avatar: '#1F2A33', supervisor: null, mission: 'm', ops_domain: null, workload: 0, status: 'active' };
const COS = { slug: 'chief_of_staff', name: 'Miles Chen', role: 'Chief of Staff', department: 'Executive', avatar: '#2E6A86', supervisor: 'ceo', mission: 'm', ops_domain: null, workload: 1, status: 'active' };

const REESE_AGENT = { id: 'agent-reese', agent_name: 'Reese', agent_type: 'ai_staff_mentor', category: 'student_success', description: '', enabled: true, live_status: 'online', ticket_count: 3 };
const SECOND_AGENT = { id: 'agent-2', agent_name: 'SecondAgent', agent_type: 'ai_staff_mentor', category: null, description: '', enabled: true, live_status: 'offline', ticket_count: 1 };

const REESE_EVENT = { agent_id: 'agent-reese', agent_name: 'Reese', ticket_id: 't1', ticket_number: 12, title: 'Reached out to a struggling student', type: 'reese_autonomous_outreach', status: 'in_progress', priority: 'high', occurred_at: '2026-08-10T00:00:00Z' };

function mockApi({ liveAgents = [REESE_AGENT], activity = [REESE_EVENT] }: { liveAgents?: any[]; activity?: any[] }) {
  api.get.mockImplementation((url: string) => {
    if (url === '/api/admin/workforce/roster') return Promise.resolve({ data: { employees: [CEO, COS, DIRECTOR] } });
    if (url === '/api/admin/workforce/briefing') return Promise.resolve({ data: { briefing: { good_morning: 'Morning', yesterday: 'y', priorities: [], risks: [], wins: [] }, health: { overall: 80, band: 'Good', subs: [] } } });
    if (url === '/api/admin/workforce/messages') return Promise.resolve({ data: { messages: [] } });
    if (url === '/api/admin/workforce/analytics') return Promise.resolve({ data: { employees: 3, tasks_total: 0, by_status: {}, meetings: 0, messages: 0 } });
    if (url === '/api/admin/workforce/live-agents') return Promise.resolve({ data: { agents: liveAgents } });
    if (url === '/api/admin/workforce/live-agents/activity') return Promise.resolve({ data: { activity } });
    if (url.startsWith('/api/admin/workforce/employee/')) return Promise.resolve({ data: { employee: { ...DIRECTOR, responsibilities: ['r1'], kpis: ['k1'] }, review: { overall: 80, completion_pct: 50, scores: {} }, tasks: [], memory: [] } });
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

describe('Director roster — unchanged regression', () => {
  it('still renders a Director tile and clicking it still opens the office drawer (openOffice unchanged)', async () => {
    mockApi({});
    await renderPage();

    expect(container.textContent).toContain('Dr. Elena Vasquez');
    expect(container.textContent).toContain('Curriculum Director');

    const tile = Array.from(container.querySelectorAll('.wf-emp')).find((el) => el.textContent?.includes('Dr. Elena Vasquez')) as HTMLElement;
    expect(tile).toBeTruthy();

    await act(async () => {
      tile.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(api.get).toHaveBeenCalledWith('/api/admin/workforce/employee/curriculum');
    expect(container.textContent).toContain('Responsibilities');
  });
});

describe('Live Agents section — generic, real data', () => {
  it('renders Reese with real data when the API returns exactly 1 live agent', async () => {
    mockApi({ liveAgents: [REESE_AGENT] });
    await renderPage();

    expect(container.textContent).toContain('Live Agents');
    expect(container.textContent).toContain('Reese');
    const link = container.querySelector('a[href="/admin/agents/agent-reese"]');
    expect(link).toBeTruthy();
  });

  it('renders a second agent automatically — proves the section is generic, not Reese-hardcoded', async () => {
    mockApi({ liveAgents: [REESE_AGENT, SECOND_AGENT] });
    await renderPage();

    expect(container.textContent).toContain('Reese');
    expect(container.textContent).toContain('SecondAgent');
    expect(container.querySelector('a[href="/admin/agents/agent-2"]')).toBeTruthy();
  });

  it('renders an honest empty state when there are zero live agents — never a fabricated card', async () => {
    // Internally consistent with the real backend: listLiveAgents() and
    // listLiveAgentActivity() are both empty whenever zero blueprint AdminUser rows
    // exist (see liveAgentsService.test.ts's "returns an empty array" case) — this
    // fixture mirrors that, rather than an impossible "0 agents but Reese has
    // activity" combination the real API would never actually return.
    mockApi({ liveAgents: [], activity: [] });
    await renderPage();

    expect(container.textContent).toContain('No live agents yet');
    const liveAgentsSection = Array.from(container.querySelectorAll('.wf-lab.section')).find((el) => el.textContent?.includes('Live Agents'));
    expect(liveAgentsSection).toBeTruthy();
    expect(container.querySelector('a[href^="/admin/agents/"]')).toBeFalsy();
  });
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
});
