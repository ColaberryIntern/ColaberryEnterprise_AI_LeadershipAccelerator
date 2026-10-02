import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

/**
 * The Intern Console, rendered.
 *
 * Most of these assert an ABSENCE, which is unusual and deliberate. Two stats were switched off
 * after being measured against production — attendance (7 join rows across 2 interns, no
 * denominator anywhere) and any aggregate cert score (sittings are scored on sets of 1, 10, 15 and
 * 60 items). A switched-off stat comes back by someone re-adding a column that "looks missing", so
 * the tests fail if it returns to the screen rather than only if it returns to the payload.
 *
 * The rest pin the three things the design renders wrongly against real data: a never-active intern
 * must read "never" and not "0d", a cohort with no sessions must not produce a pace badge, and an
 * unpublished week must not look like a week the intern skipped.
 */

import InternConsoleMode from '../InternConsoleMode';

/**
 * The `mock` prefix is required, not stylistic: CRA's babel-jest refuses a mock factory that
 * references any out-of-scope variable unless its name starts with `mock`. The backend's ts-jest
 * allows either, so a mock named the same as the function it replaces works there and fails here.
 */
const mockFetchRoster = jest.fn();
jest.mock('../../../../services/adminInternConsoleApi', () => ({
  fetchConsoleRoster: (...a: unknown[]) => mockFetchRoster(...a),
}));

const week = (w: number | null, published: number, completed: number) => ({
  week: w,
  publishedCardCount: published,
  completed,
  completedPct: published ? Math.round((completed / published) * 1000) / 10 : 0,
  weekDone: published > 0 && completed / published >= 0.3,
});

const intern = (over: Record<string, unknown> = {}) => ({
  enrollment_id: 'enr-1',
  name: 'Sarbjit Kaur',
  email: 'sarbjit@example.com',
  application_state: 'active',
  application_id: 'app-1',
  joined_at: '2026-09-22T00:00:00.000Z',
  day: 10,
  cohort: { id: 'c-1', name: 'Explorer', type: 'explorer' },
  activity: {
    last_activity_at: '2026-09-30T00:00:00.000Z', last_activity_source: 'xp_events',
    days_since: 1, level: 'yellow', days: [], graced: false,
  },
  training: {
    weeks: [week(1, 10, 8), week(2, 10, 8), week(3, 10, 8)],
    weeks_completed: 3, weeks_1_3_clear: true,
    pace: null, pace_unavailable: 'cohort_has_no_sessions',
  },
  cert: { sittings: 0, completed: 0, last_sitting_at: null, available: true },
  project: null,
  ...over,
});

const counts = (over: Record<string, number> = {}) => ({
  interns: 1, weeks_1_3_clear: 1, no_project: 1, quiet_4_plus: 0, dark_10_plus: 0,
  never_active: 0, cert_started: 0, paused: 0, pace_unavailable: 1, ...over,
});

let container: HTMLDivElement;
let root: Root;

const render = async (roster: unknown) => {
  mockFetchRoster.mockResolvedValue(roster);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<MemoryRouter><InternConsoleMode /></MemoryRouter>);
  });
};

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  container?.remove();
  jest.clearAllMocks();
});

const text = () => container.textContent ?? '';

describe('the stats that are switched off', () => {
  it('renders no attendance anywhere on the screen', async () => {
    // Not just absent from the payload — absent from the rendered output, because a column that
    // "looks missing" is exactly what someone re-adds.
    await render({ interns: [intern()], counts: counts() });

    expect(text()).not.toMatch(/attend/i);
    expect(text()).not.toMatch(/meeting/i);
    expect(container.querySelectorAll('th')).toHaveLength(7);
  });

  it('renders no aggregate cert score', async () => {
    await render({
      interns: [intern({ cert: { sittings: 60, completed: 51, last_sitting_at: '2026-10-01T00:00:00.000Z', available: true } })],
      counts: counts({ cert_started: 1 }),
    });

    expect(text()).toContain('60 sittings');
    // 1000 came from a 10-item set and 895 from a 60-item mock; neither belongs in a roster cell.
    expect(text()).not.toMatch(/\b(1000|895|720)\b/);
  });

  it('says cert prep is off rather than showing zero sittings', async () => {
    await render({
      interns: [intern({ cert: { sittings: 0, completed: 0, last_sitting_at: null, available: false } })],
      counts: counts(),
    });

    expect(text()).toContain('Cert prep off');
  });
});

describe('a never-active intern', () => {
  it('reads "never", not "0d"', async () => {
    await render({
      interns: [intern({
        activity: { last_activity_at: null, last_activity_source: null, days_since: null, level: 'unknown', days: [], graced: false },
      })],
      counts: counts({ never_active: 1 }),
    });

    expect(text()).toContain('never');
    expect(text()).not.toMatch(/\b0d\b/);
  });

  it('is counted on its own KPI tile, apart from the quiet ones', async () => {
    await render({ interns: [intern()], counts: counts({ never_active: 2, dark_10_plus: 1 }) });

    expect(text()).toContain('Never active');
    expect(text()).toContain('10+ days quiet');
  });
});

describe('pace that cannot be measured', () => {
  it('says so instead of rendering a band', async () => {
    await render({ interns: [intern()], counts: counts() });

    expect(text()).toContain('No cohort schedule');
    expect(container.querySelectorAll('[class*="pace-"]')).toHaveLength(0);
  });

  it('renders a band when there IS a schedule', async () => {
    await render({
      interns: [intern({
        training: { ...intern().training, pace: { weeks_completed: 3, scheduled_week: 3, delta: 0, band: 'green' }, pace_unavailable: null },
      })],
      counts: counts({ pace_unavailable: 0 }),
    });

    expect(text()).toContain('On pace');
    expect(container.querySelectorAll('.pace-green')).toHaveLength(1);
  });

  it('tells the reader how many rows could not be paced', async () => {
    await render({ interns: [intern()], counts: counts({ pace_unavailable: 8 }) });

    expect(text()).toContain('No pace available');
  });
});

describe('the week strip', () => {
  it('draws 11 cells and outlines the three gate weeks', async () => {
    await render({ interns: [intern()], counts: counts() });

    expect(container.querySelectorAll('.aint-wk')).toHaveLength(11);
    expect(container.querySelectorAll('.aint-wk.gate')).toHaveLength(3);
  });

  it('draws an unpublished week differently from an unstarted one', async () => {
    await render({
      interns: [intern({ training: { ...intern().training, weeks: [week(1, 0, 0), week(2, 10, 0)] } })],
      counts: counts(),
    });

    const unpub = container.querySelectorAll('.aint-wk.unpub');
    // Weeks 0 and 3-10 have no row either, so they are unpublished too; week 2 is the only
    // published-but-unstarted one.
    expect(unpub.length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.aint-wk:not(.unpub)')).toHaveLength(1);
  });
});

describe('the project column', () => {
  it('says "No project" rather than 0%', async () => {
    // 8 of 10 interns. Rendering 0% would say they are building something badly.
    await render({ interns: [intern()], counts: counts() });

    expect(text()).toContain('No project');
    expect(text()).not.toMatch(/\b0% of 0 tasks\b/);
  });

  it('shows the stage and task progress when there is one', async () => {
    await render({
      interns: [intern({ project: { project_id: 'p-1', name: 'Regional Medical', stage: 'implementation', tasks_total: 12, tasks_complete: 9, tasks_pct: 75, has_repo: true, command_center_url: null } })],
      counts: counts({ no_project: 0 }),
    });

    expect(text()).toContain('Regional Medical');
    expect(text()).toContain('implementation');
    expect(text()).toContain('75% of 12 tasks');
  });
});

describe('opening an applicant', () => {
  it('disables the control for an intern with no application record', async () => {
    await render({ interns: [intern({ application_id: null, application_state: null })], counts: counts() });

    const btn = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Open applicant')) as HTMLButtonElement;

    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(true);
    expect(btn.title).toBe('No application record to open');
  });

  it('enables it when there is one', async () => {
    await render({ interns: [intern()], counts: counts() });

    const btn = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Open applicant')) as HTMLButtonElement;

    expect(btn.disabled).toBe(false);
  });
});

describe('states that are not data', () => {
  it('says the roster is empty rather than rendering an empty table', async () => {
    await render({ interns: [], counts: counts({ interns: 0 }) });

    expect(text()).toContain('No active interns yet');
  });

  it('shows an error with a retry when the fetch fails', async () => {
    mockFetchRoster.mockRejectedValue({ response: { data: { error: 'Could not load the intern console.' } } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<MemoryRouter><InternConsoleMode /></MemoryRouter>);
    });

    expect(text()).toContain('Could not load the intern console.');
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent === 'Try again')).toBe(true);
  });
});

describe('the three views', () => {
  it('offers all three, with none of them marked unbuilt any more', async () => {
    // Ali confirmed "all 3", and all three now exist — Command Center in Phase 3, Triage Board in
    // Phase 4, Activity Timeline in Phase 5. A view that is not built says "soon" rather than
    // rendering an empty panel that would read as "no data"; there is nothing left to mark.
    await render({ interns: [intern()], counts: counts() });

    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    expect(tabs.map((t) => t.textContent)).toEqual([
      'Command Center', 'Triage Board', 'Activity Timeline',
    ]);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(container.textContent).not.toContain('soon');
  });

  it('gives every interactive control an accessible name', async () => {
    // The a11y gate in Phase 7 asserts this with getByRole; this repo has no testing-library, so
    // the same property is checked directly: no control may be nameless.
    await render({ interns: [intern()], counts: counts() });

    for (const el of Array.from(container.querySelectorAll('button'))) {
      const name = (el.textContent ?? '').trim() || el.getAttribute('aria-label') || el.getAttribute('title');
      expect(name).toBeTruthy();
    }
  });

  it('marks the filter chips with aria-pressed', async () => {
    await render({ interns: [intern()], counts: counts() });

    const chips = Array.from(container.querySelectorAll('.aint-chip'));
    expect(chips).toHaveLength(4);
    expect(chips[0].getAttribute('aria-pressed')).toBe('true');
    expect(chips[1].getAttribute('aria-pressed')).toBe('false');
  });
});
