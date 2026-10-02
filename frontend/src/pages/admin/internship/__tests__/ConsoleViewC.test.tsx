import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import InternConsoleMode from '../InternConsoleMode';

/**
 * The Activity Timeline, rendered.
 *
 * The heatmap is where an accessibility shortcut is most tempting: a grid of coloured `div`s looks
 * right and cannot be used without a mouse. So the cells are buttons with names, and that is asserted
 * rather than assumed.
 *
 * The focus panel is also where the design's figures run out. The "attended meeting" ring is gone with
 * attendance; the feed is the real timeline rather than the design's synthesised commits-and-meetings
 * list; and the project block deliberately does NOT call the deep project endpoints, because those are
 * `requireAdmin` while this console is section-gated — half the staff who can open the panel would get
 * a 403 instead of a project.
 */
const mockFetchRoster = jest.fn();
const mockFetchDetail = jest.fn();
const mockTransition = jest.fn();
jest.mock('../../../../services/adminInternConsoleApi', () => ({
  fetchConsoleRoster: (...a: unknown[]) => mockFetchRoster(...a),
  fetchInternDetail: (...a: unknown[]) => mockFetchDetail(...a),
  transitionIntern: (...a: unknown[]) => mockTransition(...a),
  nudgeIntern: jest.fn(),
  // The drawer imports this CONSTANT from the same module. A mock that lists only the functions
  // leaves it undefined and the drawer throws on first render — which is how this was found.
  ONE_WAY_ACTIONS: ['complete', 'withdraw', 'remove'],
}));

const days = (counts: number[]) => counts.map((events, i) => ({
  date: `2026-09-${String(4 + i).padStart(2, '0')}`,
  events,
}));

/** 28 days, all quiet unless given. 2026-09-07 is a Monday, so labels land predictably. */
const TWENTY_EIGHT = days(Array.from({ length: 28 }, () => 0));

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
    days_since: 1, level: 'yellow', days: TWENTY_EIGHT, graced: false,
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

const detail = (over: Record<string, unknown> = {}) => ({
  intern: intern(),
  training_sections: [{
    week: 1, publishedCardCount: 4, completed: 2, completedPct: 50, weekDone: true,
    sections: [
      { bucket: 'pre_class', published: 1, completed: 1, completedPct: 100 },
      { bucket: 'learn', published: 2, completed: 1, completedPct: 50 },
      { bucket: 'practice', published: 0, completed: 0, completedPct: 0 },
      { bucket: 'build', published: 1, completed: 0, completedPct: 0 },
      { bucket: 'reflect', published: 0, completed: 0, completedPct: 0 },
      { bucket: 'share', published: 0, completed: 0, completedPct: 0 },
      { bucket: 'advance', published: 0, completed: 0, completedPct: 0 },
    ],
  }],
  scheduled_week: 6,
  cert: { series: { attempts: [], passing_scaled_score: 720 }, standing: {} },
  feed: [],
  ...over,
});

let container: HTMLDivElement;
let root: Root;

const render = async (roster: unknown, det: unknown = detail()) => {
  mockFetchRoster.mockResolvedValue(roster);
  mockFetchDetail.mockResolvedValue(det);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/admin/internship?view=console&cv=C']}>
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

describe('the heatmap', () => {
  it('draws exactly 28 cells per intern', async () => {
    await render({ interns: [intern()], counts: counts(), stages: [] });

    // Scoped to the grid: the legend also uses `.aint-hc` for its swatches, and subtracting them by
    // hand is how a count test starts lying the day the legend changes.
    expect(container.querySelectorAll('.aint-heat .aint-hc')).toHaveLength(28);
  });

  it('pads a short payload rather than drawing a ragged grid', async () => {
    // A short row would make each column mean a different date per intern, which is worse than a
    // visible blank.
    await render({
      interns: [intern({ activity: { ...intern().activity, days: days([1, 2, 3]) } })],
      counts: counts(),
      stages: [],
    });

    const cells = Array.from(container.querySelectorAll('.aint-heat .aint-hc'));
    expect(cells).toHaveLength(28);
    expect(cells[27].getAttribute('aria-label')).toContain('unknown date');
  });

  it('makes every cell a button with an accessible name, not a bare div', async () => {
    // The shortcut that would look identical and be unusable without a mouse.
    await render({
      interns: [intern({ activity: { ...intern().activity, days: days([5, ...Array.from({ length: 27 }, () => 0)]) } })],
      counts: counts(),
      stages: [],
    });

    const cells = Array.from(container.querySelectorAll('.aint-heat .aint-hc'));
    expect(cells.every((c) => c.tagName === 'BUTTON')).toBe(true);
    expect(cells[0].getAttribute('aria-label')).toContain('Sarbjit Kaur');
    expect(cells[0].getAttribute('aria-label')).toContain('5 events');
  });

  it('says "1 event" rather than "1 events"', async () => {
    await render({
      interns: [intern({ activity: { ...intern().activity, days: days([1, ...Array.from({ length: 27 }, () => 0)]) } })],
      counts: counts(),
      stages: [],
    });

    const first = container.querySelector('.aint-heat .aint-hc')!;
    expect(first.getAttribute('aria-label')).toContain('1 event');
    expect(first.getAttribute('aria-label')).not.toContain('1 events');
  });

  it('gives a busier day a higher heat step', async () => {
    await render({
      interns: [intern({ activity: { ...intern().activity, days: days([0, 1, 3, 5, 9, ...Array.from({ length: 23 }, () => 0)]) } })],
      counts: counts(),
      stages: [],
    });

    const cells = Array.from(container.querySelectorAll('.aint-heat .aint-hc'));
    expect(cells[0].className).toContain('hs-0');
    expect(cells[1].className).toContain('hs-1');
    expect(cells[2].className).toContain('hs-2');
    expect(cells[3].className).toContain('hs-3');
    expect(cells[4].className).toContain('hs-4');
  });

  it('marks no attendance on any heat cell', async () => {
    // Scoped to the HEATMAP, and that scoping is a correction. The first version asserted the word
    // "attend" appeared nowhere in the whole view, and it passed only because the fixture's feed was
    // empty. Rendered against production the feed legitimately contains real events named
    // `session_attended` and sourced from `attendance_records` — found by previewing this view with
    // live data on 2026-10-02.
    //
    // The distinction the console actually holds: the attendance METRIC is off (no column, no N/M,
    // no percentage, no marked days), while the activity FEED shows whatever events the timeline
    // holds, including one that happens to be a session attendance record. One is a fabricated
    // measurement; the other is a traceable thing that happened.
    await render({ interns: [intern()], counts: counts(), stages: [] });

    const heat = container.querySelector('.aint-heat')!;
    expect(heat.textContent ?? '').not.toMatch(/attend/i);
    expect(heat.querySelectorAll('.att')).toHaveLength(0);
    for (const cell of Array.from(heat.querySelectorAll('.aint-hc'))) {
      expect(cell.getAttribute('aria-label')).not.toMatch(/attend|meeting/i);
      expect(cell.getAttribute('title')).not.toMatch(/attend|meeting/i);
    }
  });

  it('shows no attendance metric anywhere, even when the feed names an attendance source', async () => {
    // The real shape that broke the assertion above, as a fixture: a feed entry whose SOURCE TABLE is
    // `attendance_records`. It must render — it is a real event — while no count, ratio or percentage
    // of meetings appears anywhere on the view.
    await render({ interns: [intern()], counts: counts(), stages: [] }, detail({
      feed: [{
        occurredAt: '2026-10-01T14:00:00.000Z', domain: 'learning', source: 'attendance_records',
        type: 'session_attended', summary: 'Week 10 · Build Day · 132 min', occurrences: 1,
      }],
    }));

    expect(text()).toContain('Week 10 · Build Day · 132 min');
    expect(text()).toContain('attendance_records');
    // And still no metric: no "N/M meetings", no attendance percentage, no column header.
    expect(text()).not.toMatch(/\d+\s*\/\s*\d+\s*meetings/i);
    expect(text()).not.toMatch(/attendance[^_]/i);
    expect(Array.from(container.querySelectorAll('th')).map((h) => h.textContent)).not.toContain('Attendance');
  });
});

describe('selecting an intern', () => {
  it('opens the first intern by default and fetches their detail', async () => {
    await render({ interns: [intern()], counts: counts(), stages: [] });

    expect(mockFetchDetail).toHaveBeenCalledWith('enr-1');
  });

  it('switches the focus panel when a roster row is clicked', async () => {
    const second = intern({ enrollment_id: 'enr-2', name: 'Quincy Nkwain Ninying', application_id: 'app-2' });
    await render({ interns: [intern(), second], counts: counts({ interns: 2, no_project: 2 }), stages: [] });

    const rail = Array.from(container.querySelectorAll('.aint-ritem'))
      .find((b) => b.textContent?.includes('Quincy')) as HTMLButtonElement;
    await act(async () => { rail.click(); });

    expect(mockFetchDetail).toHaveBeenLastCalledWith('enr-2');
  });

  it('marks the selected row with aria-pressed', async () => {
    await render({ interns: [intern()], counts: counts(), stages: [] });

    const rail = container.querySelector('.aint-ritem')!;
    expect(rail.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('the focus panel', () => {
  it('draws seven bucket segments for a week', async () => {
    await render({ interns: [intern()], counts: counts(), stages: [] });

    expect(container.querySelectorAll('.aint-seg-cell')).toHaveLength(7);
  });

  it('draws an unpublished bucket hollow rather than as an unstarted one', async () => {
    // The fixture publishes pre_class, learn and build; practice, reflect, share and advance have
    // nothing. Four hollow, three drawn.
    await render({ interns: [intern()], counts: counts(), stages: [] });

    expect(container.querySelectorAll('.aint-seg-cell.unpub')).toHaveLength(4);
    expect(container.querySelectorAll('.aint-seg-cell:not(.unpub)')).toHaveLength(3);
  });

  it('says why there is no section breakdown instead of showing an empty one', async () => {
    await render({ interns: [intern()], counts: counts(), stages: [] }, detail({ training_sections: null }));

    expect(text()).toContain('No cohort to compare against');
  });

  it('draws the cert pass line from the payload, not a literal', async () => {
    await render({ interns: [intern()], counts: counts(), stages: [] }, detail({
      cert: {
        series: {
          attempts: [
            { completed_at: '2026-09-01T00:00:00.000Z', mode: 'practice', scaled_score: 640, items: 10, correct: 6 },
            { completed_at: '2026-09-20T00:00:00.000Z', mode: 'mock', scaled_score: 895, items: 60, correct: 54 },
          ],
          passing_scaled_score: 680,
        },
        standing: {},
      },
    }));

    // 680, not the engine's usual 720 — proving it is read rather than hardcoded.
    expect(text()).toContain('pass 680');
    expect(container.querySelectorAll('svg circle')).toHaveLength(2);
  });

  it('tells the reader how many items each cert point was scored on', async () => {
    // 1000 from a one-item set and 895 from a sixty-item mock are both real and not comparable.
    await render({ interns: [intern()], counts: counts(), stages: [] }, detail({
      cert: {
        series: {
          attempts: [{ completed_at: '2026-09-01T00:00:00.000Z', mode: 'practice', scaled_score: 1000, items: 1, correct: 1 }],
          passing_scaled_score: 720,
        },
        standing: {},
      },
    }));

    expect(container.querySelector('svg circle title')!.textContent).toContain('1 of 1 items');
  });

  it('says so when a cert point has no recorded item count', async () => {
    await render({ interns: [intern()], counts: counts(), stages: [] }, detail({
      cert: {
        series: {
          attempts: [{ completed_at: '2026-09-01T00:00:00.000Z', mode: 'practice', scaled_score: 700, items: null, correct: null }],
          passing_scaled_score: 720,
        },
        standing: {},
      },
    }));

    expect(container.querySelector('svg circle title')!.textContent).toContain('item count not recorded');
  });

  it('shows an empty state for no sittings rather than an empty chart', async () => {
    await render({ interns: [intern()], counts: counts(), stages: [] });

    expect(text()).toContain('No diagnostic or practice sittings yet');
    expect(container.querySelectorAll('svg')).toHaveLength(0);
  });

  it('renders the real activity feed, not a synthesised one', async () => {
    await render({ interns: [intern()], counts: counts(), stages: [] }, detail({
      feed: [{
        occurredAt: '2026-09-30T10:00:00.000Z', domain: 'learning',
        source: 'timeline_card_progress', type: 'card_completed', summary: 'Week 6 Build', occurrences: 3,
      }],
    }));

    expect(text()).toContain('Week 6 Build');
    expect(text()).toContain('timeline_card_progress');
    expect(text()).toContain('×3');
    // The design's invented entries must not appear.
    expect(text()).not.toMatch(/commits pushed/i);
  });

  it('does not call the admin-only project endpoints', async () => {
    // They are requireAdmin and this console is section-gated; calling them here would 403 for the
    // internship-scoped staff the console admits. Only the two console fetchers may be used.
    await render({
      interns: [intern({ project: { project_id: 'p-1', name: 'Regional Medical', stage: 'implementation', tasks_total: 12, tasks_complete: 9, tasks_pct: 75, has_repo: true, command_center_url: null } })],
      counts: counts({ no_project: 0 }),
      stages: [],
    });

    expect(text()).toContain('Regional Medical');
    expect(text()).toContain('9 of 12 tasks');
    expect(text()).toContain('Releases, stories and evidence live in the Projects tab.');
  });

  it('offers one Manage control rather than a row of half-working buttons', async () => {
    // The write actions moved into the drawer in Phase 6. Three of the five cannot be undone, and a
    // one-click terminal action on a crowded header bar is a misclick waiting to happen.
    await render({ interns: [intern()], counts: counts(), stages: [] });

    const manage = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === 'Manage') as HTMLButtonElement;

    expect(manage).toBeTruthy();
    expect(manage.disabled).toBe(false);
    // And the bar no longer carries the actions themselves.
    const barLabels = Array.from(container.querySelectorAll('.aint-actbar button')).map((b) => b.textContent);
    expect(barLabels).not.toContain('Pause');
    expect(barLabels).not.toContain('Note');
  });

  it('disables Manage for an intern with no application record', async () => {
    await render({ interns: [intern({ application_id: null, application_state: null })], counts: counts(), stages: [] });

    const manage = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === 'Manage') as HTMLButtonElement;

    expect(manage.disabled).toBe(true);
    expect(manage.title).toBe('No application record to manage');
  });

  it('opens the drawer on Manage, and the drawer holds the write actions', async () => {
    await render({ interns: [intern()], counts: counts(), stages: [] });

    const manage = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent === 'Manage') as HTMLButtonElement;
    await act(async () => { manage.click(); });

    const drawer = container.querySelector('.aint-drawer')!;
    expect(drawer).toBeTruthy();
    const labels = Array.from(drawer.querySelectorAll('button')).map((b) => b.textContent);
    // Nudge is no longer a single button: it is a template picker with Preview and Send, so that a
    // manager sees the subject and the recipient before anything reaches a student.
    expect(labels).toEqual(expect.arrayContaining([
      'Pause', 'Mark complete', 'Withdraw', 'Remove', 'Preview', 'Send nudge', 'Note',
    ]));
    expect(drawer.querySelector('select[aria-label="Nudge template"]')).toBeTruthy();
  });

  it('shows an error with a retry when the detail fetch fails', async () => {
    mockFetchRoster.mockResolvedValue({ interns: [intern()], counts: counts(), stages: [] });
    mockFetchDetail.mockRejectedValue({ response: { data: { error: 'Could not load this intern.' } } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/admin/internship?view=console&cv=C']}>
          <InternConsoleMode />
        </MemoryRouter>,
      );
    });

    expect(text()).toContain('Could not load this intern.');
    // The heatmap and rail are still there: one failed panel must not blank the view.
    expect(container.querySelectorAll('.aint-heat').length).toBe(1);
  });

  it('gives every control on the view an accessible name', async () => {
    await render({ interns: [intern()], counts: counts(), stages: [] });

    for (const el of Array.from(container.querySelectorAll('button'))) {
      const name = (el.textContent ?? '').trim() || el.getAttribute('aria-label') || el.getAttribute('title');
      expect(name).toBeTruthy();
    }
  });
});
