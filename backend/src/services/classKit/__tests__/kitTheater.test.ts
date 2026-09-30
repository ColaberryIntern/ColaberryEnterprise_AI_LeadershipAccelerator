import { theaterHtml } from '../kitTheater';
import { KitSlide } from '../kitSpec';

/**
 * classkit-live-polish (T005). `theaterHtml()` is a pure string-builder (real
 * execution, not a mock) — genuinely testable, unlike `kitDeckScript.ts`'s
 * client-side render functions, which have no browser-execution harness in
 * this repo (a disclosed, pre-existing limitation; verified there via
 * string-content assertions on the compiled script instead).
 */

function makeSlide(overrides: Partial<KitSlide['interaction']> = {}): KitSlide {
  return {
    id: 's1', kind: 'interaction', title: 'Q', segment_label: 'checkin', mode: 'story',
    interaction: {
      kind: 'trivia', q: 'A or B?', options: ['A', 'B'], answer: 1,
      reveal: 'B is correct because...', theater: true, ...overrides,
    },
  } as unknown as KitSlide;
}

describe('theaterHtml', () => {
  it('returns empty string for a slide with no interaction', () => {
    const slide = { id: 's1', kind: 'interaction', title: 'Q', segment_label: 'checkin', mode: 'story' } as unknown as KitSlide;
    expect(theaterHtml(slide)).toBe('');
  });

  it('renders a data-role="correct-list" element, hidden by default, inside .ktheater', () => {
    const html = theaterHtml(makeSlide());
    expect(html).toContain('<div class="ktheater">');
    expect(html).toContain('data-role="correct-list"');
    expect(html).toContain('class="ktheater-correct"');
    // Hidden until the deck script reveals it — no correct-responders list
    // should be visible on the initial (voting-open) render.
    const correctListMatch = html.match(/<div class="ktheater-correct" data-role="correct-list"[^>]*>/);
    expect(correctListMatch?.[0]).toContain('display:none');
  });

  it('the correct-list element is empty at render time (the deck script populates it client-side on reveal)', () => {
    const html = theaterHtml(makeSlide());
    expect(html).toContain('data-role="correct-list" style="display:none"></div>');
  });
});
