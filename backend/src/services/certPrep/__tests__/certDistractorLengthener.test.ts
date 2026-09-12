jest.mock('../../openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));

import { getInstrumentedOpenAI } from '../../openaiInstrumented';
import { lengthenDistractor, buildLengthenPrompt, __resetLengthenerClient } from '../certDistractorLengthener';
import { lengthPlan } from '../certOptionLength';
import { ImproverItem } from '../certQuestionImprover';

/**
 * The lengthener's guarantees, around a faked model: only the target option
 * changes, a reply outside the bounds is refused (after one more try), a 4xx
 * is not retried, and the input is never mutated.
 */

const mCreate = jest.fn();
(getInstrumentedOpenAI as unknown as jest.Mock).mockReturnValue({
  chat: { completions: { create: mCreate } },
});

const reply = (text: string) => ({ choices: [{ message: { content: JSON.stringify({ text }) } }] });

/** A well-formed item whose key is the longest option and whose hash does not keep it. */
function itemWithLongKey(): ImproverItem {
  let n = 0;
  for (;;) {
    const it: ImproverItem = {
      question_key: `CCARF-D3-${40 + n}`,
      domain_id: 'D3',
      objective_id: 'D3.2',
      stem: 'Monitoring shows that about one run in six fails to reach the deploy step. Engineers report it cannot be reproduced locally. What is the most likely cause?',
      options: [
        { key: 'A', text: 'Retry the failed step with exponential backoff and a capped number of attempts' },
        { key: 'B', text: 'Increase the timeout on the step so slow runs have time to finish' },
        { key: 'C', text: 'Move the step before the checkout so it cannot depend on it' },
        { key: 'D', text: 'Disable the step and rely on the downstream check' },
      ],
      correct_keys: ['A'],
      rationale: 'Intermittent and unreproducible locally points at a race; a bounded retry is the standard response.',
      distractor_rationales: { B: 'Slowness would reproduce.', C: 'Changes the dependency rather than the race.', D: 'Removes the check.' },
    };
    if (lengthPlan(it).target) return it;
    n += 1;
  }
}

beforeEach(() => { mCreate.mockReset(); __resetLengthenerClient(); });

describe('lengthenDistractor', () => {
  it('replaces ONLY the target option and leaves the rest byte-identical', async () => {
    const before = itemWithLongKey();
    const plan = lengthPlan(before);
    const snapshot = JSON.stringify(before);
    const longer = 'Increase the timeout on the step so slow runs have time to finish, and record how long each one took';
    expect(longer.length).toBeGreaterThanOrEqual(plan.minChars);
    expect(longer.length).toBeLessThanOrEqual(plan.maxChars);
    mCreate.mockResolvedValueOnce(reply(longer));

    const out = await lengthenDistractor(before, plan);
    expect(out.status).toBe('lengthened');
    if (out.status !== 'lengthened') return;
    expect(out.item.options.find((o) => o.key === plan.target)!.text).toBe(longer);
    for (const o of before.options) {
      if (o.key === plan.target) continue;
      expect(out.item.options.find((x) => x.key === o.key)!.text).toBe(o.text);
    }
    expect(out.item.stem).toBe(before.stem);
    expect(out.item.correct_keys).toEqual(before.correct_keys);
    expect(out.item.rationale).toBe(before.rationale);
    expect(out.item.distractor_rationales).toEqual(before.distractor_rationales);
    // the key is no longer the longest
    expect(lengthPlan(out.item).keyIsLongest).toBe(false);
    // and the input was not touched
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('strips a letter label the model put in front, and measures the words without it', async () => {
    const before = itemWithLongKey();
    const plan = lengthPlan(before);
    const words = 'Increase the timeout on the step so slow runs have time to finish, and record how long each one took';
    expect(words.length).toBeGreaterThanOrEqual(plan.minChars);
    mCreate.mockResolvedValueOnce(reply(`${plan.target}. ${words}`));
    const out = await lengthenDistractor(before, plan);
    expect(out.status).toBe('lengthened');
    if (out.status !== 'lengthened') return;
    expect(out.item.options.find((o) => o.key === plan.target)!.text).toBe(words);
    expect(out.after).toBe(words.length);
  });

  it('refuses a fluent rewrite even when it fits the bounds perfectly', async () => {
    const before = itemWithLongKey();
    const plan = lengthPlan(before);
    // Same idea, entirely different words, exactly the right length: this is
    // what the model returned 36 times out of 45 on the first authored run.
    const rewrite = 'Extend the permitted duration for that operation so unhurried executions conclude'
      + ' properly within the allotted window';
    expect(rewrite.length).toBeGreaterThanOrEqual(plan.minChars);
    expect(rewrite.length).toBeLessThanOrEqual(plan.maxChars);
    mCreate.mockResolvedValue(reply(rewrite));
    const out = await lengthenDistractor(before, plan);
    expect(out.status).toBe('not_an_extension');
    if (out.status === 'not_an_extension') expect(out.reason).toMatch(/rewritten rather than extended|opening word/);
    // tried twice: the model sometimes honours the instruction on a second pass
    expect(mCreate).toHaveBeenCalledTimes(2);
  });

  it('tells the model the word to start with and how to end', () => {
    const before = itemWithLongKey();
    const plan = lengthPlan(before);
    const target = before.options.find((o) => o.key === plan.target)!;
    const p = buildLengthenPrompt(before, plan);
    expect(p).toContain(`START WITH THE SAME WORD the option starts with now ("${target.text.split(' ')[0]}")`);
    expect(p).toContain('no full stop, so yours must not add one');
    expect(p).toMatch(/KEEP THE WORDS THAT ARE THERE/);
  });

  it('tries once more on a reply outside the bounds, then refuses', async () => {
    const before = itemWithLongKey();
    const plan = lengthPlan(before);
    mCreate.mockResolvedValueOnce(reply('too short'));
    mCreate.mockResolvedValueOnce(reply('x'.repeat(plan.maxChars + 50)));
    const out = await lengthenDistractor(before, plan);
    expect(out.status).toBe('out_of_bounds');
    expect(mCreate).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 4xx', async () => {
    const before = itemWithLongKey();
    const err: any = new Error('bad request'); err.status = 400;
    mCreate.mockRejectedValueOnce(err);
    const out = await lengthenDistractor(before, lengthPlan(before));
    expect(out.status).toBe('failed');
    if (out.status === 'failed') expect(out.error_class).toBe('BadRequestError');
    expect(mCreate).toHaveBeenCalledTimes(1);
  });

  it('refuses a plan with no target without calling the model', async () => {
    const before = itemWithLongKey();
    const out = await lengthenDistractor(before, { ...lengthPlan(before), target: null });
    expect(out.status).toBe('invariant_violated');
    expect(mCreate).not.toHaveBeenCalled();
  });
});

describe('buildLengthenPrompt', () => {
  it('names the option, its bounds and the author\'s reason it is wrong', () => {
    const before = itemWithLongKey();
    const plan = lengthPlan(before);
    const p = buildLengthenPrompt(before, plan);
    expect(p).toContain(`OPTION TO REWRITE: ${plan.target}`);
    expect(p).toContain(`between ${plan.minChars} and ${plan.maxChars}`);
    expect(p).toContain(before.distractor_rationales![plan.target!]);
    expect(p).toMatch(/must stay wrong/);
  });
});
