/**
 * §2 is the hard part of this feature, not the conversation.
 *
 * "Do not convert traditional discovery forms into conversational questionnaires. Every
 * question must have a reason." The lazy version of an AI interview walks the twenty
 * dimensions and asks twenty questions, which is a WORSE experience than the form it
 * replaces — slower, and it feels like an interrogation.
 *
 * And an interview that never ends is a bad interview and an unbounded bill, so the cap is
 * enforced in code rather than requested of the model.
 */

const mockChatJson = jest.fn();
jest.mock('../../runtime/runtimeAi', () => ({ chatJson: (...a: any[]) => mockChatJson(...a) }));

import {
  nextInterviewMessage,
  buildInterviewPrompt,
  interviewTranscript,
  MAX_EXCHANGES,
} from '../flotationInterviewService';

const ok = (parsed: any) => ({ parsed, runtime_ms: 800, cost_usd: 0.001 });

const userTurns = (n: number) =>
  Array.from({ length: n }, (_, i) => [
    { role: 'user' as const, text: `answer ${i}` },
    { role: 'assistant' as const, text: `question ${i}` },
  ]).flat();

beforeEach(() => {
  jest.clearAllMocks();
  mockChatJson.mockResolvedValue(ok({ message: 'Who else touches that spreadsheet?', done: false }));
});

describe('the conversation', () => {
  it('returns the next question', async () => {
    const result = await nextInterviewMessage({
      turns: [{ role: 'user', text: 'Our dispatchers rebuild a report every morning.' }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.done).toBe(false);
    expect(result.message).toBe('Who else touches that spreadsheet?');
  });

  it('refuses to call the model before anyone has said anything', async () => {
    const result = await nextInterviewMessage({ turns: [] });

    expect(result).toMatchObject({ ok: false, error_class: 'EmptyInput' });
    expect(mockChatJson).not.toHaveBeenCalled();
  });

  it('ignores blank turns rather than sending them to the model', async () => {
    const result = await nextInterviewMessage({ turns: [{ role: 'user', text: '   ' }] });
    expect(result).toMatchObject({ ok: false, error_class: 'EmptyInput' });
  });

  it('reports an unusable response instead of showing the customer nothing', async () => {
    mockChatJson.mockResolvedValue(ok({ done: false }));

    const result = await nextInterviewMessage({ turns: [{ role: 'user', text: 'hello' }] });
    expect(result).toMatchObject({ ok: false, error_class: 'EmptyModelResponse' });
  });

  it('passes the whole conversation so far, labelled by speaker', async () => {
    await nextInterviewMessage({
      turns: [
        { role: 'user', text: 'We rebuild a Power BI report daily.' },
        { role: 'assistant', text: 'Who rebuilds it?' },
        { role: 'user', text: 'Ralph does.' },
      ],
    });

    const [, , user] = mockChatJson.mock.calls[0];
    expect(user).toContain('human: We rebuild a Power BI report daily.');
    expect(user).toContain('assistant: Who rebuilds it?');
    expect(user).toContain('human: Ralph does.');
  });

  it('nudges the opening to reflect what they already typed', async () => {
    await nextInterviewMessage({ turns: [{ role: 'user', text: 'first thing they typed' }] });
    const [, , user] = mockChatJson.mock.calls[0];
    expect(user).toContain('reflecting back what they already told you');
  });
});

describe('the cap is enforced in code, not requested of the model', () => {
  it('closes the interview once the exchange limit is reached', async () => {
    const result = await nextInterviewMessage({ turns: userTurns(MAX_EXCHANGES) });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.done).toBe(true);
    // A model that wants to keep asking does not get to.
    expect(mockChatJson).not.toHaveBeenCalled();
  });

  it('does not charge for the closing turn', async () => {
    const result = await nextInterviewMessage({ turns: userTurns(MAX_EXCHANGES) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cost_usd).toBe(0);
  });

  it('still runs normally one exchange below the cap', async () => {
    await nextInterviewMessage({ turns: userTurns(MAX_EXCHANGES - 1) });
    expect(mockChatJson).toHaveBeenCalled();
  });

  it('honours the model deciding it is done before the cap', async () => {
    mockChatJson.mockResolvedValue(ok({ message: 'Thanks — writing this up now.', done: true }));

    const result = await nextInterviewMessage({ turns: [{ role: 'user', text: 'lots of detail' }] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.done).toBe(true);
  });

  it('warns the model when it is nearly out of exchanges', () => {
    expect(buildInterviewPrompt({}, MAX_EXCHANGES - 2)).toContain('exchanges left');
    expect(buildInterviewPrompt({}, 1)).not.toContain('exchanges left');
  });
});

describe('the prompt enforces §2 rather than hoping for it', () => {
  const prompt = buildInterviewPrompt({ name: 'Ali', company: 'Colaberry' }, 2);

  it('forbids the questionnaire this replaces, in the strongest terms available', () => {
    expect(prompt).toContain('A QUESTION YOU COULD HAVE ANSWERED YOURSELF IS A FAILURE');
    expect(prompt).toContain('that is the form this is replacing');
  });

  it('demands one question at a time', () => {
    expect(prompt).toContain('ONE question at a time');
  });

  it('tells it to skip anything that would not change what gets built', () => {
    expect(prompt).toContain('would not change the work');
  });

  it('bans the vocabulary that makes software people sound like software people', () => {
    expect(prompt).toContain('requirements');
    expect(prompt).toContain('stakeholders');
  });

  it('carries what we already know, so it does not ask for it again', () => {
    expect(prompt).toContain('Ali');
    expect(prompt).toContain('Colaberry');
  });

  it('never promises an email, since nothing sends one', () => {
    expect(prompt).toContain('Do not promise an email');
  });

  it('is deterministic', () => {
    expect(buildInterviewPrompt({ name: 'Ali' }, 3)).toBe(buildInterviewPrompt({ name: 'Ali' }, 3));
  });
});

describe('interviewTranscript', () => {
  it('labels speakers the way the chat extractor expects', () => {
    const transcript = interviewTranscript([
      { role: 'user', text: 'Ralph rebuilds it.' },
      { role: 'assistant', text: 'Every morning?' },
    ]);

    // The extractor's quote check treats "human" as the customer; an assistant line quoted
    // as if the customer said it must remain detectable.
    expect(transcript).toBe('human: Ralph rebuilds it.\nassistant: Every morning?');
  });
});
