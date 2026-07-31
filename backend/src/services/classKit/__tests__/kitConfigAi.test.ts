import { generateQuestion } from '../kitConfigAi';
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
    });
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
