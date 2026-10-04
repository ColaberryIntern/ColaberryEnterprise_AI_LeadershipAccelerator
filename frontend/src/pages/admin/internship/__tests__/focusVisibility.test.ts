import fs from 'fs';
import path from 'path';

/**
 * Focus must stay visible on this page's stylesheet.
 *
 * `.aint-search input` switches its outline off because it sits inside a styled pill, and for a long
 * time nothing put the ring back — a keyboard user tabbing into the applicant queue had no visible
 * focus at all. Found 2026-10-02 while scoping the Intern Console's accessibility gate; it was
 * already on `origin/main`, so it predates the console.
 *
 * **The requirement is "focus is visible", not "the file never switches an outline off".** Removing
 * the suppression would draw a second rectangle inside the pill, so the fix moves the ring to the
 * wrapper. This test asserts the real property: every suppression is paired with a rule that puts a
 * focus indicator back on the same component.
 *
 * A stylesheet text assertion is weaker than a computed style, and it is what this repo can run
 * today — there is no jest-axe and no browser here. Phase 7's Playwright pass checks the computed
 * outline on the live page, which is the stronger form of the same check.
 */
const CSS_PATH = path.join(__dirname, '..', 'adminInternship.css');
const CSS = fs.readFileSync(CSS_PATH, 'utf8');

/**
 * Comments are stripped first.
 *
 * Not a nicety: the comment explaining the fix quotes the very declaration it explains, so a scanner
 * that reads comments reports the explanation as a second defect. The first version of this test did
 * exactly that and failed on its own prose.
 */
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** The selectors that switch an outline off. */
export const suppressions = (css: string): string[] =>
  stripComments(css)
    .split('}')
    .filter((block) => /outline:\s*(none|0)\b/.test(block))
    .map((block) => block.split('{')[0].trim())
    .filter(Boolean);

describe('the stylesheet never leaves focus invisible', () => {
  it('finds exactly the one known suppression, and no prose', () => {
    expect(suppressions(CSS)).toEqual(['.aint-search input']);
  });

  it('pairs that suppression with a focus indicator on the same component', () => {
    for (const selector of suppressions(CSS)) {
      // '.aint-search input' -> '.aint-search'
      const component = selector.split(' ')[0];
      const hasRing = new RegExp(`\\${component}:focus(-within|-visible)[^{]*\\{[^}]*outline:\\s*(?!none|0\\b)`);
      expect(stripComments(CSS)).toMatch(hasRing);
    }
  });

  it('gives the search pill a real ring, not a colour change', () => {
    // A background tint alone disappears in high-contrast mode and for anyone who has adjusted
    // their colours. The ring is an outline with an offset, per the design system.
    expect(stripComments(CSS)).toMatch(/\.aint-search:focus-within\s*\{[^}]*outline:\s*3px solid var\(--color-primary-light\)/);
    expect(stripComments(CSS)).toMatch(/\.aint-search:focus-within\s*\{[^}]*outline-offset:\s*2px/);
  });

  it('POSITIVE CONTROL: the detector finds a suppression that has no ring', () => {
    // Without this, every assertion above would pass just as happily against a detector that finds
    // nothing at all.
    const bad = '.thing input{outline:none}\n.other{color:red}';

    expect(suppressions(bad)).toEqual(['.thing input']);
    expect(bad).not.toMatch(/:focus(-within|-visible)/);
  });

  it('POSITIVE CONTROL: comments are stripped rather than scanned', () => {
    // The exact trap this test fell into: prose quoting the declaration it describes.
    const prose = '/* we set outline:none here on purpose */\n.a{color:red}';

    expect(suppressions(prose)).toEqual([]);
  });

  it('does not mistake a real outline for a suppression', () => {
    // `.aint-wk.gate` outlines the weeks 1-3 gate. A scanner that flagged it would report the
    // console's own focus-safe styling as a defect.
    expect(suppressions('.aint-wk.gate{outline:1px solid var(--color-primary)}')).toEqual([]);
  });
});
