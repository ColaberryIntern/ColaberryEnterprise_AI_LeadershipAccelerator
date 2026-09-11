import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import api from '../../../../../utils/api';
import ProjectDeliveryView from '../../ProjectDeliveryView';
import { sortRows, countAttention } from '../RiskControls';

jest.mock('../../../../../utils/api', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

/**
 * The requirement, in the operator's words: the board is "ranked for the wrong
 * question" — projects are ordered by case-study readiness, which puts the
 * students who have built nothing at the very bottom, below everyone who is fine.
 *
 * The fixture below is the real production shape on 2026-09-10: Firas holds four
 * projects and is one of the strongest builders in the cohort, while his empty
 * spare row looks identical to a student in trouble unless the model looks at the
 * whole portfolio. If this suite ever passes with a per-project rule, the feature
 * is broken in the way that matters — an operator emails the wrong person.
 */

const mockGet = api.get as jest.Mock;
let container: HTMLDivElement;
let root: Root;

const buckets = (over: Record<string, number> = {}) => ({
  total: 20, done: 0, overdue: 0, due_this_week: 0, open: 20, undated: 0, no_date: 0, ...over,
});

const proj = (over: Record<string, unknown> = {}) => ({
  project_id: 'p', name: 'Project', student_name: 'Someone', cohort_name: 'Cohort - July 2026',
  stage: 'discovery', has_repo: false, repo_url: null, command_center_url: null, artifacts: 0,
  tasks_total: 20, tasks_complete: 0, tasks_overdue: 0, tasks_pct: 0,
  starts_on: null, ends_on: null, already_case_study: false,
  readiness: { score: 10, ready: false, components: [], gaps: [] },
  buckets: buckets(), releases: [],
  risk: null,
  ...over,
});

// Three rows that make the ordering question concrete.
const HEALTHY = proj({
  project_id: 'coreops', name: 'CoreOps', student_name: 'Quincy Nkwain Ninying',
  tasks_total: 28, tasks_complete: 22, tasks_pct: 79,
  readiness: { score: 51, ready: false, components: [], gaps: ['no artifacts'] },
  buckets: buckets({ total: 28, done: 22, open: 6 }),
  risk: { state: 'on_track', attention: 0, reason: '22 of 28 done, nothing overdue', owner_projects: 2, owner_complete: 35 },
});
const SPARE = proj({
  project_id: 'ledgerly-empty', name: 'Ledgerly Accounting', student_name: 'Firas',
  tasks_total: 27, tasks_complete: 0,
  readiness: { score: 8, ready: false, components: [], gaps: ['no build plan'] },
  buckets: buckets({ total: 27, open: 27 }),
  risk: { state: 'dormant', attention: 100, reason: 'A spare project — this student is building elsewhere', owner_projects: 4, owner_complete: 38 },
});
const STALLED = proj({
  project_id: 'peace', name: 'Peace Of Mind', student_name: 'Shekia Phillips',
  tasks_total: 21, tasks_complete: 0, tasks_overdue: 9,
  readiness: { score: 6, ready: false, components: [], gaps: ['no build plan'] },
  buckets: buckets({ total: 21, overdue: 9, open: 12 }),
  risk: { state: 'stalled', attention: 1009, reason: 'Nothing completed yet — 9 tasks are overdue', owner_projects: 1, owner_complete: 0 },
});

beforeEach(() => {
  mockGet.mockReset();
  // Server order: readiness descending, which is what the API returns.
  mockGet.mockResolvedValue({ data: { projects: [HEALTHY, SPARE, STALLED] } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

async function renderView() {
  await act(async () => { root.render(<MemoryRouter><ProjectDeliveryView /></MemoryRouter>); });
}

function rowOrder(): string[] {
  return Array.from(container.querySelectorAll('[data-testid], span'))
    .map((n) => n.textContent || '')
    .filter((t) => ['CoreOps', 'Ledgerly Accounting', 'Peace Of Mind'].includes(t.trim()))
    .map((t) => t.trim());
}

function clickAttention() {
  const btn = Array.from(container.querySelectorAll('button'))
    .find((b) => (b.textContent || '').includes('Needs attention'));
  expect(btn).toBeTruthy();
  act(() => { btn!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

describe('the two orderings', () => {
  it('defaults to the order the server sent — readiness first', async () => {
    // The page's job is case-study conversion; that stays the default.
    await renderView();
    expect(rowOrder()).toEqual(['CoreOps', 'Ledgerly Accounting', 'Peace Of Mind']);
  });

  it('puts the student who has built nothing FIRST once switched', async () => {
    await renderView();
    clickAttention();
    expect(rowOrder()[0]).toBe('Peace Of Mind');
  });

  it('does NOT promote a strong builder\'s spare row above a stalled student', async () => {
    // Firas has 38 tasks complete elsewhere. His empty row must stay below the
    // person with nothing, however empty it looks in isolation.
    await renderView();
    clickAttention();
    const order = rowOrder();
    expect(order.indexOf('Peace Of Mind')).toBeLessThan(order.indexOf('Ledgerly Accounting'));
  });

  it('counts only genuinely stalled students on the badge, not empty rows', async () => {
    // One stalled student in this fixture, not two — the spare row is not a person.
    await renderView();
    const btn = Array.from(container.querySelectorAll('button'))
      .find((b) => (b.textContent || '').includes('Needs attention'));
    expect(btn!.textContent).toContain('1');
  });

  it('is a re-order, never a filter — every project stays on screen', async () => {
    // Hiding the healthy projects would make the cohort look worse than it is.
    await renderView();
    clickAttention();
    expect(rowOrder()).toHaveLength(3);
  });
});

describe('the risk pill', () => {
  it('labels the stalled student and the spare row', async () => {
    await renderView();
    expect(container.textContent).toContain('Not started');
    expect(container.textContent).toContain('Spare project');
  });

  it('stays silent on a healthy project', async () => {
    // 15 of 30 projects are on track; a green pill on each is noise, not signal.
    mockGet.mockResolvedValue({ data: { projects: [HEALTHY] } });
    await renderView();
    expect(container.textContent).not.toContain('On track');
    expect(container.textContent).not.toContain('Not started');
  });

  it('carries the reason as hover text rather than only a colour', async () => {
    await renderView();
    const pill = Array.from(container.querySelectorAll('span'))
      .find((n) => (n.textContent || '').trim() === 'Not started');
    expect(pill!.getAttribute('title')).toContain('9 tasks are overdue');
  });
});

describe('sortRows / countAttention', () => {
  const rows = [HEALTHY, SPARE, STALLED] as any[];

  it('leaves readiness order untouched, without copying', () => {
    expect(sortRows(rows, 'readiness')).toBe(rows);
  });

  it('does not mutate the array it was given', () => {
    const before = rows.map((r) => r.project_id);
    sortRows(rows, 'attention');
    expect(rows.map((r) => r.project_id)).toEqual(before);
  });

  it('breaks ties on readiness so equal-risk rows keep a stable order', () => {
    const a = { ...proj({ project_id: 'a' }), readiness: { score: 40 }, risk: { attention: 500 } } as any;
    const b = { ...proj({ project_id: 'b' }), readiness: { score: 90 }, risk: { attention: 500 } } as any;
    expect(sortRows([a, b], 'attention').map((r: any) => r.project_id)).toEqual(['b', 'a']);
  });

  it('treats a row with no risk assessment as lowest attention, never a crash', () => {
    // The field is optional on the client type: an older cached payload, or a
    // deploy where the frontend lands before the backend, must still render.
    const legacy = { ...proj({ project_id: 'legacy' }), risk: undefined } as any;
    expect(() => sortRows([legacy, STALLED as any], 'attention')).not.toThrow();
    expect(sortRows([legacy, STALLED as any], 'attention')[0].project_id).toBe('peace');
    expect(countAttention([legacy])).toBe(0);
  });
});
