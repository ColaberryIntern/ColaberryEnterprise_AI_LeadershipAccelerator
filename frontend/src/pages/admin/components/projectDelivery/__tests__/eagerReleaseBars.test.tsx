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
 * The requirement this guards, in the operator's words: "I like these colored codes in
 * the gantt chart, but I can't see them until I select on them."
 *
 * The bars used to come from a per-project /gantt call fired on expand, so a collapsed
 * page showed one flat grey bar per project. The release spine now ships with the LIST
 * payload (two batched queries, measured at 11ms for all 30 projects), so the colours
 * are present on load.
 *
 * Asserting "no /gantt before expansion" is the part that keeps it that way: a future
 * refactor that reinstates the per-row fetch would still LOOK right on screen while
 * quietly restoring 30 round trips.
 */

const mockGet = api.get as jest.Mock;

let container: HTMLDivElement;
let root: Root;

const project = (over: Record<string, unknown> = {}) => ({
  project_id: 'p1',
  name: 'CoreOps',
  student_name: 'Quincy Nkwain Ninying',
  cohort_name: 'Cohort - July 2026',
  stage: 'discovery',
  has_repo: false,
  artifacts: 0,
  tasks_total: 28,
  tasks_complete: 22,
  tasks_overdue: 0,
  tasks_pct: 79,
  starts_on: '2026-08-20',
  ends_on: '2026-10-08',
  already_case_study: false,
  readiness: { score: 31, ready: false, components: [], gaps: ['no repo'] },
  releases: [
    { release_key: 'r0', display_name: 'Release 0 · Initial Setup', total: 3, complete: 3, overdue: 0, starts_on: '2026-08-20', ends_on: '2026-08-28' },
    { release_key: 'r1', display_name: 'Release 1 · AI Analysis', total: 2, complete: 2, overdue: 0, starts_on: '2026-08-28', ends_on: '2026-09-06' },
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

describe('eager release bars', () => {
  it('draws coloured release bars on load, without expanding a row', async () => {
    await renderView();
    const lane = container.querySelector('[data-testid="timeline-lane"]')!;
    expect(lane).not.toBeNull();
    // Two release bars plus the "today" marker; the point is that bars exist at all
    // before any interaction.
    const bars = lane.querySelectorAll('.position-absolute');
    expect(bars.length).toBeGreaterThanOrEqual(2);
  });

  it('fires NO /gantt request before the row is expanded', async () => {
    await renderView();
    const calls = mockGet.mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes('/gantt'))).toBe(false);
    expect(calls.some((u) => u.includes('/evidence'))).toBe(false);
    expect(calls.some((u) => u.includes('/artifacts'))).toBe(false);
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

  it('falls back to a plain span when a project has no releases', async () => {
    mockGet.mockResolvedValue({ data: { projects: [project({ releases: [] })] } });
    await renderView();
    expect(container.querySelector('[data-testid="timeline-lane"]')).not.toBeNull();
  });

  it('shows the labelled case-study KPI on the collapsed row', async () => {
    await renderView();
    expect(container.textContent).toContain('Case Study');
    expect(container.textContent).toContain('31');
  });
});
