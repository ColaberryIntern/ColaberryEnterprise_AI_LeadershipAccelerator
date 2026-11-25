import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act, Simulate } from 'react-dom/test-utils';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router-dom';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Studio setup home (WL3.5): four tabs for full administrators, the class list alone for everyone else, and every state of a plan. */
jest.mock('../../../../utils/api', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn().mockResolvedValue({ data: { has_portal_account: true } }) } }));
jest.mock('../../../../services/studioSetupApi', () => ({ ...jest.requireActual('../../../../services/studioSetupApi'), listStudioSessions: jest.fn() }));
jest.mock('../../../../services/weeklyLivePlanApi', () => ({ ...jest.requireActual('../../../../services/weeklyLivePlanApi'), getPlanSetup: jest.fn(), getPlan: jest.fn(), startPlan: jest.fn(), regeneratePlan: jest.fn(), chooseTopic: jest.fn() }));

import { listStudioSessions } from '../../../../services/studioSetupApi';
import * as plans from '../../../../services/weeklyLivePlanApi';
import StudioIndexPage from '../StudioIndexPage';
import { POLL_MS } from '../plan/PlanTab';
import { nextMonday } from '../plan/planModel';

const api = plans as jest.Mocked<typeof plans>;
const weeks = Array.from({ length: 12 }, (_, i) => ({ week: i + 1, theme: `Theme ${i + 1}`, intensive: 'I', timesCovered: i === 1 ? 1 : 0, lastCovered: i === 1 ? '2026-11-23' : null, lastTitle: i === 1 ? 'Ep 1' : null, daysAgo: i === 1 ? 2 : null, coveredInLast4: i === 1, planned: i === 2 ? { date: '2026-11-30', title: 'Ep 2' } : null }));
const demand = weeks.map((w) => ({ week: w.week, video_url: null, video_title: null, channel: null, views: 10, multiple: w.week === 3 ? null : 3.5, score: w.week === 3 ? 2 : 4, thin_median: w.week === 4, measured_at: '2026-11-25', failed: w.week === 5 }));
const setup = (over: Partial<plans.PlanSetup> = {}): plans.PlanSetup => ({ batch: { ok: true, cohortId: 'c', cohortName: 'Cohort - November 2026' }, map: { asOf: '2026-11-25', recentWeeks: [2], weeks }, demand, latestPlanId: 'p1', sessions: [{ id: 'x', date: '2020-01-06', title: 'An old class', week: 2, status: 'completed' }, { id: 'y', date: '2099-01-05', title: 'A future class', week: null, status: 'scheduled' }], ...over });
const signal = (id: string, factors: number[], over: Partial<plans.PlanSignal> = {}): plans.PlanSignal => ({ id, headline: `Story ${id}`, publisher: 'Outlet', url: `https://example.com/${id}`, published_at: '2026-11-19', date_confirmed: true, factors, fits_weeks: [3], idea: 'A hook idea', dropped_reason: null, ...over });
const topic = (rank: number, over: Partial<plans.PlanTopic> = {}): plans.PlanTopic => ({
  id: `t${rank}`, rank, week: 3, title: `Topic ${rank}`, spin: 'The spin.', parody: 'The parody.', hooks: [{ text: 'Hook one', viral: 85 }, { text: 'Hook two', viral: 80 }], package: { long_video: 'LV', shorts: 'S', thumbnail: 'TH' }, marketing: { before: 'B', class_day: 'C', after: 'A' },
  signals_used: ['s1'], teach_lines: { demand: { score: 4, why: 'Measured' }, proof: { score: 5, why: 'On screen' } }, teach: 88, viral: 85, convert: 91, topic_score: 92 - rank * 3, factors: [5, 9], warnings: rank === 2 ? [{ code: 'jumps_ahead', message: 'Week 9 is ahead.' }] : [], recommended: rank === 1, ...over,
});
const view = (over: Partial<plans.PlanView['plan']> = {}, rest: Partial<plans.PlanView> = {}): plans.PlanView => ({
  plan: { id: 'p1', air_date: '2026-11-30', cohort_id: 'c', status: 'ready', stage: 'done', error: null, note: null, cost_usd: 0.4, chosen_topic_id: null, inputs: { week: 'auto' }, ...over },
  demand, signals: [signal('s1', [5, 9]), signal('s2', [7], { published_at: null, date_confirmed: false, idea: null }), signal('s3', [1], { dropped_reason: 'HTTP 403' })], topics: [1, 2, 3, 4, 5].map((r) => topic(r)), ...rest,
});

let container: HTMLDivElement; let root: Root;
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const all = (id: string) => Array.from(container.querySelectorAll(`[data-testid="${id}"]`));
const flush = async () => { await act(async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); }); };
const open = async (tab = 'plan') => {
  act(() => { root.render(<MemoryRouter><StudioIndexPage /></MemoryRouter>); });
  await flush();
  if (q(`tab-${tab}`)) act(() => { q(`tab-${tab}`)!.click(); });
  await flush();
};
const click = async (id: string) => { act(() => { q(id)!.click(); }); await flush(); };
const refused = (status: number, data: object = {}) => Object.assign(new Error('x'), { response: { status, data } });

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  (listStudioSessions as jest.Mock).mockResolvedValue([{ id: 's1', title: 'Ep 1', session_date: '2020-01-06', start_time: '18:30', cohort_name: 'Cohort', editorial_state: null, access_mode: null }]);
  api.getPlanSetup.mockResolvedValue(setup()); api.getPlan.mockResolvedValue(view());
  api.startPlan.mockResolvedValue({ planId: 'p2', started: true }); api.regeneratePlan.mockResolvedValue(); api.chooseTopic.mockResolvedValue();
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.useRealTimers(); });

it('the default air date is the next Monday, Central', () => {
  expect(nextMonday(new Date('2026-11-25T18:00:00Z'))).toBe('2026-11-30');
  expect(nextMonday(new Date('2026-11-30T18:00:00Z'))).toBe('2026-12-07');
  expect(nextMonday(new Date('2026-11-30T03:00:00Z'))).toBe('2026-11-30'); // still Sunday night in Central
});

describe('who sees the tabs', () => {
  it('a refused plan lookup leaves the class list exactly alone', async () => {
    api.getPlanSetup.mockRejectedValue(refused(403));
    await open();
    expect(q('studio-tabs')).toBeNull();
    expect(q('plan-tab')).toBeNull();
    expect(container.textContent).toContain('Ep 1');
    expect(container.textContent).toContain('Not set up');
  });
  it('a full administrator gets four tabs, and arrow keys move between them', async () => {
    await open('classes');
    for (const t of ['classes', 'plan', 'map', 'rubric']) expect(q(`tab-${t}`)).not.toBeNull();
    expect(q('pipe-s1')!.textContent).toContain('Date passed');
    act(() => { Simulate.keyDown(q('studio-tabs')!, { key: 'ArrowRight' }); });
    expect(q('tab-plan')!.getAttribute('aria-selected')).toBe('true');
    act(() => { Simulate.keyDown(q('studio-tabs')!, { key: 'ArrowLeft' }); Simulate.keyDown(q('studio-tabs')!, { key: 'x' }); });
    expect(q('tab-classes')!.getAttribute('aria-selected')).toBe('true');
  });
  it('administrators keep the broadcast state and access mode, and nothing is called aired', async () => {
    (listStudioSessions as jest.Mock).mockResolvedValue([{ id: 's1', title: 'Ep 1', session_date: '2020-01-06', start_time: '18:30', cohort_name: 'Cohort', editorial_state: 'cancelled', access_mode: 'cohort' }, { id: 's2', title: 'Ep 0', session_date: '2020-01-05', start_time: null, cohort_name: null, editorial_state: null, access_mode: null }]);
    await open('classes');
    const text = q('classes-panel')!.textContent!;
    expect(text).toContain('cancelled · cohort');
    expect(text).toContain('Not set up');
    expect(q('pipe-s2')!.textContent).toContain('No broadcast yet');
    expect(text).not.toMatch(/aired/i);
  });
  it('a server error shows the tabs and says the planner could not be loaded', async () => {
    api.getPlanSetup.mockRejectedValue(refused(500));
    await open();
    expect(q('plan-batch')!.textContent).toContain('could not be loaded');
    expect((q('find-topics') as HTMLButtonElement).disabled).toBe(true);
  });
  it('a failed class list is said plainly', async () => {
    (listStudioSessions as jest.Mock).mockRejectedValue(new Error('x'));
    await open('classes');
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('could not be loaded');
  });
});

describe('the plan tab', () => {
  it('has every input and nothing about which week students are on', async () => {
    await open();
    for (const k of ['airDate', 'week', 'proof', 'forceNews', 'audience', 'avoid', 'notes']) expect(q(`input-${k}`)).not.toBeNull();
    expect(q('input-week')!.querySelectorAll('option')).toHaveLength(13);
    expect(q('plan-inputs')!.textContent).not.toMatch(/students are on/i);
    expect(q('plan-batch')!.textContent).toBe('Goes into Cohort - November 2026');
  });
  it('no batch for the month blocks the run and says why', async () => {
    api.getPlanSetup.mockResolvedValue(setup({ batch: { ok: false, status: 409, error: 'No cohort named "Cohort - X".' } }));
    await open();
    expect(q('plan-batch')!.textContent).toContain('No cohort named');
    expect((q('find-topics') as HTMLButtonElement).disabled).toBe(true);
  });
  it('demand bars cover 12 weeks and never show a number that was not measured', async () => {
    await open();
    expect(q('demand-1')!.textContent).toContain('3.5x');
    expect(q('demand-3')!.textContent).toContain('No usual view count');
    expect(q('demand-4')!.textContent).toContain('few uploads');
    expect(q('demand-5')!.textContent).toContain('Not measured');
    expect(q('demand-12')).not.toBeNull();
  });
  it('filters signals by factor, links each, and lists what was left out and why', async () => {
    await open();
    expect(all('signal')).toHaveLength(2);
    await click('factor-7');
    expect(all('signal')).toHaveLength(1);
    expect(all('signal')[0].textContent).toContain('Date unconfirmed');
    expect(q('signals')!.textContent).toContain('HTTP 403');
    await click('factor-10');
    expect(q('signals')!.textContent).toContain('No story carries this factor');
  });
  it('shows five topic cards with scores, hooks, warnings and a Choose button each', async () => {
    await open();
    for (const r of [1, 2, 3, 4, 5]) { expect(q(`topic-${r}`)).not.toBeNull(); expect(q(`choose-${r}`)).not.toBeNull(); }
    const one = q('topic-1')!.textContent!;
    for (const x of ['Recommended', '89.0', 'Hook one', 'The parody.', 'Story s1', 'class day', 'Proof only you have']) expect(one).toContain(x);
    expect(q('topic-2')!.textContent).toContain('Week 9 is ahead.');
  });
  it('before any plan there is nothing to load and nothing breaks', async () => {
    api.getPlanSetup.mockResolvedValue(setup({ latestPlanId: null, demand: [] }));
    await open();
    expect(api.getPlan).not.toHaveBeenCalled();
    expect(q('topics')).toBeNull();
    expect(q('demand-bars')!.textContent).toContain('Not measured yet');
  });
});

describe('running', () => {
  it('starts with only the filled inputs, then polls until it finishes', async () => {
    jest.useFakeTimers();
    api.getPlanSetup.mockResolvedValueOnce(setup({ latestPlanId: null })).mockResolvedValue(setup({ latestPlanId: 'p2' }));
    api.getPlan.mockResolvedValue(view({ id: 'p2', status: 'researching', stage: 'demand' }, { topics: [] }));
    await open();
    act(() => { Simulate.change(q('input-proof')!, { target: { value: 'Three nights' } } as never); });
    await click('find-topics');
    expect(api.startPlan).toHaveBeenCalledWith(nextMonday(), { week: 'auto', proof: 'Three nights' });
    expect(q('plan-progress')!.textContent).toContain('Measuring YouTube demand (now)');
    expect((q('find-topics') as HTMLButtonElement).disabled).toBe(true);
    api.getPlan.mockResolvedValue(view({ id: 'p2' }));
    act(() => { jest.advanceTimersByTime(POLL_MS); }); await flush();
    expect(q('plan-progress')).toBeNull();
    const calls = api.getPlan.mock.calls.length;
    act(() => { jest.advanceTimersByTime(POLL_MS * 5); }); await flush();
    expect(api.getPlan.mock.calls.length).toBe(calls);
  });
  it('a lost poll is said and recovers', async () => {
    jest.useFakeTimers();
    api.getPlan.mockResolvedValueOnce(view({ status: 'researching', stage: 'topics' }, { topics: [] })).mockRejectedValueOnce(new Error('net')).mockResolvedValue(view());
    await open();
    act(() => { jest.advanceTimersByTime(POLL_MS); }); await flush();
    expect(q('plan-offline')!.textContent).toContain('Trying again');
    act(() => { jest.advanceTimersByTime(POLL_MS); }); await flush();
    expect(q('plan-offline')).toBeNull();
    expect(q('topics')).not.toBeNull();
  });
  it('a failed run shows why, keeps its topics choosable, and can be run again', async () => {
    api.getPlan.mockResolvedValue(view({ status: 'failed', stage: 'failed', error: 'Research stopped: cap', note: 'Only 7 news stories' }));
    await open();
    expect(q('plan-failed')!.textContent).toBe('Research stopped: cap');
    expect(q('plan-note')!.textContent).toContain('Only 7');
    expect((q('choose-1') as HTMLButtonElement).disabled).toBe(false);
    await click('regenerate');
    expect(api.regeneratePlan).toHaveBeenCalledWith('p1');
  });
  it('a failed run with no topics offers to run again', async () => {
    api.getPlan.mockResolvedValue(view({ status: 'failed', stage: 'failed' }, { topics: [], signals: [] }));
    await open();
    expect(q('regenerate')!.textContent).toBe('Run it again');
  });
  it('a refused start shows the server message', async () => {
    api.startPlan.mockRejectedValue(refused(409, { error: 'No cohort', code: 'no_batch' }));
    await open();
    await click('find-topics');
    expect(q('plan-error')!.textContent).toBe('No cohort');
  });
  it('a start still in flight when the date changes never lands on the new date', async () => {
    let answer: (v: { planId: string; started: boolean }) => void = () => undefined;
    api.startPlan.mockReturnValueOnce(new Promise((ok) => { answer = ok; }));
    api.getPlanSetup.mockImplementation(async (d) => setup(d === '2099-01-05' ? { latestPlanId: null, batch: { ok: true, cohortId: 'j', cohortName: 'Cohort - January 2099' } } : {}));
    await open();
    await click('find-topics');
    act(() => { Simulate.change(q('input-airDate')!, { target: { value: '2099-01-05' } } as never); });
    await flush();
    await act(async () => { answer({ planId: 'p2', started: true }); });
    await flush();
    expect((q('input-airDate') as HTMLInputElement).value).toBe('2099-01-05');
    expect(q('plan-batch')!.textContent).toBe('Goes into Cohort - January 2099');
    expect(q('topics')).toBeNull();
    expect(api.getPlan).not.toHaveBeenCalledWith('p2');
  });
  it('a start refused after the date changed says nothing on the new date', async () => {
    let refuse: (e: unknown) => void = () => undefined;
    api.startPlan.mockReturnValueOnce(new Promise((_ok, no) => { refuse = no; }));
    await open();
    await click('find-topics');
    act(() => { Simulate.change(q('input-airDate')!, { target: { value: '2099-01-05' } } as never); });
    await flush();
    await act(async () => { refuse(refused(409, { error: 'No cohort' })); });
    expect(q('plan-error')).toBeNull();
  });
  it('changing the date shows that date, not a late answer for the old one', async () => {
    let late: (v: plans.PlanView) => void = () => undefined;
    api.getPlan.mockReturnValueOnce(new Promise((r) => { late = r; }));
    await open();
    api.getPlanSetup.mockResolvedValue(setup({ latestPlanId: null }));
    act(() => { Simulate.change(q('input-airDate')!, { target: { value: '2099-01-05' } } as never); });
    await flush();
    await act(async () => { late(view()); });
    expect(q('topics')).toBeNull();
  });
});

describe('choosing', () => {
  it('stores the choice and shows it', async () => {
    await open();
    api.getPlan.mockResolvedValue(view({ status: 'chosen', chosen_topic_id: 't1' }));
    await click('choose-1');
    expect(api.chooseTopic).toHaveBeenCalledWith('p1', 't1', false);
    expect(q('choose-1')!.textContent).toContain('Chosen');
    expect(q('plan-chosen')!.textContent).toContain('next release');
    expect((q('regenerate') as HTMLButtonElement).disabled).toBe(true);
  });
  it('a topic under the gate asks first, and Cancel chooses nothing', async () => {
    api.chooseTopic.mockRejectedValueOnce(refused(409, { error: 'This topic scores 80, under the 85 needed.', code: 'needs_override' }));
    await open();
    await click('choose-4');
    expect(q('topic-4')!.textContent).toContain('under the 85 needed');
    const cancel = Array.from(q('topic-4')!.querySelectorAll('button')).find((x) => x.textContent === 'Cancel')!;
    act(() => { cancel.click(); }); await flush();
    expect(api.chooseTopic).toHaveBeenCalledTimes(1);
    expect(q('choose-anyway-4')).toBeNull();
    api.chooseTopic.mockRejectedValueOnce(refused(409, { error: 'This topic scores 80, under the 85 needed.', code: 'needs_override' }));
    await click('choose-4');
    await click('choose-anyway-4');
    expect(api.chooseTopic).toHaveBeenLastCalledWith('p1', 't4', true);
  });
});

it('the map shows what was taught, and the rubric adds up to 100 in each part', async () => {
  await open('map');
  expect(q('map-week-2')!.textContent).toContain('2 days ago');
  expect(q('map-week-3')!.textContent).toContain('Planned for Nov 30: Ep 2');
  expect(q('map-week-4')!.textContent).toContain('Open');
  expect(q('map-week-1')!.textContent).toContain('Demand 3.5x');
  expect(q('map-week-5')!.textContent).toContain('Demand not measured');
  expect(q('map-legend')!.textContent).toBe('CoveredPlannedOpen');
  expect(q('session-table')!.textContent).toMatch(/An old class.*Week 2.*ago.*completed/);
  expect(q('session-table')!.textContent).toMatch(/A future class.*Not tagged.*In \d+ days/);
  const sums = Array.from(q('rubric')!.querySelectorAll('.clp-lines')).slice(0, 3).map((dl) => Array.from(dl.querySelectorAll('dd')).reduce((t, d) => t + Number(d.textContent), 0));
  expect(sums).toEqual([100, 100, 100]);
});

it.each(['classes', 'plan', 'map', 'rubric'])('axe finds nothing on the %s tab', async (tab) => {
  await open(tab);
  const r = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
  expect(r.violations.map((v) => `${v.id}: ${v.nodes[0].html}`)).toEqual([]);
  expect(r.passes.length).toBeGreaterThan(5);
});
