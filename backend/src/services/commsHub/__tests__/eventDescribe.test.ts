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

  it('replaces dashes cleanly and strips wrapping quotes', () => {
    expect(cleanDescription('"Live builds \u2014 real feedback."')).toBe('Live builds, real feedback.');
  });

  // Every string the CH3.2 attempt-1 verifier leaked through the first guard, verbatim.
  it.each([
    'We start at 6 p.m. sharp.', 'Doors open 9 a.m. Central.', 'See you Dec 1st.', 'Mark Nov 24th.', 'Join us on December 1st.',
    'See you 1 December.', 'It runs 2026-12-01.', 'Doors open at 18:30.', 'Starts at 6:30 sharp.', 'Kicks off at noon.',
    'Join at 23:00 UTC.', 'Link: bit.ly/demo1', 'Join at zoom.us/j/123', 'Every Tues.', 'Tickets are \u20AC10.', '12.01.2026',
    'Totally fr\u200Bee', 'Totally \uFF46\uFF52\uFF45\uFF45.',
    // attempt-2 verifier leaks
    'See you Dec. 3.', 'Nov. 24, 2026.', 'It costs 10 bucks.', 'Cost: USD 10.', 'Tickets: 10\u20AC.', 'Rs. 500 to join.',
    'Join us at 7.', 'Join on the 3rd.', 'Starts @ 6.', 'Seats open next week.', 'It starts in 2 days.',
  ])('drops "%s"', (leak) => {
    // A probe with no closing punctuation would run into the next sentence and take it down too
    // (the conservative outcome); terminating it tests exactly the leak.
    const probe = /[.!?]$/.test(leak) ? leak : `${leak}.`;
    expect(cleanDescription(`Good intro sentence. ${probe} Closing line here.`)).toBe('Good intro sentence. Closing line here.');
  });

  it('an unterminated leak is still dropped, even if it takes the next sentence with it', () => {
    expect(cleanDescription('Good intro sentence. Join at zoom.us/j/123 Closing line here.')).toBe('Good intro sentence.');
  });

  it('control: ordinary sentences with numbers or short words survive', () => {
    const ok = 'Three builders show 2 projects each. Bring one question about agents. We review 10 pull requests live.';
    expect(cleanDescription(ok)).toBe(ok);
  });

  it('control: the over-broad drops the verifier found are gone', () => {
    const ok = 'We sat down with the founders. Bring 2-3 questions. See the sun and moon projects. Learn how agents work et cetera.';
    expect(cleanDescription(ok)).toBe(ok);
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
    expect(call.force).toBe(true); // a retry must produce a new draft, not the cached one
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
