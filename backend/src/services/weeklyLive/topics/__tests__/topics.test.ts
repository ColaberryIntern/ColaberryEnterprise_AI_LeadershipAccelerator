import { sequelize } from '../../../../config/database';
import { WeeklyLiveSignal, WeeklyLiveTopic } from '../../../../models/WeeklyLive';
import { buildCurriculumMap } from '../../curriculumMap';
import * as mapModule from '../../curriculumMap';
import * as demandModule from '../../demand/demandJob';
import { CONVERT_WEIGHTS, IDEA_WEIGHTS, VIRAL_WEIGHTS } from '../../scoring';
import { newsCeiling, openWeeks, rankOne, rankTopics, type RankContext } from '../topicRanking';
import { parseTopics, type CandidateTopic } from '../topicSchema';
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
  signals: ['S1', 'S2'], teach: teach() as CandidateTopic['teach'], viral: full(VIRAL_WEIGHTS) as CandidateTopic['viral'], convert: full(CONVERT_WEIGHTS) as CandidateTopic['convert'], ...over,
});
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
  it('the same title twice is one topic', () => { expect(rankTopics([cand(), cand({ title: 'IT WORKS while you sleep' })], ctx()).topics).toHaveLength(1); });
});

describe('parseTopics', () => {
  it.each([[null], ['text'], [{}], [{ topics: 'no' }]])('a malformed answer %j gives no topics and a reason', (raw) => {
    expect(parseTopics(raw, ALL)).toEqual({ topics: [], rejected: ['the answer had no topics list'] });
  });
  it.each([
    ['a six-word title', { title: 'one two three four five six' }], ['a missing score line', { viral: { hook: 5 } as never }], ['a week that is closed', { week: 2 }],
    ['one hook', { hooks: [cand().hooks[0]] }], ['a price word in the parody', { parody: 'A free class for the whole town.' }], ['a number on the thumbnail', { package: { ...cand().package, thumbnail: '73% lost' } }],
    ['a partnership in marketing', { marketing: { ...cand().marketing, before: 'In partnership with Anthropic' } }],
  ])('drops %s with a reason', (_n, over) => {
    const r = parseTopics({ topics: [{ ...cand(), ...over }, cand()] }, new Set([3]));
    expect(r.topics).toHaveLength(1);
    expect(r.rejected).toHaveLength(1);
  });
  it('a hook that breaks a rule is removed and the topic stays when two are left', () => {
    const r = parseTopics({ topics: [cand({ hooks: [...cand().hooks, { text: 'Join at no cost tonight', viral: full(VIRAL_WEIGHTS) as never }] })] }, ALL);
    expect(r.topics[0].hooks).toHaveLength(2);
  });
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
  const five = (n = 5, from = 0) => ({ topics: Array.from({ length: n }, (_, i) => cand({ title: `Topic ${i + from}`, week: 3 + i + from, signals: ['S1'] })) });
  it('stores exactly five, ranked 1 to 5, replacing the old ones in one transaction', async () => {
    const ask = jest.fn().mockResolvedValue(five(7));
    const r = await runTopics(input, ask);
    expect([r.calls, r.recommendedRank]).toEqual([1, 1]);
    const rows = create.mock.calls[0][0] as { rank: number; plan_id: string }[];
    expect(rows.map((x) => x.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(destroy).toHaveBeenCalledWith({ where: { plan_id: 'p1' }, transaction: 'tx' });
    expect(destroy.mock.invocationCallOrder[0]).toBeLessThan(create.mock.invocationCallOrder[0]);
    expect(ask.mock.calls[0][2]).toContain('"politics"');
  });
  it('asks once more when short, naming what it has', async () => {
    const ask = jest.fn().mockResolvedValueOnce(five(3)).mockResolvedValueOnce(five(3, 3));
    expect((await runTopics(input, ask)).calls).toBe(2);
    expect(ask.mock.calls[1][2]).toContain('do not repeat: Topic 0; Topic 1; Topic 2');
  });
  it('still short: throws with the reason and keeps the old topics', async () => {
    await expect(runTopics(input, jest.fn().mockResolvedValue({ topics: [{ week: 3 }] }))).rejects.toThrow(/Only 0 usable topics.*title/);
    expect(destroy).not.toHaveBeenCalled();
  });
});
