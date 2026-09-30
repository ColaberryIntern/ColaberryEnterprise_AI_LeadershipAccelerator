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
 * not a rewritten copy of these blocks here.
 *
 * Org Chart v4 (2026-08-20, session CC-20260818-x4nk continued): the
 * Activity Timeline describe block below is REWRITTEN, not left alone — it
 * used to test the OLD flat one-row-per-ticket list fetched from
 * `/live-agents/activity`; this page now fetches `/live-agents/timeline`
 * (real lifecycle events) and renders `ActivityTimeline.tsx` (its own
 * dedicated unit tests live in `ActivityTimeline.test.tsx`, in this same
 * directory) — this file's job is the page-level WIRING (does the right
 * endpoint get called, does the result reach the component, does polling
 * work), not re-testing that component's own rendering logic.
 */

jest.mock('../../../../utils/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require('../../../../utils/api').default as { get: jest.Mock; post: jest.Mock };

const DIRECTOR = { slug: 'curriculum', name: 'Dr. Elena Vasquez', role: 'Curriculum Director', department: 'Curriculum', avatar: '#5BA63C', supervisor: 'chief_of_staff', mission: 'm', ops_domain: 'curriculum', workload: 2, status: 'active' };
const COS = { slug: 'chief_of_staff', name: 'Miles Chen', role: 'Chief of Staff', department: 'Executive', avatar: '#2E6A86', supervisor: 'ceo', mission: 'm', ops_domain: null, workload: 1, status: 'active' };

// Org Chart v4 (2026-08-20) — real LiveAgentTimelineEvent shape (see
// liveAgentsTimelineService.ts / ActivityTimeline.tsx), replacing the old
// flat LiveAgentActivityEvent fixture.
const REESE_TIMELINE_EVENT = {
  id: 'activity-1', ticket_id: 't1', ticket_number: 12, ticket_title: 'Reached out to a struggling student',
  kind: 'created', action: 'created', from_value: null, to_value: 'backlog',
  actor_display_name: 'Reese', occurred_at: '2026-08-10T00:00:00Z',
};

function mockApi({ timeline = [REESE_TIMELINE_EVENT] }: { timeline?: any[] }) {
  api.get.mockImplementation((url: string) => {
    if (url === '/api/admin/workforce/roster') return Promise.resolve({ data: { employees: [COS, DIRECTOR] } });
    if (url === '/api/admin/workforce/briefing') return Promise.resolve({ data: { briefing: { good_morning: 'Morning', yesterday: 'y', priorities: [], risks: [], wins: [] }, health: { overall: 80, band: 'Good', subs: [] } } });
    if (url === '/api/admin/workforce/messages') return Promise.resolve({ data: { messages: [] } });
    if (url === '/api/admin/workforce/analytics') return Promise.resolve({ data: { employees: 3, tasks_total: 0, by_status: {}, meetings: 0, messages: 0 } });
    if (url === '/api/admin/workforce/live-agents/timeline') return Promise.resolve({ data: { timeline } });
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

describe('Activity Timeline — real data, fetched from the new /live-agents/timeline endpoint', () => {
  it('fetches /live-agents/timeline (not the old /live-agents/activity) and renders a real event', async () => {
    mockApi({ timeline: [REESE_TIMELINE_EVENT] });
    await renderPage();

    expect(api.get).toHaveBeenCalledWith('/api/admin/workforce/live-agents/timeline');
    expect(container.textContent).toContain('Activity Timeline');
    expect(container.textContent).toContain('Reached out to a struggling student');
    expect(container.textContent).toContain('Reese');
  });

  it('renders an honest empty state when there is no real activity', async () => {
    mockApi({ timeline: [] });
    await renderPage();

    expect(container.textContent).toContain('No activity yet');
  });

  it('a fetch failure on the timeline endpoint does not surface a page-level error banner — the rest of the page (roster/briefing) still renders', async () => {
    api.get.mockImplementation((url: string) => {
      if (url === '/api/admin/workforce/roster') return Promise.resolve({ data: { employees: [COS, DIRECTOR] } });
      if (url === '/api/admin/workforce/briefing') return Promise.resolve({ data: { briefing: { good_morning: 'Morning', yesterday: 'y', priorities: [], risks: [], wins: [] }, health: { overall: 80, band: 'Good', subs: [] } } });
      if (url === '/api/admin/workforce/messages') return Promise.resolve({ data: { messages: [] } });
      if (url === '/api/admin/workforce/analytics') return Promise.resolve({ data: { employees: 3, tasks_total: 0, by_status: {}, meetings: 0, messages: 0 } });
      if (url === '/api/admin/workforce/live-agents/timeline') return Promise.reject(new Error('network error'));
      if (url === '/api/admin/workforce/org-chart') return Promise.resolve({ data: { organization: { id: 'org-colaberry', name: 'Colaberry' }, humans: [], leadership: [], staff: [], unresolved: [], generated_at: '2026-08-19T00:00:00Z' } });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    api.post.mockResolvedValue({ data: { meeting: { meeting_date: '2026-08-12', agenda: {}, contributions: [], action_items: [], participants: [] } } });

    await renderPage();

    expect(container.textContent).toContain('Morning'); // briefing rendered, no page-level error banner
    expect(container.querySelector('.wf-err')).toBeFalsy();
    expect(container.textContent).toContain('No activity yet'); // degrades to the honest empty state
  });
});

// Org Chart v4 (2026-08-20) — "real time" = a 45s client poll (execution-
// contract.md Assumption 5), independent of the main load()/standup cycle.
// Fake timers must be active BEFORE the page's own useEffect registers its
// setInterval, so this describe block renders via its own helper rather than
// the shared renderPage() (whose internal `setTimeout(resolve, 0)` flush
// would otherwise hang forever under fake timers with nothing advancing it).
//
// `jest.advanceTimersByTimeAsync` is NOT available here — this repo's
// `react-scripts` bundles its own nested Jest 27.5.1 (confirmed:
// `react-scripts/node_modules/jest/package.json`), independent of the
// workspace-root `jest@29.7.0` that command resolves under elsewhere in this
// repo — so timer advancement is manual: fire the timer synchronously, then
// flush the microtask queue with a few chained `await Promise.resolve()`
// hops (loadTimeline()'s own `await api.get(...)` chain is 1-2 hops deep;
// 3 gives headroom without a fixed real-time wait).
async function flushMicrotasks(hops = 3): Promise<void> {
  for (let i = 0; i < hops; i++) await Promise.resolve();
}

describe('Activity Timeline — polling', () => {
  beforeEach(() => { jest.useFakeTimers({ doNotFake: ['queueMicrotask'] }); });
  afterEach(() => { jest.useRealTimers(); });

  async function renderPageWithFakeTimers() {
    await act(async () => {
      root.render(<MemoryRouter><WorkforceOSPage /></MemoryRouter>);
      await flushMicrotasks();
    });
  }

  it('refetches the timeline endpoint again after 45 seconds, without re-running the full load() (no second standup POST)', async () => {
    mockApi({ timeline: [REESE_TIMELINE_EVENT] });
    await renderPageWithFakeTimers();

    const timelineCallsBefore = api.get.mock.calls.filter((c: any[]) => c[0] === '/api/admin/workforce/live-agents/timeline').length;
    const postCallsBefore = api.post.mock.calls.length;
    expect(timelineCallsBefore).toBe(1);

    await act(async () => {
      jest.advanceTimersByTime(45_000);
      await flushMicrotasks();
    });

    const timelineCallsAfter = api.get.mock.calls.filter((c: any[]) => c[0] === '/api/admin/workforce/live-agents/timeline').length;
    expect(timelineCallsAfter).toBe(2);
    expect(api.post.mock.calls.length).toBe(postCallsBefore); // standup NOT re-run by the poll
  });

  it('stops polling after unmount — no refetch fires once the component is gone', async () => {
    mockApi({ timeline: [REESE_TIMELINE_EVENT] });
    await renderPageWithFakeTimers();

    const timelineCallsBefore = api.get.mock.calls.filter((c: any[]) => c[0] === '/api/admin/workforce/live-agents/timeline').length;

    act(() => { root.unmount(); });

    await act(async () => {
      jest.advanceTimersByTime(120_000);
      await flushMicrotasks();
    });

    const timelineCallsAfter = api.get.mock.calls.filter((c: any[]) => c[0] === '/api/admin/workforce/live-agents/timeline').length;
    expect(timelineCallsAfter).toBe(timelineCallsBefore); // zero additional calls post-unmount
  });
});
