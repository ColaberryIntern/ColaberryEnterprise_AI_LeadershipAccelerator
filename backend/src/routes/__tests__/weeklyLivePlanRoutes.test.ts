jest.mock('../../services/weeklyLive/plans/planStore', () => ({ ...jest.requireActual('../../services/weeklyLive/plans/planStore'), getPlan: jest.fn(), latestPlanFor: jest.fn(), createOrJoin: jest.fn(), claimForRun: jest.fn(), setStage: jest.fn(), finish: jest.fn(), setChosen: jest.fn() }));
jest.mock('../../services/weeklyLive/batchResolver', () => ({ ...jest.requireActual('../../services/weeklyLive/batchResolver'), resolveBatch: jest.fn() }));
jest.mock('../../services/weeklyLive/signals/signalsJob', () => ({ ...jest.requireActual('../../services/weeklyLive/signals/signalsJob'), runSignals: jest.fn() }));
jest.mock('../../services/weeklyLive/demand/demandJob', () => ({ ...jest.requireActual('../../services/weeklyLive/demand/demandJob'), runDemand: jest.fn(), latestDemand: jest.fn() }));
jest.mock('../../services/weeklyLive/topics/topicsJob', () => ({ runTopics: jest.fn() }));

import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { env } from '../../config/env';
import { WeeklyLiveSignal, WeeklyLiveTopic } from '../../models/WeeklyLive';
import { MGMT_ROLES } from '../../services/access/mgmtRoles';
import { resolveBatch } from '../../services/weeklyLive/batchResolver';
import { latestDemand, runDemand } from '../../services/weeklyLive/demand/demandJob';
import { executePlan } from '../../services/weeklyLive/plans/planService';
import * as store from '../../services/weeklyLive/plans/planStore';
import { runSignals } from '../../services/weeklyLive/signals/signalsJob';
import { runTopics } from '../../services/weeklyLive/topics/topicsJob';
import router from '../weeklyLivePlanRoutes';

/** WL3.4: full administrators only, Zod on every body, one run per air date, honest stages and failures, checked response. */
const RUN = '7b8a95b7-1a88-42d5-b257-fd786d071f6e';
const PID = '5b8a95b7-1a88-42d5-b257-fd786d071f6e'; const TID = '6b8a95b7-1a88-42d5-b257-fd786d071f6e';
const s = store as jest.Mocked<typeof store>;
const signals = runSignals as jest.Mock; const demand = runDemand as jest.Mock; const topics = runTopics as jest.Mock;
const app = express(); app.use(express.json()); app.use(router);
const bearer = (claims: Record<string, unknown> = {}) => `Bearer ${jwt.sign({ sub: 'u', email: 'a@example.com', role: 'admin', ...claims }, env.jwtSecret)}`;
type M = 'get' | 'post';
const go = (m: M, p: string, body?: unknown, auth: string | null = bearer()) => { let r = request(app)[m](p); if (auth) r = r.set('Authorization', auth); return m === 'post' ? r.send((body ?? {}) as object) : r; };
const plan = (over: Partial<store.PlanRow> = {}): store.PlanRow => ({ id: PID, air_date: '2099-11-30', cohort_id: 'c', inputs: { week: 'auto', forceNews: 'x' }, status: 'ready', chosen_topic_id: null, cost_usd: 0.2, stage: 'done', note: null, error: null, ...over });
const topic = (over: Record<string, unknown> = {}) => ({ id: TID, plan_id: PID, rank: 1, week: 3, title: 'T', spin: 's', parody: 'p', hooks: [{ text: 'h', viral: 80 }], package: {}, marketing: {}, signals_used: [], teach_lines: { proof: { score: 5, why: 'w' } }, teach: '88.0', viral: '85.0', convert: '91.0', topic_score: '87.4', factors: [1, 5, 9], warnings: [], ...over });
const start = { airDate: '2099-11-30', inputs: { week: 'auto' } };
const ROUTES: [M, string, unknown][] = [['get', '/api/admin/live/plan-setup?airDate=2099-11-30', undefined], ['post', '/api/admin/live/plans', start], ['get', `/api/admin/live/plans/${PID}`, undefined], ['post', `/api/admin/live/plans/${PID}/regenerate`, {}], ['post', `/api/admin/live/plans/${PID}/choose`, { topicId: TID }]];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined); jest.spyOn(console, 'error').mockImplementation(() => undefined);
  s.getPlan.mockResolvedValue(plan()); s.createOrJoin.mockResolvedValue({ id: PID, created: true, runId: RUN }); s.claimForRun.mockResolvedValue(RUN); s.setChosen.mockResolvedValue(true); s.setStage.mockResolvedValue(true); s.finish.mockResolvedValue();
  (resolveBatch as jest.Mock).mockResolvedValue({ ok: true, cohortId: 'c', cohortName: 'Cohort - November 2099' });
  (latestDemand as jest.Mock).mockResolvedValue([{ week: 3, video_url: null, video_title: null, channel: null, views: null, multiple: '3.50', score: 4, thin_median: false, measured_at: '2026-11-25', error: null }]);
  signals.mockResolvedValue({ kept: 14, dropped: 2, short: false, failedGroups: [] }); demand.mockResolvedValue({}); topics.mockResolvedValue({});
  jest.spyOn(WeeklyLiveSignal, 'findAll').mockResolvedValue([] as never); jest.spyOn(WeeklyLiveSignal, 'count').mockResolvedValue(5 as never);
  jest.spyOn(WeeklyLiveTopic, 'findAll').mockResolvedValue([topic()] as never); jest.spyOn(WeeklyLiveTopic, 'findOne').mockResolvedValue(topic() as never);
});

describe('access', () => {
  it.each(ROUTES)('%s %s: 401 without a login, 403 for every scoped role, open to full admins', async (m, p, body) => {
    expect((await go(m, p, body, null)).status).toBe(401);
    expect((await go(m, p, body, 'Bearer forged')).status).toBe(401);
    for (const mgmt_role of MGMT_ROLES.filter((r) => r !== 'owner' && r !== 'admin')) expect([mgmt_role, (await go(m, p, body, bearer({ mgmt_role }))).status]).toEqual([mgmt_role, 403]);
    expect((await go(m, p, body, bearer({ role: 'sales' }))).status).toBe(403);
    expect(s.createOrJoin).not.toHaveBeenCalled();
  });
});

describe('validation', () => {
  it.each([
    [{}], [{ ...start, airDate: '2099-02-30' }], [{ ...start, airDate: 'soon' }], [{ ...start, inputs: { week: 13 } }], [{ ...start, inputs: { week: 'auto', studentsOn: 4 } }],
    [{ ...start, extra: 1 }], [{ ...start, inputs: { week: 'auto', notes: 'x'.repeat(1001) } }],
  ])('POST /plans refuses %j', async (body) => {
    expect((await go('post', '/api/admin/live/plans', body)).status).toBe(400);
    expect(s.createOrJoin).not.toHaveBeenCalled();
  });
  it('choose needs a topic id, regenerate takes no fields, a bad id is 404, a bad date is 400', async () => {
    expect((await go('post', `/api/admin/live/plans/${PID}/choose`, { topicId: 'x' })).status).toBe(400);
    expect((await go('post', `/api/admin/live/plans/${PID}/regenerate`, { a: 1 })).status).toBe(400);
    expect((await go('get', '/api/admin/live/plans/nope')).status).toBe(404);
    expect((await go('get', '/api/admin/live/plan-setup?airDate=x')).status).toBe(400);
  });
  it('a past air date is 400 and a month with no batch is 409', async () => {
    expect((await go('post', '/api/admin/live/plans', { ...start, airDate: '2020-01-06' })).body.code).toBe('past_date');
    (resolveBatch as jest.Mock).mockResolvedValue({ ok: false, status: 409, cohortName: 'Cohort - X', error: 'No cohort named "Cohort - X".' });
    const r = await go('post', '/api/admin/live/plans', start);
    expect([r.status, r.body.code]).toEqual([409, 'no_batch']);
  });
});

describe('starting', () => {
  it('a new plan is 202 and runs; a second POST while it runs returns the same plan and starts nothing', async () => {
    const first = await go('post', '/api/admin/live/plans', start);
    expect([first.status, first.body]).toEqual([202, { planId: PID, started: true }]);
    await new Promise((r) => setImmediate(r));
    expect(signals).toHaveBeenCalledTimes(1);
    s.createOrJoin.mockResolvedValue({ id: PID, created: false, runId: null });
    const second = await go('post', '/api/admin/live/plans', start);
    expect([second.status, second.body]).toEqual([200, { planId: PID, started: false }]);
    await new Promise((r) => setImmediate(r));
    expect(signals).toHaveBeenCalledTimes(1);
  });
});

describe('a run', () => {
  const stages = () => s.setStage.mock.calls.map((c) => c[2]);
  it('goes signals, demand, topics, done', async () => {
    await executePlan(PID, RUN, false);
    expect(stages()).toEqual(['signals', 'demand', 'topics']);
    expect(signals).toHaveBeenCalledWith(expect.objectContaining({ planId: PID, forceNews: 'x' }));
    expect(s.finish).toHaveBeenCalledWith(PID, RUN, true);
  });
  it('says so when few stories were confirmed', async () => {
    signals.mockResolvedValue({ kept: 7, short: true });
    await executePlan(PID, RUN, false);
    expect(s.setStage).toHaveBeenCalledWith(PID, RUN, 'demand', 'Only 7 news stories could be confirmed this time.');
  });
  it('demand failing does not stop it', async () => {
    demand.mockRejectedValue(new Error('quota'));
    await executePlan(PID, RUN, false);
    expect(topics).toHaveBeenCalled();
    expect(s.finish).toHaveBeenCalledWith(PID, RUN, true);
  });
  it('the cost cap is shown in its own words; an internal error is not', async () => {
    signals.mockRejectedValue(Object.assign(new Error('Research stopped: cap'), { name: 'BudgetExceeded' }));
    await executePlan(PID, RUN, false);
    expect(s.finish).toHaveBeenLastCalledWith(PID, RUN, false, 'Research stopped: cap');
    topics.mockRejectedValue(new Error('password=hunter2'));
    await executePlan(PID, RUN, true);
    expect(s.finish).toHaveBeenLastCalledWith(PID, RUN, false, 'Something went wrong while planning. Run it again.');
  });
  it('a run that was replaced stops without paying for topics or writing a result', async () => {
    s.setStage.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await executePlan(PID, RUN, false);
    expect(topics).not.toHaveBeenCalled();
    expect(s.finish).not.toHaveBeenCalled();
  });
  it('never throws, even when the outcome cannot be saved', async () => {
    topics.mockRejectedValue(new Error('x')); s.finish.mockRejectedValue(new Error('db down'));
    await expect(executePlan(PID, RUN, true)).resolves.toBeUndefined();
  });
});

describe('regenerate', () => {
  it('reuses the research; without any it runs everything', async () => {
    expect((await go('post', `/api/admin/live/plans/${PID}/regenerate`)).status).toBe(202);
    await new Promise((r) => setImmediate(r));
    expect(signals).not.toHaveBeenCalled();
    (WeeklyLiveSignal.count as jest.Mock).mockResolvedValue(0);
    await go('post', `/api/admin/live/plans/${PID}/regenerate`);
    await new Promise((r) => setImmediate(r));
    expect(signals).toHaveBeenCalledTimes(1);
  });
  it('a failed read leaves the plan unclaimed', async () => {
    (WeeklyLiveSignal.count as jest.Mock).mockRejectedValue(new Error('db'));
    expect((await go('post', `/api/admin/live/plans/${PID}/regenerate`)).status).toBe(500);
    expect(s.claimForRun).not.toHaveBeenCalled();
  });
  it('refuses while running, after a choice, and for an unknown plan', async () => {
    s.claimForRun.mockResolvedValue(null);
    expect((await go('post', `/api/admin/live/plans/${PID}/regenerate`)).body.code).toBe('running');
    s.getPlan.mockResolvedValue(plan({ status: 'chosen' }));
    expect((await go('post', `/api/admin/live/plans/${PID}/regenerate`)).body.code).toBe('already_chosen');
    s.getPlan.mockResolvedValue(null);
    expect((await go('post', `/api/admin/live/plans/${PID}/regenerate`)).status).toBe(404);
  });
});

describe('choose', () => {
  const pick = (body: object = {}) => go('post', `/api/admin/live/plans/${PID}/choose`, { topicId: TID, ...body });
  it('stores a topic that clears the gate', async () => {
    expect((await pick()).body).toEqual({ ok: true, chosenTopicId: TID });
    expect(s.setChosen).toHaveBeenCalledWith(PID, TID);
  });
  it('a failed run keeps its earlier topics choosable', async () => {
    s.getPlan.mockResolvedValue(plan({ status: 'failed', error: 'why' }));
    expect((await pick()).status).toBe(200);
  });
  it.each([[{ topic_score: '84.9' }], [{ factors: [1, 2] }]])('%j needs an explicit override', async (over) => {
    (WeeklyLiveTopic.findOne as jest.Mock).mockResolvedValue(topic(over));
    expect((await pick()).body.code).toBe('needs_override');
    expect(s.setChosen).not.toHaveBeenCalled();
    expect((await pick({ override: true })).status).toBe(200);
  });
  it("refuses another plan's topic, an unfinished plan, and a plan that changed", async () => {
    (WeeklyLiveTopic.findOne as jest.Mock).mockResolvedValueOnce(null);
    expect((await pick()).body.code).toBe('topic_not_found');
    s.getPlan.mockResolvedValueOnce(plan({ status: 'researching' }));
    expect((await pick()).body.code).toBe('not_ready');
    s.setChosen.mockResolvedValue(false);
    expect((await pick()).body.code).toBe('changed');
  });
});

describe('reading', () => {
  it('returns inputs, progress, signals, demand and topics, with the recommended pick', async () => {
    const r = await go('get', `/api/admin/live/plans/${PID}`);
    expect(r.status).toBe(200);
    expect(r.body.plan).toMatchObject({ status: 'ready', stage: 'done' });
    expect(r.body.topics[0]).toMatchObject({ topic_score: 87.4, recommended: true });
    expect(r.body.demand[0]).toMatchObject({ multiple: 3.5, failed: false });
  });
  it.each([['hooks', 'broken'], ['spin', 5], ['parody', {}], ['package', 'x'], ['marketing', 7], ['teach_lines', { proof: 'bad' }], ['factors', ['a']], ['signals_used', 'zz'], ['warnings', [{}]], ['week', 40]])('a malformed topic %s fails outside production', async (k, v) => {
    (WeeklyLiveTopic.findAll as jest.Mock).mockResolvedValue([topic({ [k as string]: v })]);
    expect((await go('get', `/api/admin/live/plans/${PID}`)).status).toBe(500);
  });
  it.each([['inputs', { week: 'x' }], ['cost_usd', '0.2'], ['stage', 'lost'], ['cohort_id', 4]])('a malformed plan %s fails outside production', async (k, v) => {
    s.getPlan.mockResolvedValue(plan({ [k as string]: v } as never));
    expect((await go('get', `/api/admin/live/plans/${PID}`)).status).toBe(500);
  });
  it('a malformed signal or demand row fails outside production', async () => {
    (WeeklyLiveSignal.findAll as jest.Mock).mockResolvedValue([{ id: 'a', headline: 'h', publisher: null, url: 'u', published_at: null, date_confirmed: 'yes', factors: [1], fits_weeks: [], idea: null, dropped_reason: null }]);
    expect((await go('get', `/api/admin/live/plans/${PID}`)).status).toBe(500);
  });
  it('plan-setup is checked too', async () => {
    const map = jest.requireActual('../../services/weeklyLive/curriculumMap');
    jest.spyOn(map, 'curriculumMap').mockResolvedValueOnce(map.buildCurriculumMap([], '2026-11-25'));
    expect((await go('get', '/api/admin/live/plan-setup?airDate=2099-11-30')).status).toBe(200);
    jest.spyOn(map, 'curriculumMap').mockResolvedValueOnce('junk');
    expect((await go('get', '/api/admin/live/plan-setup?airDate=2099-11-30')).status).toBe(500);
  });
  it('production logs a wrong shape and still answers', async () => {
    (WeeklyLiveTopic.findAll as jest.Mock).mockResolvedValue([topic({ hooks: 'broken' })]);
    const was = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
    try { expect((await go('get', `/api/admin/live/plans/${PID}`)).status).toBe(200); } finally { process.env.NODE_ENV = was; }
    expect((console.error as jest.Mock).mock.calls.flat().join()).toContain('ContractViolation');
  });
});
