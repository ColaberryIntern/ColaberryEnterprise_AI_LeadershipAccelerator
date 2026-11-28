/**
 * The rules in the browser and the rules in Node are the same rules.
 *
 * `visualPlan.ts` is the source: typed, unit tested, and running in Node. The engine is one
 * self-contained HTML file in a browser and in students' repositories, so the rules are inlined
 * into it at generate time by `scripts/lib/inlineVisualRules.js`.
 *
 * That is two copies of the same logic, which is the failure this repo keeps naming. What makes
 * it safe is not that the inlining looks careful: it is this file. The inlined bundle is
 * evaluated here and run against the SAME fixtures as the TypeScript, and the plans must be
 * identical. A text comparison would prove the copy was made; running both proves they agree.
 *
 * If this ever fails, the engine is drawing something the tests do not describe, and the answer
 * is to regenerate, never to relax the comparison.
 */
import path from 'path';
import fs from 'fs';
import { visualPlan } from '../demoVisual/visualPlan';
import { ALL_FIXTURES } from './visualFixtures';

/* eslint-disable @typescript-eslint/no-var-requires */
const LIB = path.resolve(__dirname, '..', '..', '..', '..', '..', 'scripts', 'lib', 'inlineVisualRules.js');
const lib = require(LIB) as {
  inlineRules: () => string;
  composeEngineHtml: (raw?: string) => string;
  VISUAL_RULES_MARKER: string;
  RULE_MODULES: string[];
  EXPORTS: string[];
};

const ENGINE = path.resolve(__dirname, '..', 'demoKitAssets', 'index.html');

/** The inlined rules, evaluated exactly as a browser would evaluate them. */
function browserRules(): { visualPlan: (spec: unknown) => unknown } {
  const bundle = lib.inlineRules();
  // eslint-disable-next-line no-new-func
  return new Function(`${bundle}\nreturn VISUAL;`)() as { visualPlan: (spec: unknown) => unknown };
}

describe('the inlined rules and the TypeScript agree', () => {
  const browser = browserRules();

  it('inlines all three rule modules, so the comparison below is not of a fragment', () => {
    expect(lib.RULE_MODULES).toEqual(['visualRules.ts', 'specReaders.ts', 'visualPlan.ts']);
    const bundle = lib.inlineRules();
    for (const name of lib.EXPORTS) expect(bundle).toContain(name);
    expect(bundle.length).toBeGreaterThan(5000);
  });

  it.each(ALL_FIXTURES.map((f) => [f.name, f.spec] as const))(
    '%s plans identically in the browser bundle and in Node',
    (_name, spec) => {
      expect(browser.visualPlan(spec)).toEqual(visualPlan(spec));
    },
  );

  it('produces no module syntax, which would stop the engine parsing at all', () => {
    expect(lib.inlineRules()).not.toMatch(/^\s*(import|export)\s/m);
  });

  it('keeps the rules inside one scope, because the engine has its own globals', () => {
    // The engine already defines `text`, `title`, `table`, `nav` and `strip`; the rules export
    // `str` and `num`. Sharing a scope would be a collision found by a blank screen.
    const bundle = lib.inlineRules();
    expect(bundle).toMatch(/var VISUAL = \(function \(\) \{/);
    expect(bundle.trimEnd().endsWith('})();')).toBe(true);
  });
});

describe('the engine is composed from the marker', () => {
  it('index.html carries the marker exactly once', () => {
    const raw = fs.readFileSync(ENGINE, 'utf8');
    expect(raw.split(lib.VISUAL_RULES_MARKER)).toHaveLength(2);
  });

  it('the composed engine has the rules in place of the marker', () => {
    const composed = lib.composeEngineHtml();
    expect(composed).not.toContain(lib.VISUAL_RULES_MARKER);
    expect(composed).toContain('var VISUAL = (function () {');
  });

  it('REFUSES to compose an engine with no marker, rather than shipping one without rules', () => {
    // The failure this guards is silent: an engine that renders, and renders everything as text,
    // with nothing in the output saying the rules were dropped.
    expect(() => lib.composeEngineHtml('<html><body>no marker here</body></html>')).toThrow(/marker|nowhere/i);
  });
});
