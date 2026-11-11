import fs from 'fs';
import path from 'path';

/**
 * THE BUG THIS FILE EXISTS FOR, seen in a screenshot on 2026-11-11.
 *
 * The Audience and Access mode options tore out of their cards and stretched across the whole
 * browser window. The page was unusable, and nothing failed: every test passed, both typechecks
 * passed, the axe suite passed.
 *
 * The cause was a NAME COLLISION I introduced in one stylesheet. `.cls-options` and
 * `.cls-option` already existed, as the grid for those two cards. The staff picker reused both
 * names for its dropdown, and its rules - `position: absolute; left: 0; right: 0` - landed
 * later in the file and therefore won.
 *
 * ## Why no existing check could see it
 *
 * A collision inside one stylesheet is legal CSS, legal TypeScript, and invisible to a render
 * test that queries by `data-testid`. The only thing that notices is a person looking at the
 * page.
 *
 * So this is the cheap structural check: a selector may not be DEFINED TWICE with conflicting
 * layout intent in this file. It will not catch every cascade mistake, and it catches this one.
 */

const CSS = fs.readFileSync(
  path.join(__dirname, '..', 'studioSetup.css'),
  'utf8',
);

/** Every class selector this stylesheet defines a rule for, in order. */
function definedSelectors(css: string): string[] {
  const out: string[] = [];
  // Rule heads only: the text before each `{`, with comments stripped first so prose that
  // mentions a class name is not read as a rule.
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of bare.matchAll(/(^|\})\s*([^{}@]+)\{/g)) {
    const head = m[2].trim();
    if (!head || head.startsWith('@')) continue;
    for (const sel of head.split(',')) {
      const cls = /\.([\w-]+)/.exec(sel.trim());
      if (cls) out.push(cls[1]);
    }
  }
  return out;
}

describe('the studio stylesheet', () => {
  const selectors = definedSelectors(CSS);

  it('reads a non-trivial number of rules, so a clean result is not an empty parse', () => {
    // Guards the guard: a regex that silently stopped matching would make every check below
    // pass by looking at nothing.
    expect(selectors.length).toBeGreaterThan(40);
  });

  /**
   * THE ONE THAT MATTERS. Two unrelated components sharing a class name in one file is how the
   * Audience grid ended up absolutely positioned across the viewport.
   *
   * Styling a base class and then a variant of it is normal and allowed - what is checked is
   * that the PICKER's names and the CARD's names are disjoint sets, because those are the two
   * that collided and they belong to different components.
   */
  it('keeps the picker dropdown and the option CARDS on different class names', () => {
    const cardNames = selectors.filter((s) => /^cls-option/.test(s));
    const pickerNames = selectors.filter((s) => /^cls-pick/.test(s));

    expect(cardNames.length).toBeGreaterThan(0);
    expect(pickerNames.length).toBeGreaterThan(0);
    expect(cardNames.filter((n) => pickerNames.includes(n))).toEqual([]);
  });

  it('never absolutely positions the option CARDS, which live in a grid', () => {
    // The exact symptom: `.cls-options` taken out of flow pulled both cards' contents across
    // the window. The grid declaration is the one that must survive.
    expect(CSS).toMatch(/\.cls-options\s*\{[^}]*display:\s*grid/);
    const optionsRules = Array.from(CSS.matchAll(/\.cls-options\s*\{([^}]*)\}/g));
    expect(optionsRules).toHaveLength(1);
    expect(optionsRules[0][1]).not.toMatch(/position:\s*absolute/);
  });

  it('CONTROL: the detector would notice a duplicate definition', () => {
    const sample = '.a { color: red } .b { color: blue } .a { color: green }';
    const found = definedSelectors(sample);
    expect(found).toEqual(['a', 'b', 'a']);
    expect(found.filter((s) => s === 'a')).toHaveLength(2);
  });
});
