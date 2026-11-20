const mockLLM = jest.fn();
jest.mock('../../llmCallWrapper', () => ({ callLLMWithAudit: (...a: unknown[]) => mockLLM(...a) }));

import { cleanDescription, describeEvent, DescribeInput, DescribeRefusedError, COMMS_HUB_LLM_NAMESPACE } from '../eventDescribe';

/** CH3.2 "Write with AI": through the wrapper, and code removes any fact the model was told not to state. */
describe('cleanDescription', () => {
  it('keeps a clean description as it is', () => {
    expect(cleanDescription('Three builders show what they shipped. Bring one question.')).toBe('Three builders show what they shipped. Bring one question.');
  });

  it('drops every sentence that states a date, time, zone, link, price or the word free', () => {
    const raw = [
      'Three builders show what they shipped.',
      'Join us Tuesday at 6 PM.',
      'It starts at 18:30 CST.',
      'Register at https://eventbrite.com/e/1.',
      'Seats are free for members.',
      'It costs $0 to attend.',
      'See you on Nov 24.',
      'Bring one question.',
    ].join(' ');
    expect(cleanDescription(raw)).toBe('Three builders show what they shipped. Bring one question.');
  });

  it('replaces dashes and strips wrapping quotes', () => {
    expect(cleanDescription('"Live builds — real feedback."')).toBe('Live builds , real feedback.');
  });
});

describe('describeEvent', () => {
  beforeEach(() => mockLLM.mockReset());

  it('calls the audited wrapper with a valid UUID namespace and the event facts, and returns the cleaned text', async () => {
    mockLLM.mockResolvedValue({ content: 'Builders demo live. Tonight at 7 PM.', usage: {}, cacheHit: false });
    const text = await describeEvent(DescribeInput.parse({ title: 'Demo Tuesday', event_type: 'session', hosts: ['Aleem'], notes: 'demo day' }));
    expect(text).toBe('Builders demo live.');
    const call = mockLLM.mock.calls[0][0];
    expect(call.lessonId).toBe(COMMS_HUB_LLM_NAMESPACE);
    expect(call.lessonId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(call.userPrompt).toContain('Demo Tuesday');
    expect(call.userPrompt).toContain('Aleem');
    expect(call.systemPrompt).toMatch(/Never state a date/);
  });

  it('a draft that is all forbidden facts is refused rather than returned empty', async () => {
    mockLLM.mockResolvedValue({ content: 'Tuesday at 6 PM. Free for everyone.', usage: {}, cacheHit: false });
    await expect(describeEvent(DescribeInput.parse({ title: 'X' }))).rejects.toThrow(DescribeRefusedError);
  });

  it('input is validated: unknown keys and an empty title are rejected', () => {
    expect(DescribeInput.safeParse({ title: '' }).success).toBe(false);
    expect(DescribeInput.safeParse({ title: 'x', date: '2026-12-01' }).success).toBe(false);
  });
});
