/**
 * documentChecksAI — OpenAI mocked. Proves: no key → null (honest "not run"); evaluator takes the median of 3 and
 * flags a 2+ adjectival-level spread; proof flags an unbacked claim; a per-check upstream error fails soft (0 score +
 * finding) without sinking the others.
 */
const createMock = jest.fn();
jest.mock('../../../openaiInstrumented', () => ({ getInstrumentedOpenAI: () => ({ chat: { completions: { create: (...a: any[]) => createMock(...a) } } }) }));

import { runAiChecks } from '../documentChecksAI';

const reply = (obj: any) => ({ choices: [{ message: { content: JSON.stringify(obj) } }] });

beforeEach(() => { jest.clearAllMocks(); process.env.OPENAI_API_KEY = 'test-key'; });
afterAll(() => { delete process.env.OPENAI_API_KEY; });

function routeByPrompt(evalScores: number[]) {
  let evalIdx = 0;
  return async ({ messages }: any) => {
    const sys = String(messages[0].content);
    if (/evaluator/i.test(sys)) { const s = evalScores[evalIdx++ % evalScores.length]; return reply({ score: s, rationale: 'r' }); }
    if (/claims are backed/i.test(sys)) return reply({ claims: [{ text: 'We are ISO certified', backed: false }, { text: 'We built the demo', backed: true }] });
    if (/clarity/i.test(sys)) return reply({ score: 88, issues: ['Tighten the opening theme statement.'] });
    return reply({});
  };
}

describe('runAiChecks', () => {
  it('returns null when there is no API key (honest "not run")', async () => {
    delete process.env.OPENAI_API_KEY;
    expect(await runAiChecks({ docKey: 'technical', title: 'Technical', contentHtml: '<p>x</p>' })).toBeNull();
  });

  it('takes the median evaluator score and flags a 2+ adjectival-level spread', async () => {
    createMock.mockImplementation(routeByPrompt([95, 70, 72])); // levels 4,2,2 → spread 2 → flagged; median 72
    const r = await runAiChecks({ docKey: 'technical', title: 'Technical', contentHtml: '<p>approach</p>', scoringFactors: [{ label: 'Technical', points: 40 }] });
    expect(r).not.toBeNull();
    expect(r!.scores.evaluator).toBe(72);
    expect(r!.findings.some((f) => f.check === 'evaluator' && /disagree/i.test(f.message))).toBe(true);
  });

  it('flags an unbacked claim in the proof check and scores by backed fraction', async () => {
    createMock.mockImplementation(routeByPrompt([90, 90, 90]));
    const r = await runAiChecks({ docKey: 'technical', title: 'Technical', contentHtml: '<p>claims</p>', backingRefs: ['built the demo on 2026-11-01'] });
    expect(r!.scores.proof).toBe(50); // 1 of 2 claims backed
    expect(r!.findings.some((f) => f.check === 'proof' && /Unbacked claim/i.test(f.message))).toBe(true);
    expect(r!.scores.clarity).toBe(88);
  });

  it('T11: runs the three judges independently and returns one distinct judge run per judge', async () => {
    createMock.mockImplementation(routeByPrompt([90, 90, 90]));
    const r = await runAiChecks({ docKey: 'technical', title: 'Technical', contentHtml: '<p>approach</p>' });
    expect(r!.judgeRuns).toHaveLength(3);
    expect(r!.judgeRuns!.map((j) => j.judge).sort()).toEqual(['clarity', 'evaluator', 'proof']);
    expect(new Set(r!.judgeRuns!.map((j) => j.runId)).size).toBe(3); // distinct ids per judge
  });

  it('fails soft per-check: an evaluator upstream error scores it 0 without throwing, clarity still scores', async () => {
    createMock.mockImplementation(async ({ messages }: any) => {
      const sys = String(messages[0].content);
      if (/evaluator/i.test(sys)) throw new Error('429 rate limited');
      if (/clarity/i.test(sys)) return reply({ score: 80, issues: [] });
      return reply({ claims: [{ text: 'a', backed: true }] });
    });
    const r = await runAiChecks({ docKey: 'technical', title: 'Technical', contentHtml: '<p>x</p>' });
    expect(r!.scores.evaluator).toBe(0);
    expect(r!.scores.clarity).toBe(80);
    expect(r!.findings.some((f) => f.check === 'evaluator' && /could not run/i.test(f.message))).toBe(true);
  });
});
