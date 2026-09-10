import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import api from '../../../../../utils/api';
import ProjectDeliveryView from '../../ProjectDeliveryView';

jest.mock('../../../../../utils/api', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

/**
 * The requirement this guards, in the operator's words: "I like these colored codes
 * in the gantt chart, but I can't see them until I select on them."
 *
 * The release spine ships with the LIST payload (two batched queries, measured at
 * 11ms for all 30 projects), so the colours are present on load. Asserting "no
 * /gantt before expansion" is what keeps it that way: a refactor that reinstated the
 * per-row fetch would still LOOK right while quietly restoring 30 round trips.
 *
 * Updated for the compact table layout: the date-axis lane was replaced by a
 * segmented task bar plus a release strip, so the assertions target those.
 */

const mockGet = api.get as jest.Mock;

let container: HTMLDivElement;
let root: Root;

// CoreOps as production actually holds it: 28 tasks, 22 done, and 10 of those 22
// carry no due date. So `undated` (INCOMPLETE and unscheduled) is 0 while `no_date`
// (unscheduled, complete or not) is 10. The five exclusive buckets sum to `total`;
// `no_date` deliberately sits outside that sum.
const buckets = (over: Record<string, number> = {}) => ({
  total: 28, done: 22, overdue: 3, due_this_week: 1, open: 2, undated: 0, no_date: 10, ...over,
});

const project = (over: Record<string, unknown> = {}) => ({
  project_id: 'p1',
  name: 'CoreOps',
  student_name: 'Quincy Nkwain Ninying',
  cohort_name: 'Cohort - July 2026',
  stage: 'discovery',
  has_repo: false,
  repo_url: null,
  command_center_url: null,
  artifacts: 0,
  tasks_total: 28,
  tasks_complete: 22,
  tasks_overdue: 3,
  tasks_pct: 79,
  starts_on: '2026-08-20',
  ends_on: '2026-10-08',
  already_case_study: false,
  readiness: { score: 31, ready: false, components: [], gaps: ['no repo', 'no artifacts'] },
  buckets: buckets(),
  releases: [
    { release_key: 'r0', display_name: 'Release 0 · Initial Setup', total: 3, complete: 3, overdue: 0, starts_on: '2026-08-20', ends_on: '2026-08-28', state: 'landed', buckets: buckets({ total: 3, done: 3, overdue: 0, due_this_week: 0, open: 0, undated: 0, no_date: 0 }) },
    { release_key: 'r1', display_name: 'Release 1 · AI Analysis', total: 2, complete: 0, overdue: 2, starts_on: '2026-08-28', ends_on: '2026-09-06', state: 'overdue', buckets: buckets({ total: 2, done: 0, overdue: 2, due_this_week: 0, open: 0, undated: 0, no_date: 0 }) },
  ],
  ...over,
});

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { projects: [project()] } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

async function renderView() {
  await act(async () => {
    root.render(<MemoryRouter><ProjectDeliveryView /></MemoryRouter>);
  });
}

describe('compact portfolio row — visible without expanding', () => {
  it('renders the release strip on load, one segment per release', async () => {
    await renderView();
    const strip = container.querySelector('[aria-label^="2 releases"]');
    expect(strip).not.toBeNull();
    expect(strip!.children.length).toBe(2);
  });

  it('renders the segmented task bar with its state breakdown announced', async () => {
    await renderView();
    const bar = container.querySelector('[aria-label*="done"][aria-label*="overdue"]');
    expect(bar).not.toBeNull();
    expect(bar!.getAttribute('aria-label')).toContain('22 done');
    expect(bar!.getAttribute('aria-label')).toContain('3 overdue');
  });

  it('shows the done/total count and flags unscheduled tasks separately', async () => {
    // The caption is the only place unscheduled tasks are reported, and it must key
    // on `no_date`, not `undated`. On production EVERY task lacking a due date is
    // already complete, so `undated` is 0 portfolio-wide — a caption keyed on it
    // would never render and 37 unscheduled tasks would go unreported. This fixture
    // is that exact shape: undated 0, no_date 10.
    await renderView();
    expect(container.textContent).toContain('22/28');
    expect(container.textContent).toContain('10 undated');
  });

  it('fires NO /gantt request before the row is expanded', async () => {
    await renderView();
    const calls = mockGet.mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes('/gantt'))).toBe(false);
    expect(calls.some((u) => u.includes('/evidence'))).toBe(false);
  });

  it('makes exactly ONE request to render the whole list', async () => {
    // Regression guard against reintroducing an N+1: the count must not scale with
    // the number of projects.
    mockGet.mockResolvedValue({
      data: { projects: [project(), project({ project_id: 'p2', name: 'Ambit' }), project({ project_id: 'p3', name: 'Ledgerly' })] },
    });
    await renderView();
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(String(mockGet.mock.calls[0][0])).toContain('/api/admin/projects/delivery');
  });

  it('never renders the case score as an unexplained number', async () => {
    // This is the defect that started the whole KPI work: the operator saw a bare
    // pill and asked "what is the number all the way to the right?". In the compact
    // table the COLUMN HEADER carries the label rather than inline text, so the
    // guarantee is checked three ways instead.
    await renderView();

    // 1. the column header names it
    expect(container.textContent).toContain('Case');
    // 2. the value is announced with its meaning and scale
    const kpi = container.querySelector('[aria-label*="Case Study readiness"]');
    expect(kpi).not.toBeNull();
    expect(kpi!.getAttribute('aria-label')).toContain('31');
    expect(kpi!.getAttribute('aria-label')).toContain('100');
    // 3. hovering explains how the number was reached
    expect(kpi!.getAttribute('title') || '').toContain('Case Study Readiness');
  });

  it('keeps the Command Center and repo links when the project has them', async () => {
    // Merged from another session's work; a layout rewrite must not drop them.
    mockGet.mockResolvedValue({
      data: { projects: [project({
        command_center_url: 'https://acme.github.io/thing',
        repo_url: 'https://github.com/acme/thing',
      })] },
    });
    await renderView();
    const hrefs = Array.from(container.querySelectorAll('a[href]')).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('https://acme.github.io/thing');
    expect(hrefs).toContain('https://github.com/acme/thing');
  });

  it('renders a project with no releases without crashing', async () => {
    mockGet.mockResolvedValue({
      data: { projects: [project({ releases: [], buckets: buckets({ total: 0, done: 0, overdue: 0, due_this_week: 0, open: 0, undated: 0, no_date: 0 }) })] },
    });
    await renderView();
    expect(container.textContent).toContain('no releases');
  });
});
