jest.mock('../../openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));

import { CRITERIA, readReview, reviewContent, SYSTEM, userPrompt } from '../hireVideoContent';

/** The content review is grounded: quotes must really be in the transcript, and failure never blocks coaching. */
const TRANSCRIPT = 'Hi, I am Ann, an AI engineer looking for an applied ML role. I built a triage agent that cut response time from 4 hours to 20 minutes.';

describe('readReview', () => {
  test('keeps our criteria in our order, and drops a quote that is not in the transcript', () => {
    const r = readReview(JSON.stringify({
      points: [
        { key: 'proof', level: 'strong', note: 'Clear result.', quote: 'cut response time from 4 hours to 20 minutes' },
        { key: 'intro', level: 'ok', note: 'Say the company type.', quote: 'I am the best engineer alive' },
        { key: 'made_up', level: 'strong', note: 'x', quote: null },
      ],
      topTip: 'Name the team size.',
    }), TRANSCRIPT)!;
    expect(r.points.map((p) => p.key)).toEqual(['intro', 'proof']);
    expect(r.points[0].quote).toBeNull();
    expect(r.points[1].quote).toBe('cut response time from 4 hours to 20 minutes');
    expect(r.points[1].label).toBe(CRITERIA.find((c) => c.key === 'proof')!.label);
  });

  test('malformed replies are null', () => {
    expect(readReview('not json', TRANSCRIPT)).toBeNull();
    expect(readReview({ points: [{ key: 'intro', level: 'great', note: 'x' }], topTip: 'y' }, TRANSCRIPT)).toBeNull();
    expect(readReview({ points: [], topTip: 'y' }, TRANSCRIPT)).toBeNull();
  });
});

describe('reviewContent', () => {
  test('too little said is not judged, and the model is never called', async () => {
    const call = jest.fn();
    expect(await reviewContent('hi there', 10, call)).toBeNull();
    expect(call).not.toHaveBeenCalled();
  });

  test('a failed call is null, so delivery coaching still ships', async () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await reviewContent(TRANSCRIPT, 30, async () => { throw Object.assign(new Error('x'), { status: 429 }); })).toBeNull();
    expect(spy.mock.calls[0][0]).toContain('RateLimitError');
    spy.mockRestore();
  });

  test('the prompt bars protected traits and marks the opening', () => {
    expect(SYSTEM).toMatch(/Never comment on accent/);
    expect(userPrompt(TRANSCRIPT, 30, 'Hi, I am Ann')).toContain('[0-15s]: """Hi, I am Ann"""');
  });
});
