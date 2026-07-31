import { generateQuestion, rewriteTeach, rewriteStoryBeats, rewritePrompts } from '../kitConfigAi';
import * as envModule from '../../../config/env';

// Mock the env module so tests are deterministic regardless of the real
// environment's OPENAI_API_KEY, and mock the instrumented OpenAI client so
// no real network call is ever made.
jest.mock('../../../config/env', () => ({ env: { openaiApiKey: '', aiModel: 'gpt-4o-mini' } }));
const mockCreate = jest.fn();
jest.mock('../../openaiInstrumented', () => ({
  getInstrumentedOpenAI: () => ({ chat: { completions: { create: mockCreate } } }),
}));

describe('generateQuestion', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    envModule.env.openaiApiKey = '';
  });

  it('returns a deterministic scaffold question when no OpenAI key is configured (never calls the client)', async () => {
    const result = await generateQuestion({ segment: 'checkin', weekTitle: 'Week 1', contentSummary: 'CLAUDE.md content' });
    expect(result.source).toBe('scaffold');
    expect(result.question.segment).toBe('checkin');
    expect(result.question.q).toContain('Week 1');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('parses a valid AI JSON response into a well-shaped question', async () => {
    envModule.env.openaiApiKey = 'test-key';
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({
        kind: 'trivia', eyebrow: '🧠 Check', title: 'Quick check',
        q: 'What does CLAUDE.md do?', options: ['Nothing', 'Steers Claude', 'Deletes files', 'Runs tests'],
        answer: 1, reveal: 'It gives Claude your project conventions.',
      }) } }],
    });
    const result = await generateQuestion({ segment: 'trivia', weekTitle: 'Week 1', contentSummary: 'CLAUDE.md content' });
    expect(result.source).toBe('ai');
    expect(result.question).toEqual({
      segment: 'trivia', kind: 'trivia', eyebrow: '🧠 Check', title: 'Quick check',
      q: 'What does CLAUDE.md do?', options: ['Nothing', 'Steers Claude', 'Deletes files', 'Runs tests'],
      answer: 1, reveal: 'It gives Claude your project conventions.',
      // Always present (never undefined) so the field survives JSON
      // serialization — a real bug this test caught during Phase 1 review.
      theater: false, presenterTip: '',
    });
  });

  it('never returns a question that would lose a key over JSON (no undefined values)', async () => {
    // A poll response deliberately omits `answer` (not applicable to polls) —
    // the returned object must still round-trip through JSON with every key
    // the frontend expects present (as null/false/'' if not applicable),
    // never silently dropped the way `undefined` values are.
    envModule.env.openaiApiKey = 'test-key';
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ kind: 'poll', q: 'Pick one?', options: ['A', 'B'], reveal: 'Either way.' }) } }],
    });
    const result = await generateQuestion({ segment: 'checkin', weekTitle: 'Week 1', contentSummary: 'x' });
    const roundTripped = JSON.parse(JSON.stringify(result.question));
    expect(Object.keys(roundTripped).sort()).toEqual(['eyebrow', 'kind', 'options', 'presenterTip', 'q', 'reveal', 'segment', 'theater', 'title'].sort());
  });

  it('falls back to the scaffold when the AI response is missing required fields', async () => {
    envModule.env.openaiApiKey = 'test-key';
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: '{"kind":"trivia"}' } }] }); // no q/options
    const result = await generateQuestion({ segment: 'checkin', weekTitle: 'Week 1', contentSummary: 'x' });
    expect(result.source).toBe('scaffold');
  });

  it('falls back to the scaffold when the AI response is not valid JSON', async () => {
    envModule.env.openaiApiKey = 'test-key';
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'not json at all' } }] });
    const result = await generateQuestion({ segment: 'checkin', weekTitle: 'Week 1', contentSummary: 'x' });
    expect(result.source).toBe('scaffold');
  });

  it('retries on failure and returns the AI result once a retry succeeds', async () => {
    envModule.env.openaiApiKey = 'test-key';
    mockCreate
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({
          kind: 'poll', q: 'Pick one?', options: ['A', 'B'], reveal: 'Either is defensible.',
        }) } }],
      });
    const result = await generateQuestion({ segment: 'checkin', weekTitle: 'Week 1', contentSummary: 'x' });
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.source).toBe('ai');
    expect(result.question.q).toBe('Pick one?');
  }, 10000);

  it('falls back to the scaffold after all retries are exhausted', async () => {
    envModule.env.openaiApiKey = 'test-key';
    mockCreate.mockRejectedValue(new Error('persistent failure'));
    const result = await generateQuestion({ segment: 'checkin', weekTitle: 'Week 1', contentSummary: 'x' });
    expect(result.source).toBe('scaffold');
    expect(mockCreate).toHaveBeenCalledTimes(3); // initial + 2 retries
  }, 10000);
});

describe('rewriteTeach / rewriteStoryBeats / rewritePrompts', () => {
  const currentTeach = [{ segment: 'guided-build', eyebrow: '📄', title: 'Old lesson', body: 'Old body.' }];
  const currentBeats = [{ segment: 'business-problem', icon: '💡', eyebrow: 'Old', title: 'Old beat', body: 'Old body.', tone: 'berry' as const }];
  const currentPrompts = [{ label: 'Old prompt', prompt: 'Old text.' }];

  beforeEach(() => {
    mockCreate.mockReset();
    envModule.env.openaiApiKey = '';
  });

  it('rewriteTeach returns the current list unchanged (scaffold) with no OpenAI key configured', async () => {
    const result = await rewriteTeach({ weekTitle: 'Week 1', contentSummary: 'x', currentItems: currentTeach, instruction: 'make it about testing' });
    expect(result.source).toBe('scaffold');
    expect(result.items).toEqual(currentTeach);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rewriteTeach parses a valid AI response into normalized TeachSlide items', async () => {
    envModule.env.openaiApiKey = 'test-key';
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({
        items: [{ segment: 'guided-build', eyebrow: '🧪', title: 'New lesson', body: 'New body.', bullets: ['a', 'b'], code: { label: 'Try it', code: 'Do the thing.' }, script: 'Say this.' }],
      }) } }],
    });
    const result = await rewriteTeach({ weekTitle: 'Week 1', contentSummary: 'x', currentItems: currentTeach, instruction: 'add a testing example' });
    expect(result.source).toBe('ai');
    expect(result.items).toEqual([{ segment: 'guided-build', eyebrow: '🧪', title: 'New lesson', body: 'New body.', bullets: ['a', 'b'], code: { label: 'Try it', code: 'Do the thing.' }, script: 'Say this.' }]);
  });

  it('rewriteTeach drops invalid items (no title) but keeps valid ones from the same response', async () => {
    envModule.env.openaiApiKey = 'test-key';
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ items: [{ body: 'no title here' }, { title: 'Valid one', body: 'b' }] }) } }],
    });
    const result = await rewriteTeach({ weekTitle: 'Week 1', contentSummary: 'x', currentItems: currentTeach, instruction: 'x' });
    expect(result.source).toBe('ai');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe('Valid one');
  });

  it('rewriteTeach falls back to the current list if every returned item is invalid', async () => {
    envModule.env.openaiApiKey = 'test-key';
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ items: [{ body: 'no title' }] }) } }] });
    const result = await rewriteTeach({ weekTitle: 'Week 1', contentSummary: 'x', currentItems: currentTeach, instruction: 'x' });
    expect(result.source).toBe('scaffold');
    expect(result.items).toEqual(currentTeach);
  });

  it('rewriteStoryBeats parses a valid AI response, defaulting an invalid tone to "berry"', async () => {
    envModule.env.openaiApiKey = 'test-key';
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({
        items: [{ segment: 'architecture', icon: '🚀', eyebrow: 'New', title: 'New beat', body: 'New body.', tone: 'not-a-real-tone' }],
      }) } }],
    });
    const result = await rewriteStoryBeats({ weekTitle: 'Week 1', contentSummary: 'x', currentItems: currentBeats, instruction: 'x' });
    expect(result.source).toBe('ai');
    expect(result.items[0].tone).toBe('berry');
  });

  it('rewritePrompts parses a valid AI response into normalized ClassPrompt items', async () => {
    envModule.env.openaiApiKey = 'test-key';
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ items: [{ label: 'New prompt', prompt: 'New text.', ccMode: 'Plan Mode' }] }) } }],
    });
    const result = await rewritePrompts({ weekTitle: 'Week 1', contentSummary: 'x', currentItems: currentPrompts, instruction: 'x' });
    expect(result.source).toBe('ai');
    expect(result.items).toEqual([{ label: 'New prompt', prompt: 'New text.', ccMode: 'Plan Mode' }]);
  });

  it('rewritePrompts falls back to the current list on a non-JSON response', async () => {
    envModule.env.openaiApiKey = 'test-key';
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'not json' } }] });
    const result = await rewritePrompts({ weekTitle: 'Week 1', contentSummary: 'x', currentItems: currentPrompts, instruction: 'x' });
    expect(result.source).toBe('scaffold');
    expect(result.items).toEqual(currentPrompts);
  });
});
