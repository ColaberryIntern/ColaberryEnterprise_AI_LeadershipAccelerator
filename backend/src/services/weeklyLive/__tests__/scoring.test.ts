import path from 'path';
import {
  scoreTeach, scoreViral, scoreConvert, combine, bandOf, scoreTopic, recommendPick, normalizeFactors,
  VIRAL_FACTORS, IDEA_WEIGHTS, VIRAL_WEIGHTS, CONVERT_WEIGHTS, type IdeaLines, type TopicScoreInput,
} from '../scoring';

/**
 * WL2.2. The reference table is the 2026-11-24 research kit (research-2026-11-24.md, "Five topics"):
 * the five topic scores must come out exactly. The Teach part must match the skill's score_idea.js
 * line for line, so the Studio and the skill can never disagree.
 */
const REFERENCE: [string, number, number, number, number][] = [
  ['The Job AI Can\'t Take', 91, 93, 86, 90.8],
  ['It Works While You Sleep', 91, 88, 90, 89.6],
  ['The AI Tried to Shop', 86, 92, 84, 88.0],
  ['Your AI Hides Its Mistakes', 90, 85, 80, 86.0],
  ['It Runs the Whole Job', 86, 84, 82, 84.4],
];

it.each(REFERENCE)('reference table: %s', (_t, teach, viral, convert, expected) => {
  expect(combine(teach, viral, convert)).toBe(expected);
});

it('weights each sum to 100', () => {
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
  expect(sum(IDEA_WEIGHTS)).toBe(100);
  expect(sum(VIRAL_WEIGHTS)).toBe(100);
  expect(sum(CONVERT_WEIGHTS)).toBe(100);
});

describe('Teach caps (Idea rubric)', () => {
  const all = (v: number): IdeaLines => ({ demand: v, viewer: v, promise: v, tension: v, proof: v, series: v, news: v });
  it('no proof input clamps the proof line to 2', () => {
    const r = scoreTeach(all(5), false);
    expect(r.lines.proof).toBe(2);
    expect(r.total).toBe(91);
    expect(r.caps).toHaveLength(1);
    expect(scoreTeach(all(5), true).total).toBe(100);
  });
  it('tension <= 1 and demand <= 1 caps at 50', () => {
    const r = scoreTeach({ ...all(5), tension: 1, demand: 1 }, true);
    expect(r.total).toBe(50);
    expect(r.caps.join()).toContain('capped at 50');
  });
  it('proof 0 caps at 60', () => {
    const r = scoreTeach({ ...all(5), proof: 0 }, true);
    expect(r.total).toBe(60);
    expect(r.caps.join()).toContain('capped at 60');
  });
  it('out-of-range and missing lines are clamped to 0..5', () => {
    expect(scoreTeach({ demand: 9, viewer: -3 }, true).lines).toMatchObject({ demand: 5, viewer: 0, promise: 0 });
  });
});

it('matches the skill\'s score_idea.js on a sweep of inputs', () => {
  const ref = require(path.resolve(__dirname, '../../../../../.claude/skills/plan-live-session/scripts/score_idea.js')) as {
    scoreIdea: (l: IdeaLines, o: { proofGiven: boolean }) => { lines: IdeaLines; total: number };
  };
  const keys = Object.keys(IDEA_WEIGHTS) as (keyof IdeaLines)[];
  for (let seed = 0; seed < 400; seed += 1) {
    const lines = {} as IdeaLines;
    keys.forEach((k, i) => { lines[k] = (seed * (i + 3) + i * 7) % 6; });
    for (const proofGiven of [true, false]) {
      const a = scoreTeach(lines, proofGiven);
      const b = ref.scoreIdea(lines, { proofGiven });
      expect(a.total).toBe(b.total);
      expect(a.lines).toEqual(b.lines);
    }
  }
});

it('Viral and Convert clamp each line to its points and list the clamp', () => {
  const v = scoreViral({ hook: 25, retention: 15 });
  expect(v.lines.hook).toBe(20);
  expect(v.total).toBe(35);
  expect(v.caps[0]).toContain('hook');
  expect(scoreConvert({ buyerFit: 30, nextStep: 25, proof: 25, trust: 20 }).total).toBe(100);
});

it.each([[69.9, 'start_over'], [70, 'improve'], [84.9, 'improve'], [85, 'approve'], [89.9, 'approve'], [90, 'prioritize']])(
  'band boundary %s -> %s', (s, band) => { expect(bandOf(s as number)).toBe(band); });

describe('scoreTopic', () => {
  const full: TopicScoreInput = {
    teach: { demand: 5, viewer: 5, promise: 5, tension: 5, proof: 5, series: 5, news: 5 },
    viral: { ...VIRAL_WEIGHTS }, convert: { ...CONVERT_WEIGHTS }, factors: [3, 5, 9], proofGiven: true,
  };
  it('fewer than 3 viral factors needs an override even at 100', () => {
    const r = scoreTopic({ ...full, factors: [5, 5, 9, 11] });
    expect(r.factors).toEqual([5, 9]);
    expect(r.topicScore).toBe(100);
    expect(r.needsOverride).toBe(true);
    expect(r.passesGate).toBe(false);
    expect(r.flags[0]).toContain('needs at least 3');
  });
  it('3 factors and 85+ passes', () => {
    const r = scoreTopic(full);
    expect(r.passesGate).toBe(true);
    expect(r.band).toBe('prioritize');
  });
  it('same input, same output', () => {
    expect(scoreTopic(full)).toEqual(scoreTopic(JSON.parse(JSON.stringify(full)) as TopicScoreInput));
  });
});

it('normalizeFactors keeps distinct 1..10 sorted', () => {
  expect(normalizeFactors([9, 1, 1, 0, 10, 11, 2.5])).toEqual([1, 9, 10]);
});

it('recommendPick takes the best that clears the gate and has proof', () => {
  const mk = (s: number, passes: boolean, hasProof: boolean, name: string) => ({ name, hasProof, score: { topicScore: s, passesGate: passes } as ReturnType<typeof scoreTopic> });
  const pick = recommendPick([mk(90.8, true, false, 'no proof'), mk(89.6, true, true, 'sleep'), mk(88, true, true, 'shop'), mk(84.4, false, true, 'low')]);
  expect(pick?.name).toBe('sleep');
  expect(recommendPick([mk(84, false, true, 'x')])).toBeNull();
});

it('the ten viral factors read exactly as the research kit lists them', () => {
  // kit/research-2026-11-24.md, "The 10 viral factors".
  expect(Object.values(VIRAL_FACTORS)).toEqual(['Current events / breaking news', 'Controversy / debate', 'Celebrities / influential people',
    'Trending social topics', 'Money / economic opportunity', 'Emerging technology', 'Societal fears / uncertainty',
    'Major sports / entertainment events', 'Seasonal / cultural events', 'Extraordinary human achievement']);
});
