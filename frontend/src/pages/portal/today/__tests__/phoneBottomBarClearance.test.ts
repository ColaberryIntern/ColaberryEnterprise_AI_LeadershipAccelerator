import fs from 'fs';
import path from 'path';

/**
 * Both phone tab bars pad themselves with env(safe-area-inset-bottom) so their
 * own contents clear the gesture bar. Anything that reserves room ABOVE one of
 * them has to add the same inset, or the bar is taller than the space kept for
 * it and the foot of the page sits underneath.
 *
 * That is exactly what shipped: `.te-main` reserved a flat 84px and `.cm-cc`
 * a flat 66px. On a phone with an inset the Today page's ring row lost the
 * bottom half of its labels and the campus concierge card was cut off
 * mid-sentence, with nothing to show more followed. Reported by Mohammed Abdul
 * Aleem on 2026-11-18 with screenshots from a 360px Android.
 *
 * jsdom loads no external stylesheet and resolves no env(), so no render test
 * can catch this. The stylesheet source is the only place the contract exists.
 */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const read = (p: string) => strip(fs.readFileSync(path.join(__dirname, p), 'utf8'));

const TODAY = read('../TodayShell.css');
const CAMPUS_HOME = read('../../../../components/campus/campusHome.css');
const CAMPUS = read('../../../../components/campus/campus.css');

/**
 * Every rule body whose selector list contains EXACTLY this selector.
 *
 * Exactly, because a substring test is what made the first cut of this file
 * lie: `.cm-cc` also appears inside `.cm-home.is-reduced .cm-cc`, and taking
 * the last such match read back `animation:none` and reported a defect that
 * was not there. A rule may legitimately appear more than once (a base rule
 * plus a media override), so callers assert that SOME body carries the
 * contract.
 */
export function rulesFor(css: string, selector: string): string[] {
  const out: string[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' '));
    if (selectors.includes(selector)) out.push(m[2]);
  }
  return out;
}

const SAFE_AREA = /env\(\s*safe-area-inset-bottom/;
const some = (bodies: string[], ...patterns: RegExp[]) =>
  bodies.some((b) => patterns.every((p) => p.test(b)));

describe('the phone tab bars still pad themselves with the safe-area inset', () => {
  // If this stops being true, the clearances below are measuring nothing.
  it('.te-tabbar does', () => {
    const bodies = rulesFor(TODAY, '.te-tabbar');
    expect(bodies.length).toBeGreaterThan(0);
    expect(some(bodies, SAFE_AREA)).toBe(true);
  });

  it('.cm-tabbar does', () => {
    const bodies = rulesFor(CAMPUS, '.cm-tabbar');
    expect(bodies.length).toBeGreaterThan(0);
    expect(some(bodies, SAFE_AREA)).toBe(true);
  });
});

describe('content reserves the same inset it has to clear', () => {
  it('REGRESSION: .te-main adds the inset to its bottom padding, not a bare constant', () => {
    const bodies = rulesFor(TODAY, '.te-main');
    expect(bodies.length).toBeGreaterThan(0);
    expect(some(bodies, /padding:/, SAFE_AREA)).toBe(true);
  });

  it('REGRESSION: the campus concierge card clears the bar by inset + constant', () => {
    const bodies = rulesFor(CAMPUS_HOME, '.cm-cc');
    expect(bodies.length).toBeGreaterThan(0);
    expect(some(bodies, /bottom:/, SAFE_AREA)).toBe(true);
  });
});

describe('the phone header drops the product subtitle', () => {
  /**
   * The header is a flex row and `.te-brand` carries min-width:0, so it shrinks
   * — but the subtitle has no truncation of its own. It bottoms out at its
   * longest word, wraps to four lines, and the right-hand buttons then overflow
   * back across the text. Photographed 2026-11-18.
   */
  it('REGRESSION: .te-brand--site>span is hidden at the phone breakpoint', () => {
    const bodies = rulesFor(TODAY, '.te-brand--site>span');
    expect(bodies.length).toBeGreaterThan(0);
    expect(some(bodies, /display:\s*none/)).toBe(true);
  });

  it('and does so inside a phone media query, not everywhere', () => {
    // The subtitle must survive on a desktop; only the phone drops it.
    expect(TODAY).toMatch(/@media\s*\(\s*max-width:\s*820px\s*\)\s*\{\s*\.te-brand--site>span\{display:none\}\s*\}/);
  });
});
