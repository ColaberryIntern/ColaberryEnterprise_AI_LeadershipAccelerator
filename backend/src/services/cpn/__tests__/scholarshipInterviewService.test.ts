/**
 * The scholarship interview's guardrails, pinned.
 *
 * MOST OF THIS FILE TESTS THE PROMPT, WHICH IS UNUSUAL AND DELIBERATE.
 *
 * The rules that make this interview safe to point at a scholarship applicant do
 * not live in control flow. They live in instructions to a model: never ask about
 * money or immigration status or health, never make somebody argue for their own
 * worth, never imply a decision that nobody is authorised to make yet. A future
 * edit that tightens the wording and drops one of those lines would change
 * nothing observable, break no test, and quietly start asking a person who is
 * asking for help what they have overcome.
 *
 * So the guarantees are asserted as guarantees. If a line goes, this goes red.
 */
jest.mock('../../runtime/runtimeAi', () => ({ chatJson: jest.fn() }));

import {
  buildInterviewPrompt,
  nextInterviewMessage,
  summariseForReviewer,
  interviewTranscript,
  MAX_EXCHANGES,
} from '../scholarshipInterviewService';
import { chatJson } from '../../runtime/runtimeAi';

const mChat = chatJson as unknown as jest.Mock;

beforeEach(() => mChat.mockReset());

/** `n` completed exchanges, alternating applicant and interviewer. */
function turns(n: number) {
  const out: Array<{ role: 'user' | 'assistant'; text: string }> = [];
  for (let i = 0; i < n; i += 1) {
    out.push({ role: 'user', text: `applicant message ${i}` });
    out.push({ role: 'assistant', text: `interviewer message ${i}` });
  }
  return out;
}

describe('what the interview may never ask', () => {
  const prompt = buildInterviewPrompt({ name: 'Sam' }, 0).toLowerCase();

  it.each([
    ['money', 'money'],
    ['debt', 'debt'],
    ['benefits', 'benefits'],
    ['immigration status', 'immigration'],
    ['health or disability', 'health'],
    ['who they live with', 'who they live with'],
  ])('forbids asking about %s', (_label, needle) => {
    expect(prompt).toContain(needle);
  });

  it('forbids making somebody justify their own worth', () => {
    // The specific phrasing matters less than that the rule is stated. Both of
    // these are the questions the programme exists not to ask.
    expect(prompt).toContain('deserve');
    expect(prompt).toContain('justify themselves');
  });

  it('forbids implying a decision, because there is no decision to imply', () => {
    // Eligibility and the selection process do not exist yet - /scholarships/
    // says so in public. An interview that hinted a good answer helps would be
    // contradicting the page it sits on.
    expect(prompt).toContain('never imply a decision');
    expect(prompt).toContain('not assessing');
  });

  it('forbids promising an email, because this domain cannot send one', () => {
    expect(prompt).toContain('do not promise an email');
  });

  it('asks about the week in hours rather than about commitment', () => {
    // "Can you commit?" invites everyone to say yes and tells you nothing.
    expect(prompt).toContain('not their commitment');
  });
});

describe('the cap is enforced in code, not requested in the prompt', () => {
  it('closes the interview at the cap without calling the model at all', async () => {
    const res = await nextInterviewMessage({ turns: turns(MAX_EXCHANGES) });

    expect(res).toMatchObject({ ok: true, done: true });
    // The point of the cap: a model that wants to keep going does not get to.
    expect(mChat).not.toHaveBeenCalled();
  });

  it('is shorter than a business discovery call', () => {
    // Flotation runs to twelve. This is somebody describing their life, and past
    // eight it stops being a conversation and starts being a screening.
    expect(MAX_EXCHANGES).toBeLessThan(12);
  });

  it('warns the model to wrap up as the cap approaches', () => {
    expect(buildInterviewPrompt({}, MAX_EXCHANGES - 1)).toContain('exchanges left');
    expect(buildInterviewPrompt({}, 0)).not.toContain('exchanges left');
  });
});

describe('failure never lands on the applicant', () => {
  it('reports empty input rather than sending an empty prompt', async () => {
    const res = await nextInterviewMessage({ turns: [] });

    expect(res).toMatchObject({ ok: false, error_class: 'EmptyInput' });
    expect(mChat).not.toHaveBeenCalled();
  });

  it('reports an empty model response rather than sending a blank message', async () => {
    mChat.mockResolvedValue({ parsed: { message: '   ' }, runtime_ms: 1, cost_usd: 0 });

    expect(await nextInterviewMessage({ turns: turns(1) })).toMatchObject({
      ok: false,
      error_class: 'EmptyModelResponse',
    });
  });

  it('a failed summary returns null instead of throwing away the interview', async () => {
    // The transcript is already saved by the time this runs. Losing the summary
    // means a reviewer reads the raw conversation - worse, not lost.
    mChat.mockRejectedValue(new Error('upstream down'));

    await expect(summariseForReviewer({ transcript: 'applicant: hello' })).resolves.toBeNull();
  });

  it('does not call the model for an empty transcript', async () => {
    expect(await summariseForReviewer({ transcript: '   ' })).toBeNull();
    expect(mChat).not.toHaveBeenCalled();
  });
});

describe('the reviewer brief is prose, and carries no judgement', () => {
  it('instructs against scoring, ranking or recommending', async () => {
    mChat.mockResolvedValue({ parsed: { summary: 'They want to build an app.' }, runtime_ms: 1, cost_usd: 0 });

    await summariseForReviewer({ transcript: 'applicant: I want to build an app' });

    const system = String(mChat.mock.calls[0][1]).toLowerCase();
    expect(system).toContain('score, rank, rate or grade');
    expect(system).toContain('do not');
    // Named explicitly because "strong candidate" is the exact phrase a summariser
    // reaches for when told not to score.
    expect(system).toContain('strong candidate');
  });

  it('instructs it to leave volunteered hardship in the transcript', async () => {
    mChat.mockResolvedValue({ parsed: { summary: 'x' }, runtime_ms: 1, cost_usd: 0 });

    await summariseForReviewer({ transcript: 'applicant: hello' });

    const system = String(mChat.mock.calls[0][1]).toLowerCase();
    expect(system).toContain('leave it in the transcript');
  });
});

describe('the transcript is what was said', () => {
  it('labels the two sides without renaming what either of them said', () => {
    const t = interviewTranscript([
      { role: 'user', text: 'I want to build a rota app for my church' },
      { role: 'assistant', text: 'What does a normal week look like for you?' },
    ]);

    expect(t).toBe(
      'applicant: I want to build a rota app for my church\n' +
        'interviewer: What does a normal week look like for you?'
    );
  });
});
