import fs from 'fs';
import path from 'path';

/**
 * The design-token contract for the case-study module.
 *
 * THE REPOSITORY CARRIES TWO TOKEN SYSTEMS. `src/colaberry/tokens/*.css` is the
 * V2 design system (`--surface-card`, `--text-strong`, `--space-4`, `--fs-h3`).
 * `src/styles/tokens.css` is an older, competing set (`--color-primary`,
 * `--space-md`, `--font-size-lg`) that the V2 public site forbids -
 * `publicV2.css:5-6` says so in prose. Prose does not fail a build, so this file
 * does.
 *
 * THE FORBIDDEN LIST IS DERIVED, NOT TYPED. It is the set difference between the
 * two files, computed at test time. Several names are declared in BOTH systems
 * (`--radius-lg`, `--font-mono`, `--shadow-md`); a hand-written list would
 * eventually ban one of those and be quietly deleted by whoever hit it. Deriving
 * the difference means the list stays exactly "legacy-only names" as either file
 * evolves.
 *
 * AND THE REVERSE CHECK MATTERS MORE THAN THE BAN. Every token this module
 * references must actually be DECLARED. That is what catches an invented step in
 * a scale: `var(--space-7)` does not exist (the scale runs 6 then 8), so any
 * padding asking for it silently resolves to nothing. A rule that resolves to
 * nothing looks fine in review and wrong on screen.
 *
 * That was not hypothetical. `storiesV2.css:12` used it until T017 removed the
 * rule, and a repo-wide scan then found **sixteen more live references across
 * eight other V2 stylesheets** - homeV2 (3), platformV2 (5), opportunityLabV2
 * (2), signupV2 (2), pricingV2, tryV2, cinematicV2, roadmap12 - every one of
 * them a gap, a padding or a margin on the public site that has never applied.
 * Those are logged as a follow-up rather than changed here, because altering
 * spacing on eight live marketing pages is a visual decision someone should make
 * deliberately, not a side effect of a Case Study build.
 */

const MODULE_CSS = path.join(__dirname, '..', 'caseStudy.css');
const LEGACY_TOKENS = path.join(__dirname, '..', '..', '..', 'styles', 'tokens.css');
const V2_TOKEN_DIR = path.join(__dirname, '..', '..', '..', 'colaberry', 'tokens');

/** Comments stripped, so a token NAMED in prose is never read as one USED. */
const read = (file: string): string =>
  fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');

/** Names DECLARED by a stylesheet, i.e. `--x: value`. */
function declaredIn(css: string): Set<string> {
  const found = new Set<string>();
  const pattern = /(^|[;{\s])(--[a-z0-9-]+)\s*:/gi;
  let match = pattern.exec(css);
  while (match !== null) {
    found.add(match[2]);
    match = pattern.exec(css);
  }
  return found;
}

/** Names REFERENCED by a stylesheet, i.e. `var(--x)`. */
function referencedIn(css: string): Set<string> {
  const found = new Set<string>();
  const pattern = /var\(\s*(--[a-z0-9-]+)/gi;
  let match = pattern.exec(css);
  while (match !== null) {
    found.add(match[1]);
    match = pattern.exec(css);
  }
  return found;
}

const moduleCss = read(MODULE_CSS);
const legacyDeclared = declaredIn(read(LEGACY_TOKENS));
const v2Declared = new Set<string>();
for (const file of fs.readdirSync(V2_TOKEN_DIR).filter((f) => f.endsWith('.css'))) {
  for (const name of declaredIn(read(path.join(V2_TOKEN_DIR, file)))) v2Declared.add(name);
}

const legacyOnly = [...legacyDeclared].filter((name) => !v2Declared.has(name)).sort();
const referenced = [...referencedIn(moduleCss)].sort();

describe('caseStudy.css uses the V2 token system and not the legacy one', () => {
  it('derives a non-trivial legacy-only name list that includes the two named in the brief', () => {
    // Guarding the guard: if the difference ever came out empty, every assertion
    // below would pass vacuously.
    expect(legacyOnly.length).toBeGreaterThan(20);
    expect(legacyOnly).toContain('--color-primary');
    expect(legacyOnly).toContain('--space-md');
  });

  it('references no legacy-only token', () => {
    const offenders = referenced.filter((name) => legacyOnly.includes(name));
    expect(offenders).toEqual([]);
  });

  it('references only tokens the V2 system actually declares', () => {
    // Catches `--space-7`, the missing step `storiesV2.css` asks for today.
    const undeclared = referenced.filter((name) => !v2Declared.has(name));
    expect(undeclared).toEqual([]);
  });

  it('pulls in no second stylesheet at all', () => {
    // Read raw, comments included: an `@import` of the legacy sheet would bring
    // the whole competing palette back into scope through one line.
    const raw = fs.readFileSync(MODULE_CSS, 'utf8');
    expect(raw).not.toMatch(/@import/);
  });

  it('actually uses the semantic aliases rather than only raw ramps', () => {
    for (const token of ['--surface-card', '--text-strong', '--radius-lg', '--fs-caption']) {
      expect(referenced).toContain(token);
    }
  });

  it('hardcodes no colour outside the token system', () => {
    // A hex or an rgb()/hsl() literal is a second palette by another name.
    const hex = moduleCss.match(/#[0-9a-f]{3,8}\b/gi) ?? [];
    const functional = moduleCss.match(/\b(?:rgba?|hsla?)\s*\(/gi) ?? [];
    expect(hex).toEqual([]);
    expect(functional).toEqual([]);
  });

  it('uses no step of the spacing scale that does not exist', () => {
    const spacing = referenced.filter((name) => /^--space-\d+$/.test(name));
    expect(spacing.length).toBeGreaterThan(0);
    for (const name of spacing) expect(v2Declared.has(name)).toBe(true);
  });
});
