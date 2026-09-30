/**
 * Guards the fix for: "the answers in the Week 1 final Evaluation section are
 * not highlighted once you select a response" (reported 2026-08-11).
 *
 * The panel renders in two scopes — the Runtime Workspace (under `.rt`, which
 * defines a full token set) and the Classroom drawer (under `.tl-de`, which
 * defines only a handful). It used to consume `.rt`'s tokens without declaring
 * them, so in the drawer `border:1.5px solid var(--line)` was invalid at
 * computed-value time (border-style fell back to `none`) and
 * `background:var(--berry-soft)` resolved to transparent. A selected answer was
 * pixel-identical to an unselected one.
 *
 * Rather than pin the specific tokens that happened to break, this asserts the
 * invariant that prevents the whole class of bug: every custom property the
 * stylesheet READS, it must also DEFINE. Add a new `var(--x)` without defining
 * it and this test fails before it reaches a student.
 */

import { asCss } from '../AssessmentPanel';

/** Every `--token` this stylesheet reads via var(). */
function tokensUsed(css: string): Set<string> {
  return new Set(Array.from(css.matchAll(/var\((--[a-z0-9-]+)/gi), (m) => m[1]));
}

/** Every `--token` this stylesheet defines (i.e. `--token:` outside a var() call). */
function tokensDefined(css: string): Set<string> {
  const defined = new Set<string>();
  for (const m of css.matchAll(/(?:^|[;{\s])(--[a-z0-9-]+)\s*:/gi)) defined.add(m[1]);
  return defined;
}

describe('AssessmentPanel stylesheet', () => {
  it('defines every custom property it consumes, so it renders identically in the drawer and the workspace', () => {
    const used = tokensUsed(asCss);
    const defined = tokensDefined(asCss);
    const undefinedTokens = [...used].filter((t) => !defined.has(t)).sort();

    expect(undefinedTokens).toEqual([]);
  });

  it('still consumes the tokens the selected-answer state depends on', () => {
    // Cheap canary: if the highlight rule is refactored away entirely, the
    // invariant test above would pass vacuously. This keeps it honest.
    const used = tokensUsed(asCss);
    expect(used.has('--line')).toBe(true);
    expect(used.has('--berry-soft')).toBe(true);
    expect(used.has('--paper')).toBe(true);
  });

  it('gives a chosen option a visible border, background and key-chip change', () => {
    const chosenRule = asCss.match(/\.as-opt\.chosen\{[^}]*\}/);
    expect(chosenRule).not.toBeNull();
    expect(chosenRule![0]).toMatch(/border-color:var\(--berry\)/);
    expect(chosenRule![0]).toMatch(/background:var\(--berry-soft\)/);
    expect(asCss).toMatch(/\.as-opt\.chosen \.as-optk\{[^}]*background:var\(--berry\)/);
  });

  it('carries a dark-theme override for both scopes it can render in', () => {
    expect(asCss).toMatch(/\.rt\[data-theme="dark"\] \.as/);
    expect(asCss).toMatch(/:root\[data-theme="dark"\] \.te-main \.as/);
  });
});
