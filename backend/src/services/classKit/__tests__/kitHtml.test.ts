import { interactionHtml } from '../kitHtml';
import { KitSlide } from '../kitSpec';

/**
 * classkit-deck-polish (T003). `interactionHtml()` renders the plain
 * (non-theater) poll/trivia/prediction view. Proves the `data-correct`
 * highlight logic is genuinely kind-agnostic — gated only on
 * `typeof answer === 'number'`, never on `kind` — so T003's fix (broadening
 * the Customize UI's answer-selector beyond trivia) is sufficient on its own,
 * with no change needed here.
 */

function makeSlide(kind: 'trivia' | 'poll' | 'prediction', answer: number | undefined): KitSlide {
  return {
    id: 's1', kind: 'interaction', title: 'Q', segment_label: 'checkin', mode: 'story',
    interaction: {
      kind, q: 'Which one?', options: ['A', 'B', 'C'], answer,
      reveal: 'B is right because...',
    },
  } as unknown as KitSlide;
}

describe('interactionHtml — data-correct is kind-agnostic', () => {
  it('marks the right option data-correct="1" for a TRIVIA question with an answer', () => {
    const html = interactionHtml(makeSlide('trivia', 1));
    expect(html).toContain('data-correct="1"><span class="kletter">B');
    expect(html).not.toContain('data-correct="1"><span class="kletter">A');
  });

  it('marks the right option data-correct="1" for a POLL with an answer (the actual bug this run fixes)', () => {
    const html = interactionHtml(makeSlide('poll', 1));
    expect(html).toContain('data-correct="1"><span class="kletter">B');
  });

  it('marks the right option data-correct="1" for a PREDICTION with an answer', () => {
    const html = interactionHtml(makeSlide('prediction', 1));
    expect(html).toContain('data-correct="1"><span class="kletter">B');
  });

  it('marks no option as correct when answer is undefined (a pure opinion poll, no wrong reading)', () => {
    const html = interactionHtml(makeSlide('poll', undefined));
    expect(html).not.toContain('data-correct="1"');
    const correctCount = (html.match(/data-correct="1"/g) || []).length;
    expect(correctCount).toBe(0);
  });

  it('returns empty string when the slide has no interaction', () => {
    const slide = { id: 's1', kind: 'interaction', title: 'Q', segment_label: 'checkin', mode: 'story' } as unknown as KitSlide;
    expect(interactionHtml(slide)).toBe('');
  });

  it('the reveal button is present whenever a reveal line is authored, regardless of kind', () => {
    const html = interactionHtml(makeSlide('poll', undefined));
    expect(html).toContain('kreveal-btn');
    expect(html).toContain('kreveal-line');
  });
});
