/**
 * The triage service.
 *
 * Two things are being guarded here, and only one of them is behaviour.
 *
 * The behaviour: a reviewer that cannot answer must never be mistaken for a
 * reviewer with no objection. Every failure path — timeout, rate limit, garbage
 * JSON, a flag with no reason — has to land on `error`, because `no_concerns`
 * is the one verdict that takes a question off a human's reading list.
 *
 * The structure: this module must be incapable of approving anything. That is
 * asserted by reading the file, not by trusting the comment at the top of it.
 */
import fs from 'fs';
import path from 'path';

jest.mock('../../openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));

import { getInstrumentedOpenAI } from '../../openaiInstrumented';
import {
  triageQuestion,
  parseTriageResponse,
  __resetTriageClient,
  TriageInput,
} from '../certQuestionTriage';
import { needsHuman } from '../triageTypes';

const mCreate = jest.fn();
(getInstrumentedOpenAI as unknown as jest.Mock).mockReturnValue({
  chat: { completions: { create: mCreate } },
});

const reply = (content: string) => ({ choices: [{ message: { content } }] });

const question: TriageInput = {
  question_key: 'CCARF-D1-01',
  stem: 'An agent loop runs until the model stops requesting tools. What is missing?',
  options: [
    { key: 'A', text: 'A lower temperature' },
    { key: 'B', text: 'A maximum turn count and a defined behaviour at the cap' },
    { key: 'C', text: 'More tools' },
    { key: 'D', text: 'A larger context window' },
  ],
  correct_keys: ['B'],
  rationale: 'A loop with no upper bound has no failure mode short of exhaustion.',
  distractor_rationales: { A: 'Changes variety, not termination.', C: 'More ways to keep going.', D: 'Extends the runway.' },
  domain_id: 'D1',
  objective_id: 'D1.1',
};

beforeEach(() => {
  jest.clearAllMocks();
  __resetTriageClient();
  (getInstrumentedOpenAI as unknown as jest.Mock).mockReturnValue({
    chat: { completions: { create: mCreate } },
  });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => { (console.error as unknown as jest.Mock).mockRestore?.(); });

describe('a clean review', () => {
  it('returns no_concerns when the reviewer raises nothing', async () => {
    mCreate.mockResolvedValue(reply('{"verdict":"no_concerns","severity":null,"concerns":[]}'));
    const r = await triageQuestion(question);
    expect(r.verdict).toBe('no_concerns');
    expect(r.concerns).toEqual([]);
    expect(needsHuman(r.verdict)).toBe(false);
  });
});

describe('a review that finds something', () => {
  it('carries the concern through, naming the option it is about', async () => {
    mCreate.mockResolvedValue(reply(JSON.stringify({
      verdict: 'needs_human',
      severity: 'high',
      concerns: [{ kind: 'defensible_distractor', option: 'A', detail: 'A is arguably right under a fixed budget.' }],
    })));
    const r = await triageQuestion(question);
    expect(r.verdict).toBe('needs_human');
    expect(r.severity).toBe('high');
    expect(r.concerns[0]).toMatchObject({ kind: 'defensible_distractor', option: 'A' });
    expect(r.concerns[0].detail).toContain('fixed budget');
  });

  it('defaults severity to medium when the reviewer flags but omits it', async () => {
    mCreate.mockResolvedValue(reply(JSON.stringify({
      verdict: 'needs_human',
      concerns: [{ kind: 'other', option: null, detail: 'Something is off.' }],
    })));
    expect((await triageQuestion(question)).severity).toBe('medium');
  });

  it('a stated objection wins over a mislabelled verdict', async () => {
    // The mirror of the case below, and the more dangerous one: a reviewer that
    // articulates a real concern then says "no_concerns" would drop off the
    // human's list carrying the very reason it belonged on it.
    mCreate.mockResolvedValue(reply(JSON.stringify({
      verdict: 'no_concerns',
      severity: 'high',
      concerns: [{ kind: 'answer_disputed', option: 'A', detail: 'A is defensible under a fixed budget.' }],
    })));
    const r = await triageQuestion(question);
    expect(r.verdict).toBe('needs_human');
    expect(needsHuman(r.verdict)).toBe(true);
    expect(r.concerns[0].detail).toContain('fixed budget');
  });

  it('REJECTS a flag with no reason — an accusation with no detail is not actionable', async () => {
    mCreate.mockResolvedValue(reply('{"verdict":"needs_human","severity":"high","concerns":[]}'));
    const r = await triageQuestion(question);
    expect(r.verdict).toBe('error');
    expect(r.errorClass).toBe('ContractViolation');
  });
});

describe('a reviewer that cannot answer is NEVER treated as a reviewer with no objection', () => {
  it('malformed JSON becomes error, not no_concerns', async () => {
    mCreate.mockResolvedValue(reply('I think the answer is fine, actually.'));
    const r = await triageQuestion(question);
    expect(r.verdict).toBe('error');
    expect(r.errorClass).toBe('ContractViolation');
    expect(needsHuman(r.verdict)).toBe(true);   // an error still reaches a human
  });

  it('an unknown verdict string becomes error', async () => {
    mCreate.mockResolvedValue(reply('{"verdict":"looks_good","concerns":[]}'));
    expect((await triageQuestion(question)).verdict).toBe('error');
  });

  it('an empty response becomes error', async () => {
    mCreate.mockResolvedValue(reply(''));
    expect((await triageQuestion(question)).verdict).toBe('error');
  });

  it('a timeout becomes error with TimeoutError, and never throws', async () => {
    const err: any = new Error('Request timed out');
    err.name = 'APIConnectionTimeoutError';
    mCreate.mockRejectedValue(err);
    const r = await triageQuestion(question);
    expect(r.verdict).toBe('error');
    expect(r.errorClass).toBe('TimeoutError');
  });

  it('a rate limit is classified as such', async () => {
    const err: any = new Error('slow down'); err.status = 429;
    mCreate.mockRejectedValue(err);
    expect((await triageQuestion(question)).errorClass).toBe('RateLimitError');
  });
});

describe('the retry policy', () => {
  it('retries a 500 once, then gives up', async () => {
    const err: any = new Error('upstream'); err.status = 500;
    mCreate.mockRejectedValue(err);
    const r = await triageQuestion(question);
    expect(mCreate).toHaveBeenCalledTimes(2);
    expect(r.errorClass).toBe('UpstreamUnavailable');
  });

  it('does NOT retry a 4xx — it will not become a 200, and a retry just spends money', async () => {
    const err: any = new Error('bad request'); err.status = 400;
    mCreate.mockRejectedValue(err);
    await triageQuestion(question);
    expect(mCreate).toHaveBeenCalledTimes(1);
  });

  it('succeeds on the second attempt after a transient failure', async () => {
    const err: any = new Error('blip'); err.status = 503;
    mCreate.mockRejectedValueOnce(err)
      .mockResolvedValueOnce(reply('{"verdict":"no_concerns","concerns":[]}'));
    expect((await triageQuestion(question)).verdict).toBe('no_concerns');
  });
});

describe('an argument that loses is not a concern', () => {
  /**
   * The defect this replaced: v1 asked the reviewer to argue against every
   * answer and then decide, and it flagged 3 of the first 3 real questions —
   * with concerns that conceded the author's point and objected anyway. An
   * objection can be constructed against any question ever written, so a
   * reviewer reporting its argument rather than its judgement flags everything,
   * and a report that flags everything is the same as no triage.
   */
  it('argument_wins false means no_concerns, whatever else the model said', async () => {
    mCreate.mockResolvedValue(reply(JSON.stringify({
      argument_against: 'One could argue parallelism is also architectural.',
      argument_wins: false,
      verdict: 'needs_human',                                  // model contradicts itself
      concerns: [{ kind: 'defensible_distractor', option: 'A', detail: 'A could be considered.' }],
    })));
    const r = await triageQuestion(question);
    expect(r.verdict).toBe('no_concerns');
    expect(r.concerns).toEqual([]);
  });

  it('argument_wins true keeps the concern', async () => {
    mCreate.mockResolvedValue(reply(JSON.stringify({
      argument_against: 'C is the same claim in different words.',
      argument_wins: true,
      verdict: 'needs_human',
      severity: 'high',
      concerns: [{ kind: 'defensible_distractor', option: 'C', detail: 'C states the same rule as B.' }],
    })));
    const r = await triageQuestion(question);
    expect(r.verdict).toBe('needs_human');
    expect(r.concerns).toHaveLength(1);
  });

  it('the prompt tells the reviewer that finding an argument is not a finding', async () => {
    mCreate.mockResolvedValue(reply('{"argument_wins":false,"verdict":"no_concerns","concerns":[]}'));
    await triageQuestion(question);
    const system = mCreate.mock.calls[0][0].messages[0].content as string;
    expect(system).toContain('"I found an argument" is not a finding');
    expect(system).toContain('only when your argument WINS');
    expect(system).toContain('is the normal,');   // "...normal, expected outcome"
  });
});

describe('the prompt argues against the answer', () => {
  it('tells the reviewer to break the question, not confirm it', async () => {
    mCreate.mockResolvedValue(reply('{"verdict":"no_concerns","concerns":[]}'));
    await triageQuestion(question);
    const system = mCreate.mock.calls[0][0].messages[0].content as string;
    expect(system).toContain('AGAINST the marked answer');
    expect(system).toContain('does it actually DEFEAT');
  });

  it('shows the reviewer which option is marked correct and why', async () => {
    mCreate.mockResolvedValue(reply('{"verdict":"no_concerns","concerns":[]}'));
    await triageQuestion(question);
    const user = mCreate.mock.calls[0][0].messages[1].content as string;
    expect(user).toContain('MARKED CORRECT');
    expect(user).toContain('no failure mode short of exhaustion');
  });

  it('runs at temperature 0 and demands JSON', async () => {
    mCreate.mockResolvedValue(reply('{"verdict":"no_concerns","concerns":[]}'));
    await triageQuestion(question);
    const params = mCreate.mock.calls[0][0];
    expect(params.temperature).toBe(0);
    expect(params.response_format).toEqual({ type: 'json_object' });
  });
});

describe('it cannot approve anything — asserted structurally', () => {
  /**
   * CODE ONLY, COMMENTS STRIPPED. The first version of this grepped the raw
   * file and failed — because the module's own doc block says "it does not
   * import setReviewStatus", and the test matched the sentence promising the
   * guarantee rather than the absence of the thing. A structural assertion that
   * can be satisfied or broken by prose is not structural.
   */
  const raw = fs.readFileSync(path.join(__dirname, '..', 'certQuestionTriage.ts'), 'utf8');
  const source = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
    .replace(/\/\/.*$/gm, '');          // line comments

  it('does not import or call setReviewStatus', () => {
    expect(source).not.toMatch(/setReviewStatus/);
  });

  it('does not touch CertQuestionRevision', () => {
    expect(source).not.toMatch(/CertQuestionRevision/);
  });

  it('never mentions review_status or approved as a value it could write', () => {
    expect(source).not.toMatch(/review_status/);
  });

  it('writes nothing to the database — no query, no update, no save', () => {
    // `.create(` alone would match chat.completions.create, which is the whole
    // point of the module. Match the persistence calls specifically.
    expect(source).not.toMatch(/sequelize\.query/);
    expect(source).not.toMatch(/\.update\(/);
    expect(source).not.toMatch(/\.save\(/);
    expect(source).not.toMatch(/findOrCreate|bulkCreate|upsert/);
  });
});
