jest.mock('../../openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));

import { askCora, coraContext, firstSentences, numbersGrounded } from '../coraService';
import type { Dashboard } from '../prepViews';

const dash: Dashboard = {
  anchorId: 'i1',
  readiness: { value: 64, target: 75, trend: [] },
  interviews: [{ id: 'i1', source: 'real', company: 'Acme', role: 'AI Engineer', type: 'technical', target: 75 }],
  skills: [{ key: 'few_fillers', label: 'Few filler words', score: 48, change30: 6, count: 4, sources: ['video'] }, { key: 'proof_of_work', label: 'Proof of work', count: 0, sources: [] }],
  sources: { video: 4, phone_mock: 0, real_interview: 0, training: 0, project: 0 },
  weeklyMinutes: [], streak: 3, thisWeek: 40,
};
const reply = (r: string) => JSON.stringify({ reply: r });

beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => undefined));
afterEach(() => jest.restoreAllMocks());

describe('coraContext', () => {
  it('holds only computed metrics, and leaves out a skill with no score', () => {
    const c = coraContext(dash);
    expect(c).toContain('Readiness: 64; ready at 75.');
    expect(c).toContain('Skill Few filler words: 48 (change over the last month: 6).');
    expect(c).not.toMatch(/(100|30)/); // no incidental numbers Cora could then cite
    expect(c).not.toContain('Proof of work');
    expect(c).toContain('Practice streak: 3 days.');
  });
  it('says so plainly when there is no data', () => {
    expect(coraContext({ ...dash, readiness: undefined, skills: [], anchorId: undefined, streak: 0, thisWeek: 0 })).toBe('No practice data yet.');
  });
});

describe('the number guard', () => {
  it('passes numbers from the context and rejects any other', () => {
    const c = coraContext(dash);
    expect(numbersGrounded('You are at 64 and ready at 75.', c)).toBe(true);
    expect(numbersGrounded('You are at 82.', c)).toBe(false);
    expect(numbersGrounded('No numbers here.', c)).toBe(true);
  });

  it('accepts a grounded first answer, trimmed to 3 sentences', async () => {
    const call = jest.fn(async () => reply('You are at 64. Ready is 75. Practice fillers. Then rest. Done.'));
    const r = await askCora('How am I doing?', dash, call);
    expect(r).toEqual({ messages: ['You are at 64. Ready is 75. Practice fillers.'], grounded: true, unavailable: false });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('rejects an invented number and retries once with a warning', async () => {
    const call = jest.fn().mockResolvedValueOnce(reply('You will hit 90 by Friday.')).mockResolvedValueOnce(reply('You are at 64; aim for 75.'));
    const r = await askCora('When will I be ready?', dash, call);
    expect(r.messages).toEqual(['You are at 64; aim for 75.']);
    expect(call.mock.calls[1][2]).toContain('a number that is not in CONTEXT');
  });

  it('then asks for no digits at all, and finally falls back to a fixed line', async () => {
    const noDigits = jest.fn().mockResolvedValueOnce(reply('90.')).mockResolvedValueOnce(reply('91.')).mockResolvedValueOnce(reply('Keep practicing your opening.'));
    expect((await askCora('?', dash, noDigits)).messages).toEqual(['Keep practicing your opening.']);
    const stubborn = jest.fn().mockResolvedValue(reply('Score 99.'));
    const r = await askCora('?', dash, stubborn);
    expect(r.grounded).toBe(false);
    expect(r.messages[0]).not.toMatch(/\d/);
    expect(stubborn).toHaveBeenCalledTimes(3);
  });

  it('rejects a reply that breaks a compliance rule exactly like an invented number', async () => {
    const call = jest.fn()
      .mockResolvedValueOnce(reply('Finish this plan and you are guaranteed a job.'))
      .mockResolvedValueOnce(reply('Practice your opening tonight.'));
    expect((await askCora('?', dash, call)).messages).toEqual(['Practice your opening tonight.']);
    const noCost = jest.fn().mockResolvedValue(reply('That workshop is free.'));
    const r = await askCora('?', dash, noCost);
    expect(r.grounded).toBe(false);
    expect(r.messages[0]).not.toMatch(/free/i);
  });

  it('stops retrying once the 20 second budget is spent', async () => {
    let t = 0;
    const clock = () => t;
    const call = jest.fn(async () => { t += 21_000; return reply('You will hit 90.'); });
    const r = await askCora('?', dash, call, clock);
    expect(call).toHaveBeenCalledTimes(1);
    expect(r.grounded).toBe(false);
  });

  it('answers politely, never crashing, when the model times out or returns garbage', async () => {
    const timedOut = await askCora('?', dash, async () => { throw Object.assign(new Error('timeout'), { status: 504 }); });
    expect(timedOut.messages[0]).toMatch(/could not answer/);
    expect(timedOut.unavailable).toBe(true);
    expect((await askCora('?', dash, async () => 'not json')).messages[0]).toMatch(/could not answer/);
    expect((await askCora('?', dash, async () => null)).messages[0]).toMatch(/could not answer/);
  });
});

describe('firstSentences', () => {
  it('keeps at most three sentences', () => {
    expect(firstSentences('One. Two! Three? Four.')).toBe('One. Two! Three?');
    expect(firstSentences('No end mark')).toBe('No end mark');
  });
});
