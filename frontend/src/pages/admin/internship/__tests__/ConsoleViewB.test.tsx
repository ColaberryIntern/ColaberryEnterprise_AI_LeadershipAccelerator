import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import InternConsoleMode from '../InternConsoleMode';

/**
 * The Triage Board, rendered.
 *
 * The lane rules are unit-tested in `consoleTriage.test.ts`; these check the things only a render can
 * show: that an empty lane says so rather than collapsing, that the pipeline's columns come from the
 * server's stage list, that the controls without endpoints are visibly unavailable, and — as
 * everywhere in this console — that no attendance and no aggregate cert score reach the screen.
 */
const mockFetchRoster = jest.fn();
jest.mock('../../../../services/adminInternConsoleApi', () => ({
  fetchConsoleRoster: (...a: unknown[]) => mockFetchRoster(...a),
}));

const STAGES = ['discovery', 'architecture', 'implementation', 'portfolio', 'complete'];

const intern = (over: Record<string, unknown> = {}) => ({
  enrollment_id: `enr-${Math.random()}`,
  name: 'Sarbjit Kaur',
  email: null,
  application_state: 'active',
  application_id: 'app-1',
  joined_at: '2026-09-22T00:00:00.000Z',
  day: 10,
  cohort: { id: 'c-1', name: 'Explorer', type: 'explorer' },
  activity: {
    last_activity_at: '2026-09-30T00:00:00.000Z', last_activity_source: 'xp_events',
    days_since: 1, level: 'yellow', days: [], graced: false,
  },
  training: { weeks: [], weeks_completed: 0, weeks_1_3_clear: false, pace: null, pace_unavailable: 'cohort_has_no_sessions' },
  cert: { sittings: 0, completed: 0, last_sitting_at: null, available: true },
  project: null,
  ...over,
});

const counts = (over: Record<string, number> = {}) => ({
  interns: 1, weeks_1_3_clear: 0, no_project: 1, quiet_4_plus: 0, dark_10_plus: 0,
  never_active: 0, cert_started: 0, paused: 0, pace_unavailable: 1, ...over,
});

let container: HTMLDivElement;
let root: Root;

/** Mounts the console already switched to View B via the URL, the way a refresh would. */
const render = async (roster: unknown) => {
  mockFetchRoster.mockResolvedValue(roster);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/admin/internship?view=console&cv=B']}>
        <InternConsoleMode />
      </MemoryRouter>,
    );
  });
};

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  container?.remove();
  jest.clearAllMocks();
});

const text = () => container.textContent ?? '';

describe('the board opens from the URL', () => {
  it('renders View B when ?cv=B, not the Command Center', async () => {
    await render({ interns: [intern()], counts: counts(), stages: STAGES });

    // "Triage Board" is the switcher's tab label and renders on every view, so it proves nothing.
    // These two strings only exist inside View B.
    expect(text()).toContain('Pulse');
    expect(text()).toContain('Project pipeline');
    // And the Command Center's table must not be on screen at the same time.
    expect(container.querySelectorAll('.aint-tbl')).toHaveLength(0);
  });
});

describe('the lanes', () => {
  it('renders all five lanes, whatever the roster looks like', async () => {
    await render({ interns: [intern()], counts: counts(), stages: STAGES });

    expect(container.querySelectorAll('.aint-lane')).toHaveLength(5);
  });

  it('says "Nobody here" in an empty lane instead of collapsing it', async () => {
    // An empty healthy lane is the most important thing an empty lane can tell you, so it must be
    // visible rather than absent.
    await render({ interns: [intern()], counts: counts(), stages: STAGES });

    const empties = Array.from(container.querySelectorAll('.aint-lane .aint-empty'));
    expect(empties).toHaveLength(4);   // one intern, in one lane; the other four are empty
    expect(empties[0].textContent).toBe('Nobody here');
  });

  it('puts a red and a black intern in the same at-risk lane', async () => {
    await render({
      interns: [
        intern({ activity: { ...intern().activity, days_since: 8, level: 'red' } }),
        intern({ activity: { ...intern().activity, days_since: 40, level: 'black' } }),
      ],
      counts: counts({ interns: 2, dark_10_plus: 1, quiet_4_plus: 2 }),
      stages: STAGES,
    });

    const lanes = Array.from(container.querySelectorAll('.aint-lane'));
    const atRisk = lanes.find((l) => l.textContent?.includes('At risk'))!;
    expect(atRisk.querySelectorAll('.aint-icard')).toHaveLength(2);
  });

  it('keeps a never-active intern in their own lane and reads "never"', async () => {
    await render({
      interns: [intern({ activity: { last_activity_at: null, last_activity_source: null, days_since: null, level: 'unknown', days: [], graced: false } })],
      counts: counts({ never_active: 1 }),
      stages: STAGES,
    });

    const lanes = Array.from(container.querySelectorAll('.aint-lane'));
    const own = lanes.find((l) => l.textContent?.includes('No activity yet'))!;
    expect(own.querySelectorAll('.aint-icard')).toHaveLength(1);
    expect(own.textContent).toContain('never');
    const atRisk = lanes.find((l) => l.textContent?.includes('At risk'))!;
    expect(atRisk.querySelectorAll('.aint-icard')).toHaveLength(0);
  });
});

describe('the stats that are off, on this view too', () => {
  it('renders no attendance anywhere', async () => {
    await render({ interns: [intern()], counts: counts(), stages: STAGES });

    expect(text()).not.toMatch(/attend/i);
    expect(text()).not.toMatch(/meeting/i);
  });

  it('shows sitting counts on a card, not a score', async () => {
    await render({
      interns: [intern({ cert: { sittings: 60, completed: 51, last_sitting_at: null, available: true } })],
      counts: counts({ cert_started: 1 }),
      stages: STAGES,
    });

    expect(text()).toContain('60 sittings');
    expect(text()).not.toMatch(/\b(1000|895|720)\b/);
  });

  it('distributes certification by what was sat, never by a readiness estimate', async () => {
    await render({ interns: [intern()], counts: counts(), stages: STAGES });

    expect(text()).toContain('Not started');
    expect(text()).not.toMatch(/building|approaching|sustained/i);
  });
});

describe('the project pipeline', () => {
  it('draws one column per server-declared stage, in that order', async () => {
    await render({ interns: [intern()], counts: counts(), stages: STAGES });

    const cols = Array.from(container.querySelectorAll('.aint-pipe-col h4'));
    expect(cols.map((h) => h.firstChild?.textContent)).toEqual(STAGES);
  });

  it('follows the server when the stage list changes, with no copy of its own', async () => {
    // The whole reason the list is served: a client-side copy loses a column silently.
    await render({ interns: [intern()], counts: counts(), stages: ['discovery', 'shipped'] });

    const cols = Array.from(container.querySelectorAll('.aint-pipe-col h4'));
    expect(cols.map((h) => h.firstChild?.textContent)).toEqual(['discovery', 'shipped']);
  });

  it('says "No projects" in an empty stage column', async () => {
    await render({ interns: [intern()], counts: counts(), stages: STAGES });

    const empties = Array.from(container.querySelectorAll('.aint-pipe-col .aint-empty'));
    expect(empties).toHaveLength(STAGES.length);
    expect(empties[0].textContent).toBe('No projects');
  });

  it('places a project in its stage column with its real task counts', async () => {
    await render({
      interns: [intern({ project: { project_id: 'p-1', name: 'Regional Medical', stage: 'implementation', tasks_total: 12, tasks_complete: 9, tasks_pct: 75, has_repo: true, command_center_url: null } })],
      counts: counts({ no_project: 0 }),
      stages: STAGES,
    });

    const cols = Array.from(container.querySelectorAll('.aint-pipe-col'));
    const impl = cols.find((c) => c.querySelector('h4')?.textContent?.startsWith('implementation'))!;
    expect(impl.textContent).toContain('Regional Medical');
    expect(impl.textContent).toContain('9/12');
  });
});

describe('controls without endpoints', () => {
  it('renders Nudge visibly unavailable rather than leaving it out', async () => {
    // The design promises it and Phase 6 builds it. A missing control reads as a missing feature;
    // a disabled one with a reason reads as a plan.
    await render({ interns: [intern()], counts: counts(), stages: STAGES });

    const nudge = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === 'Nudge') as HTMLButtonElement;

    expect(nudge).toBeTruthy();
    expect(nudge.disabled).toBe(true);
    expect(nudge.title).toBe('Nudge is not built yet');
  });

  it('offers no bulk nudge at all', async () => {
    // Bulk mail to students is against a standing rule here, so this one is not coming back.
    await render({ interns: [intern()], counts: counts(), stages: STAGES });

    expect(text()).not.toMatch(/nudge everyone/i);
  });

  it('gives every control on the board an accessible name', async () => {
    await render({ interns: [intern()], counts: counts(), stages: STAGES });

    for (const el of Array.from(container.querySelectorAll('button'))) {
      const name = (el.textContent ?? '').trim() || el.getAttribute('aria-label') || el.getAttribute('title');
      expect(name).toBeTruthy();
    }
  });
});

describe('a filter that matches nobody', () => {
  it('never divides by zero into a full bar', async () => {
    // A NaN CSS width renders as a FULL bar, so a roster of zero would draw every distribution at
    // 100%. An EMPTY roster cannot show this — the console short-circuits to "no interns yet" before
    // View B renders at all, which made the first version of this test pass for the wrong reason.
    // A filter matching nobody is the real path: the roster has interns, the view has none.
    await render({ interns: [intern({ application_state: 'active' })], counts: counts(), stages: STAGES });

    const paused = Array.from(container.querySelectorAll('.aint-chip'))
      .find((c) => c.textContent === 'Paused') as HTMLButtonElement;
    await act(async () => { paused.click(); });

    expect(container.querySelectorAll('.aint-icard')).toHaveLength(0);
    expect(container.querySelectorAll('.aint-lane')).toHaveLength(5);
    expect(container.innerHTML).not.toContain('NaN');
    // And every distribution bar is empty rather than full.
    for (const bar of Array.from(container.querySelectorAll('.aint-dist-row .aint-bar > span'))) {
      expect((bar as HTMLElement).style.width).toBe('0%');
    }
  });

  it('still says the roster itself is not empty', async () => {
    await render({ interns: [], counts: counts({ interns: 0, no_project: 0, pace_unavailable: 0 }), stages: STAGES });

    expect(text()).toContain('No active interns yet');
  });
});
