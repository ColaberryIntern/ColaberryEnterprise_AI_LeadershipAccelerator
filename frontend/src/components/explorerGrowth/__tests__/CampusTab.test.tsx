/**
 * Explorer Growth, Campus & outreach (2026-10-26): the campus numbers (Open House sign-ups, assignments, admissions calls, tours and
 * how far, on campus), the tracked-since note, and the staff outreach list with its two views and plain reasons.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

const mockActivity = jest.fn();
const mockOutreach = jest.fn();
jest.mock('../../../services/explorerCampusApi', () => ({
  getCampusActivity: () => mockActivity(),
  getOutreach: (view: string, limit: number) => mockOutreach(view, limit),
}));
// eslint-disable-next-line import/first
import CampusTab from '../CampusTab';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ACTIVITY = {
  explorers: 340,
  open_house: { people: 42, rsvps: 45, last_7_days: 30 },
  assignments: { completed: 612, people: 66, last_7_days: 120 },
  admissions_calls: { booked: 3, upcoming: 2, cancelled: 1, people: 3 },
  tours: { started: 10, finished: 4, by_stop: [{ stop: 2, total: 8, people: 6 }, { stop: 8, total: 8, people: 4 }] },
  on_campus: { last_24h: 25, last_7_days: 90 },
  tracked_since: '2026-10-26',
};
const ROW = {
  enrollment_id: 'e1', email: 'pat@example.com', name: 'Pat Lee', primary_state: 'ACTIVE_LEARNER', overlays: [], e_score: 30, i_score: 50,
  cards: 3, rsvps: 1, calls: 0, next_call: null, tour_furthest: 5, tour_total: 8, tour_finished: false, last_seen: null, last_contacted_at: null,
  score: 72, reasons: ["RSVP'd to an Open House", 'Campus tour: stop 5 of 8', 'Completed 3 assignments', 'Not contacted yet'],
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  mockActivity.mockReset(); mockOutreach.mockReset();
  mockActivity.mockResolvedValue(ACTIVITY);
  mockOutreach.mockImplementation((view: string) => Promise.resolve({ view, rows: view === 'reach_out' ? [ROW] : [], tracked_since: '2026-10-26' }));
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

it('shows the campus numbers and how far explorers got in the tour', async () => {
  act(() => { root.render(<MemoryRouter><CampusTab /></MemoryRouter>); });
  await flush();
  expect(q('eg-kpi-openhouse')!.textContent).toContain('42');
  expect(q('eg-kpi-openhouse')!.textContent).toContain('45 seats saved');
  expect(q('eg-kpi-assignments')!.textContent).toContain('612');
  expect(q('eg-kpi-calls')!.textContent).toContain('2 upcoming');
  expect(q('eg-kpi-tours')!.textContent).toContain('4 finished');
  expect(q('eg-tour-steps')!.textContent).toContain('Stop 2 of 8');
  expect(q('eg-tour-steps')!.textContent).toContain('6 people');
  expect(q('eg-tracked-since')!.textContent).toContain('Oct 26, 2026');
});

it('says so when no tour has been taken yet', async () => {
  mockActivity.mockResolvedValue({ ...ACTIVITY, tours: { started: 0, finished: 0, by_stop: [] } });
  act(() => { root.render(<MemoryRouter><CampusTab /></MemoryRouter>); });
  await flush();
  expect(q('eg-tour-none')).not.toBeNull();
});

it('lists who to reach out to with the reasons, and switches to Most engaged', async () => {
  act(() => { root.render(<MemoryRouter><CampusTab /></MemoryRouter>); });
  await flush();
  expect(mockOutreach).toHaveBeenCalledWith('reach_out', 25);
  const row = q('eg-outreach-row')!;
  expect(row.textContent).toContain('Pat Lee');
  expect(row.textContent).toContain('Campus tour: stop 5 of 8');
  // 2026-10-26: the name opens the 360; the email still starts a message
  expect(row.querySelector('a')!.getAttribute('href')).toBe('/admin/people/pat%40example.com?tab=explorer');
  expect(row.querySelector('a[href^="mailto:"]')!.getAttribute('href')).toBe('mailto:pat@example.com');
  act(() => { q('eg-view-engaged')!.click(); });
  await flush();
  expect(mockOutreach).toHaveBeenLastCalledWith('engaged', 25);
  expect(q('eg-outreach-empty')!.textContent).toContain('No explorer activity');
  expect(q('eg-view-engaged')!.getAttribute('aria-pressed')).toBe('true');
});
