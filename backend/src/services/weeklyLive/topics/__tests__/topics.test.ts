import { sequelize } from '../../../../config/database';
import { WeeklyLiveSignal, WeeklyLiveTopic } from '../../../../models/WeeklyLive';
import { buildCurriculumMap } from '../../curriculumMap';
import * as mapModule from '../../curriculumMap';
import * as demandModule from '../../demand/demandJob';
import { CONVERT_WEIGHTS, IDEA_WEIGHTS, VIRAL_WEIGHTS } from '../../scoring';
import { newsCeiling, openWeeks, rankOne, rankTopics, type RankContext } from '../topicRanking';
import { judgeSystem, ANCHORS } from '../topicPrompts';
import { pairJudgments, parseDrafts, type CandidateTopic, type Draft } from '../topicSchema';
import { runTopics } from '../topicsJob';

/** WL3.3: exactly five topics, content rules on every public field, stable order, honest scores, malformed answers. */
const AIR = '2026-11-30';
const map = buildCurriculumMap([{ week: 2, date: '2026-11-23', sessionId: 'a', title: 'Ep 1' }, { week: 1, date: '2026-11-12', sessionId: 'b', title: 'First' }], AIR);
const full = (w: Record<string, number>, share = 1) => Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Math.round(v * share)]));
const teach = (over: Record<string, number> = {}) => Object.fromEntries(Object.keys(IDEA_WEIGHTS).map((k) => [k, { score: over[k] ?? 5, why: 'because it is' }]));
const cand = (over: Partial<CandidateTopic> = {}): CandidateTopic => ({
  week: 3, title: 'It Works While You Sleep', spin: 'A plain spin on the news this week.', parody: 'An original shop owner sleeps while the helper works.',
  hooks: [{ text: 'I slept all night. My AI worked.', viral: full(VIRAL_WEIGHTS) }, { text: 'Who is answering at night?', viral: full(VIRAL_WEIGHTS, 0.8) }] as CandidateTopic['hooks'],
  package: { long_video: 'My night shift', shorts: 'Six shorts', thumbnail: 'Night shift' }, marketing: { before: 'Promo on Friday', class_day: 'Post at noon', after: 'Shorts all week' },
  signals: ['S1', 'S2'], shows_proof: true, proof_use: 'The three nights of runs are on screen', teach: teach() as CandidateTopic['teach'], viral: full(VIRAL_WEIGHTS) as CandidateTopic['viral'], convert: full(CONVERT_WEIGHTS) as CandidateTopic['convert'], ...over,
});
const draft = (over: Partial<Draft> = {}): Draft => { const { teach: _t, viral: _v, convert: _c, hooks, ...d } = cand(); return { ...d, hooks: hooks.map((h) => h.text), ...over }; };
const judge = (id: string, hooks = 2, over: Record<string, unknown> = {}) => ({ id, hooks: Array.from({ length: hooks }, () => full(VIRAL_WEIGHTS)), teach: teach(), viral: full(VIRAL_WEIGHTS), convert: full(CONVERT_WEIGHTS), ...over });
const ctx = (over: Partial<RankContext> = {}): RankContext => ({
  airDate: AIR, proofGiven: true, map,
  signals: [{ id: 'u1', ref: 'S1', published_at: '2026-11-19', factors: [9, 5] }, { id: 'u2', ref: 'S2', published_at: '2026-11-11', factors: [7] }, { id: 'u3', ref: 'S3', published_at: null, factors: [4] }],
  demand: [{ week: 3, score: 4, multiple: 3.5, thin_median: false }], ...over,
});
const ALL = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
afterEach(() => jest.restoreAllMocks());

it('weeks in the last four sessions are closed unless forced', () => {
  expect(openWeeks(map, 'auto')).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  expect(openWeeks(map, 2)).toEqual([2]);
});

it.each([[0, 5], [14, 5], [15, 3], [90, 3], [91, 1], [null, 1], [-3, 5]])('news %s days old on air can score at most %s', (d, n) => { expect(newsCeiling(d as number | null)).toBe(n); });

describe('rankOne', () => {
  it('demand is the measurement, factors are the cited signals, hooks are totaled by the rubric', () => {
    const t = rankOne(cand(), ctx());
    expect(t.teach_lines.demand).toEqual({ score: 4, why: "Measured: the best video ran 3.5x its channel's usual views" });
    expect(t.score.factors).toEqual([5, 7, 9]);
    expect(t.hooks[0]).toEqual({ text: 'I slept all night. My AI worked.', viral: 100 });
    expect(t.signals_used).toEqual(['u1', 'u2']);
    expect(t.warnings).toEqual([]);
  });
  it('no measurement is 1 and warned, whatever the AI claimed', () => {
    const t = rankOne(cand({ week: 4 }), ctx());
    expect(t.teach_lines.demand.score).toBe(1);
    expect(t.warnings.map((w) => w.code)).toContain('no_demand');
  });
  it('an undated signal cannot lift the news line', () => {
    const t = rankOne(cand({ signals: ['S3'] }), ctx());
    expect(t.teach_lines.news.score).toBe(1);
    expect(t.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['no_dated_news', 'few_factors']));
    expect(t.score.needsOverride).toBe(true);
  });
  it('a topic that does not use the proof cannot score on it', () => {
    const r = rankOne(cand({ shows_proof: false, proof_use: 'N/A' }), ctx());
    expect([r.teach_lines.proof.score, r.hasProof]).toEqual([2, false]);
  });
  it('a signal id that does not exist counts for nothing', () => {
    expect(rankOne(cand({ signals: ['S9'] }), ctx()).signals_used).toEqual([]);
  });
  it('warns on stale news, a jump ahead, and proof that is missing', () => {
    const t = rankOne(cand({ week: 11 }), ctx({ proofGiven: false, signals: [{ id: 'u1', ref: 'S1', published_at: '2026-11-01', factors: [1] }] }));
    expect(t.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['jumps_ahead', 'no_proof', 'stale_news']));
    expect(t.warnings.find((w) => w.code === 'jumps_ahead')?.message).toBe('Week 11 is 8 weeks past the next one the class reaches (week 3).');
    expect(t.teach_lines.proof.score).toBe(2);
    expect(t.hasProof).toBe(false);
  });
});

describe('ranking', () => {
  const many = () => [cand({ title: 'B', week: 5 }), cand({ title: 'A', week: 5 }), cand({ title: 'C', week: 3 }), cand({ title: 'D', week: 9, viral: full(VIRAL_WEIGHTS, 0.5) as never }), cand({ title: 'E', week: 8 }), cand({ title: 'F', week: 4 })];
  it('keeps five, best first, and the same scores give the same order whatever the input order', () => {
    const a = rankTopics(many(), ctx()); const b = rankTopics(many().reverse(), ctx());
    expect(a.topics).toHaveLength(5);
    expect(a.topics.map((t) => t.title)).toEqual(['C', 'F', 'A', 'B', 'E']);
    expect(b.topics.map((t) => t.title)).toEqual(a.topics.map((t) => t.title));
  });
  it('recommends the best that clears the gate and has proof, or nothing', () => {
    const noProof = cand({ title: 'Top', teach: teach({ proof: 3 }) as never });
    const r = rankTopics([noProof, cand({ title: 'Next', convert: full(CONVERT_WEIGHTS, 0.8) as never })], ctx());
    expect(r.recommended?.title).toBe('Next');
    expect(rankTopics([noProof], ctx()).recommended).toBeNull();
  });
  it('of two topics with one title the better survives, in either order', () => {
    const weak = cand({ convert: full(CONVERT_WEIGHTS, 0.3) as never });
    const both = [cand(), weak];
    const a = rankTopics(both, ctx()).topics; const b = rankTopics([...both].reverse(), ctx()).topics;
    expect([a.length, a[0].score.convert.total]).toEqual([1, 100]);
    expect(b).toEqual(a);
  });
  it('a full tie is still the same order both ways', () => {
    const x = [cand({ spin: 'A spin that comes first.' }), cand({ spin: 'B spin that comes later.' })];
    expect(rankTopics([...x].reverse(), ctx()).topics).toEqual(rankTopics(x, ctx()).topics);
  });
  it('the same title twice is one topic', () => { expect(rankTopics([cand(), cand({ title: 'IT WORKS while you sleep' })], ctx()).topics).toHaveLength(1); });
});

describe('parseDrafts', () => {
  it.each([[null], ['text'], [{}], [{ topics: 'no' }]])('a malformed answer %j gives no drafts and a reason', (raw) => {
    expect(parseDrafts(raw, ALL)).toEqual({ drafts: [], rejected: ["the writer's answer had no topics list"] });
  });
  it.each([
    ['a six-word title', { title: 'one two three four five six' }], ['no answer on proof', { shows_proof: undefined as never }], ['a missing parody', { parody: undefined as never }], ['a week that is closed', { week: 2 }],
    ['one hook', { hooks: ['only one line'] }], ['a price word in the parody', { parody: 'A free class for the whole town.' }], ['a number on the thumbnail', { package: { ...cand().package, thumbnail: '73% lost' } }],
    ['a partnership in marketing', { marketing: { ...cand().marketing, before: 'In partnership with Anthropic' } }],
  ])('drops %s with a reason', (_n, over) => {
    const r = parseDrafts({ topics: [draft(over), draft()] }, new Set([3]));
    expect([r.drafts.length, r.rejected.length]).toEqual([1, 1]);
  });
  it('a hook that breaks a rule is removed and the topic stays when two are left', () => {
    expect(parseDrafts({ topics: [draft({ hooks: ['First line here', 'Second line here', 'Join at no cost tonight'] })] }, ALL).drafts[0].hooks).toHaveLength(2);
  });
});

describe('pairJudgments', () => {
  it('pairs by id, not by order', () => {
    const r = pairJudgments([draft({ title: 'A' }), draft({ title: 'B' })], ['T1', 'T2'], { scores: [judge('T2', 2, { convert: full(CONVERT_WEIGHTS, 0.5) }), judge('T1')] });
    expect(r.topics.map((t) => [t.title, t.convert.buyerFit])).toEqual([['A', 30], ['B', 15]]);
  });
  it.each([['nothing back', null], ['another id', { scores: [judge('T9')] }], ['a missing line', { scores: [judge('T1', 2, { viral: { hook: 1 } })] }], ['a hook left out', { scores: [judge('T1', 1)] }]])('%s drops the draft', (_n, raw) => {
    const r = pairJudgments([draft()], ['T1'], raw);
    expect(r.topics).toEqual([]);
    expect(r.rejected.join()).toContain('was not fully scored');
  });
});

it('the judge is calibrated on the five reference topics and is never told a topic was written by AI', () => {
  const p = judgeSystem();
  for (const a of ANCHORS) expect(p).toContain(`viral total ${a.viral}; convert total ${a.convert}`);
  expect(p).toContain('You did not write them');
});

describe('runTopics', () => {
  let destroy: jest.SpyInstance; let create: jest.SpyInstance;
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(sequelize, 'transaction').mockImplementation((async (cb: (t: unknown) => unknown) => cb('tx')) as never);
    jest.spyOn(WeeklyLiveSignal, 'findAll').mockResolvedValue([{ id: 'u1', published_at: '2026-11-19', factors: [9, 5, 7], fits_weeks: [3], headline: 'Story one', publisher: 'P' }] as never);
    jest.spyOn(demandModule, 'latestDemand').mockResolvedValue([{ week: 3, score: 4, multiple: '3.50', thin_median: false }] as never);
    jest.spyOn(mapModule, 'curriculumMap').mockResolvedValue(map);
    destroy = jest.spyOn(WeeklyLiveTopic, 'destroy').mockResolvedValue(0); create = jest.spyOn(WeeklyLiveTopic, 'bulkCreate').mockResolvedValue([]);
  });
  const input = { planId: 'p1', airDate: AIR, inputs: { week: 'auto' as const, proof: 'Three nights of runs', avoid: 'politics' } };
  const drafts = (n = 5, from = 0) => ({ topics: Array.from({ length: n }, (_, i) => draft({ title: `Topic ${i + from}`, week: 3 + i + from, signals: ['S1'] })) });
  const scores = (n: number) => ({ scores: Array.from({ length: n }, (_, i) => judge(`T${i + 1}`)) });
  const asker = (...answers: unknown[]) => { const f = jest.fn(); answers.forEach((x) => f.mockResolvedValueOnce(x)); return f; };
  it('writes, then judges in a separate call, and stores exactly five ranked 1 to 5 in one transaction', async () => {
    const ask = asker(drafts(7), scores(7));
    const r = await runTopics(input, ask);
    expect([r.rounds, r.recommendedRank]).toEqual([1, 1]);
    expect(ask.mock.calls.map((c) => c[0].purpose)).toEqual(['topic_write', 'topic_judge']);
    expect(ask.mock.calls[0][0].system).toContain('Do not score them');
    expect(ask.mock.calls[0][0].user).toContain('"politics"');
    const rows = create.mock.calls[0][0] as { rank: number }[];
    expect(rows.map((x) => x.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(destroy).toHaveBeenCalledWith({ where: { plan_id: 'p1' }, transaction: 'tx' });
    expect(destroy.mock.invocationCallOrder[0]).toBeLessThan(create.mock.invocationCallOrder[0]);
  });
  it('asks for one more round when short, naming what it has', async () => {
    const ask = asker(drafts(3), scores(3), drafts(3, 3), scores(3));
    expect((await runTopics(input, ask)).rounds).toBe(2);
    expect(ask.mock.calls[2][0].user).toContain('do not repeat: Topic 0; Topic 1; Topic 2');
  });
  it('still short: throws with the reason, judges nothing, keeps the old topics', async () => {
    const ask = jest.fn().mockResolvedValue({ topics: [{ week: 3 }] });
    await expect(runTopics(input, ask)).rejects.toThrow(/Only 0 usable topics.*title/);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(destroy).not.toHaveBeenCalled();
  });
  it('the class being planned does not count as already taught', async () => {
    await runTopics(input, asker(drafts(5), scores(5)));
    expect(mapModule.curriculumMap).toHaveBeenCalledWith('2026-11-29');
  });
});
