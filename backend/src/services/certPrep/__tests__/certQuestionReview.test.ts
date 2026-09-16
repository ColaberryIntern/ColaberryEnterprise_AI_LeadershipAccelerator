jest.mock('../../openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));

import { getInstrumentedOpenAI } from '../../openaiInstrumented';
import {
  reviewQuestion, blindAnswer, parseBlindResponse, __resetTriageClient, TriageInput,
} from '../certQuestionTriage';
import { BLIND_MODEL, TRIAGE_MODEL, TRIAGE_PROMPT_VERSION } from '../triageTypes';

/**
 * The v3 review: a blind read first, then the argue-against step, then one
 * verdict. These hold the mapping that turns two model opinions into a reading
 * order a person can trust:
 *
 *   blind disagrees          -> HIGH, answer_disputed, no argue call spent
 *   blind agrees, argue high -> HIGH
 *   blind agrees, argue med  -> LOW  (on the record, off the reading list)
 *   blind agrees, argue none -> no_concerns
 *   blind unavailable        -> the argue verdict alone, marked so
 *
 * The motivating run: v2 flagged 53 of 100 items, all medium, all hedged.
 */

const mCreate = jest.fn();
(getInstrumentedOpenAI as unknown as jest.Mock).mockReturnValue({
  chat: { completions: { create: mCreate } },
});

const reply = (content: string) => ({ choices: [{ message: { content } }] });
const blindReply = (answer: string, confidence = 'sure', runner_up: string | null = null) =>
  reply(JSON.stringify({ answer, confidence, runner_up, why: `Because ${answer}.` }));
const argueClean = reply('{"argument_against":"weak","argument_wins":false,"verdict":"no_concerns","severity":null,"concerns":[]}');
const argueMedium = reply('{"argument_against":"B is arguable","argument_wins":true,"verdict":"needs_human","severity":"medium","concerns":[{"kind":"defensible_distractor","option":"B","detail":"B could be seen as valid."}]}');
const argueHigh = reply('{"argument_against":"key is wrong","argument_wins":true,"verdict":"needs_human","severity":"high","concerns":[{"kind":"answer_disputed","option":"C","detail":"C is plainly correct."}]}');

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
  distractor_rationales: { A: 'no', C: 'no', D: 'no' },
  domain_id: 'D1',
  objective_id: 'D1.1',
};

beforeEach(() => {
  jest.clearAllMocks();
  __resetTriageClient();
  (getInstrumentedOpenAI as unknown as jest.Mock).mockReturnValue({ chat: { completions: { create: mCreate } } });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { (console.error as unknown as jest.Mock).mockRestore?.(); });

describe('the blind read', () => {
  it('sees the question and the options, never the key or the rationales', async () => {
    mCreate.mockResolvedValueOnce(blindReply('B'));
    await blindAnswer(question);
    const call = mCreate.mock.calls[0][0];
    const user = call.messages.find((m: any) => m.role === 'user').content as string;
    expect(user).toContain(question.stem);
    expect(user).toContain('B. A maximum turn count');
    expect(user).not.toMatch(/MARKED CORRECT|author says|REASONING/);
    expect(user).not.toContain(question.rationale);
    expect(call.model).toBe(BLIND_MODEL);
    expect(call.temperature).toBe(0);
  });

  it('reports whether the answer agrees with the key', () => {
    expect(parseBlindResponse('{"answer":"B","confidence":"sure","runner_up":null,"why":"x"}', question)!.agrees).toBe(true);
    expect(parseBlindResponse('{"answer":"c","confidence":"close","runner_up":"B","why":"x"}', question)).toMatchObject({ answer: 'C', agrees: false, runner_up: 'B' });
  });

  it('is null - not a wrong answer - when the reply names no option or is not JSON', () => {
    expect(parseBlindResponse('{"answer":"Z"}', question)).toBeNull();
    expect(parseBlindResponse('not json', question)).toBeNull();
    expect(parseBlindResponse('', question)).toBeNull();
  });

  it('is null for a multi-select item, where "the answer" has no single value', async () => {
    expect(await blindAnswer({ ...question, correct_keys: ['A', 'B'] })).toBeNull();
    expect(mCreate).not.toHaveBeenCalled();
  });
});

describe('reviewQuestion', () => {
  it('a blind disagreement is HIGH and answer_disputed, and spends no argue call', async () => {
    mCreate.mockResolvedValueOnce(blindReply('C', 'sure'));
    const r = await reviewQuestion(question);
    expect(r.verdict).toBe('needs_human');
    expect(r.severity).toBe('high');
    expect(r.concerns[0]).toMatchObject({ kind: 'answer_disputed', option: 'C' });
    expect(r.concerns[0].detail).toMatch(/A reader without the key chose C \(sure\)/);
    expect(r.concerns[0].detail).toMatch(/The key is B/);
    expect(r.blind).toMatchObject({ answer: 'C', agrees: false });
    expect(mCreate).toHaveBeenCalledTimes(1);
  });

  it('a blind agreement followed by a clean argument is no_concerns', async () => {
    mCreate.mockResolvedValueOnce(blindReply('B')).mockResolvedValueOnce(argueClean);
    const r = await reviewQuestion(question);
    expect(r.verdict).toBe('no_concerns');
    expect(r.blind).toMatchObject({ answer: 'B', agrees: true });
    expect(mCreate).toHaveBeenCalledTimes(2);
    expect(mCreate.mock.calls[1][0].model).toBe(TRIAGE_MODEL);
  });

  it('a blind agreement followed by a medium argument drops to LOW, and says why', async () => {
    // This is the 53-of-100 case: an argument the reviewer built after seeing
    // the key, which a reader who did not know the key was not moved by.
    mCreate.mockResolvedValueOnce(blindReply('B', 'sure')).mockResolvedValueOnce(argueMedium);
    const r = await reviewQuestion(question);
    expect(r.verdict).toBe('needs_human');
    expect(r.severity).toBe('low');
    expect(r.concerns[0].detail).toMatch(/^Blind read agreed with the key \(sure\)\. B could be seen as valid\./);
  });

  it('a blind agreement followed by a HIGH argument stays high', async () => {
    mCreate.mockResolvedValueOnce(blindReply('B')).mockResolvedValueOnce(argueHigh);
    const r = await reviewQuestion(question);
    expect(r.severity).toBe('high');
    expect(r.concerns[0].detail).toBe('C is plainly correct.');
  });

  it('when the blind read is unavailable, the argue verdict stands unchanged and is marked so', async () => {
    const err: any = new Error('bad request'); err.status = 400;
    mCreate.mockRejectedValueOnce(err).mockResolvedValueOnce(argueMedium);
    const r = await reviewQuestion(question);
    expect(r.blind).toBeNull();
    expect(r.severity).toBe('medium');
    expect(r.concerns[0].detail).toMatch(/^Blind read unavailable\. /);
  });

  it('an argue-step error is still an error, never no_concerns', async () => {
    mCreate.mockResolvedValueOnce(blindReply('B')).mockResolvedValueOnce(reply('garbage'));
    const r = await reviewQuestion(question);
    expect(r.verdict).toBe('error');
  });

  it('is versioned so a v3 run is a new opinion, not a duplicate of v2 rows', () => {
    expect(TRIAGE_PROMPT_VERSION).toBe('v3-blind-then-argue');
  });
});
