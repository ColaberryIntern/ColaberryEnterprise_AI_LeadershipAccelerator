import { STYLES } from '../landingPageStyles';

/**
 * One structural rule about the stylesheet, and it exists because breaking it shipped.
 *
 * A landing page section can carry `tone: "inverse"`, which puts `color:#FFFFFF` on the band.
 * Any component inside that band which paints its OWN light surface and inherits its colour
 * then renders white text on a near-white card. That is what happened on
 * /lp/colaberry-training/ai-learning-platform on 2026-10-12: a contrast card with four blank
 * chips, live, with every other test green. The component matrix tested each component once,
 * on a light section, so the combination that breaks was never rendered.
 *
 * A fixture can only cover combinations somebody thought of. This reads the stylesheet and
 * asks the question directly of every rule, so a component added next year is covered without
 * anyone remembering to place it in a dark band first.
 */

/** `selector{...}` pairs, with comments stripped so a commented example is not parsed as a rule. */
function rules(): Array<{ selector: string; body: string }> {
  const css = STYLES.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ selector: m[1].trim().replace(/\s+/g, ' '), body: m[2] }))
    // `@media (...)` wrappers survive the flat regex as a selector with no declarations of
    // their own; their inner rules are matched separately, which is what we want.
    .filter((r) => !r.selector.startsWith('@'));
}

/** Backgrounds that are light in every theme: the page grounds and any near-white literal. */
const LIGHT_BG = /background:\s*(var\(--bg(-elevated|-warm|-cool)?\)|#(F|f)[0-9A-Fa-f]{2,5}\b)/;

describe('a component that paints its own light surface also sets its own foreground', () => {
  it('the parser found a real stylesheet, otherwise every check below is vacuous', () => {
    const all = rules();
    expect(all.length).toBeGreaterThan(50);
    // Positive control on the exact rule the live bug was in.
    expect(all.some((r) => r.selector === '.contrast-card')).toBe(true);
  });

  it('every light-surfaced component is readable on the inverse band', () => {
    const all = rules();
    const selectorsOf = (r: { selector: string }) => r.selector.split(',').map((s) => s.trim());

    /** A selector is safe by EITHER of the two routes the stylesheet actually uses. */
    const isCovered = (sel: string): boolean =>
      // 1. It declares its own colour somewhere - the rule this file is named for.
      all.some((r) => selectorsOf(r).includes(sel) && /color:/.test(r.body))
      // 2. Or it has a `.band--inverse` override that repaints the surface dark, which is how
      //    the pre-v2 components (panel, cards, steps, tiles) solve it. Either is fine; having
      //    neither is the bug.
      || all.some((r) => selectorsOf(r).some((s) => s === `.band--inverse ${sel}`));

    const offenders = all
      .filter((r) => LIGHT_BG.test(r.body))
      .flatMap(selectorsOf)
      // Two exemptions, both because the rule cannot apply on a dark band:
      //   - a band's own background IS the page ground, not a card on it, and `band--inverse`
      //     is the very rule that sets the inherited colour;
      //   - a rule scoped INSIDE a light band (`.band--subtle .panel`) can never render on the
      //     inverse band, because a section carries one tone.
      //
      // THE SECOND EXEMPTION ASSUMES THE BRAND IS LIGHT, and that assumption is load-bearing.
      // Rendering the fixture under Refactored's dark system (#0C141B ground, light text) on
      // 2026-10-13 showed what it costs: `.band--subtle .panel{background:#FFFFFF}` and its
      // siblings hardcode a light surface, so on a dark brand the light `--fg` lands on white
      // and the hero panel, the icon tiles and two callouts render invisible - the same defect
      // this file exists to catch, arriving by a route it cannot see.
      //
      // The fix is to tokenize those literals rather than to loosen this test, and until that
      // lands no dark-first brand is wired. Stated here because a silent assumption is how the
      // first version of this bug shipped.
      .filter((sel) => !/^\.band--(?!inverse)/.test(sel))
      .filter((sel) => !isCovered(sel));

    expect([...new Set(offenders)]).toEqual([]);
  });

  it('the five components that shipped broken are each covered', () => {
    // Named explicitly. The sweep above passes vacuously if the parser ever stops matching,
    // and these are the exact selectors that rendered invisible text on a live page.
    ['.contrast-card', '.chips li', '.callout', '.gridlist', '.sidecard'].forEach((sel) => {
      const declaresColour = rules().some(
        (r) => r.selector.split(',').map((s) => s.trim()).includes(sel) && /color:/.test(r.body),
      );
      expect([sel, declaresColour]).toEqual([sel, true]);
    });
  });
});
