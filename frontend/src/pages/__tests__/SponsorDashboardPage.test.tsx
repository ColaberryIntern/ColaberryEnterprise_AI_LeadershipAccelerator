/**
 * SponsorDashboardPage.test.tsx - C5.10's acceptance criteria, as tests.
 *
 * The ticket names four: measured / target / not-yet-measured visually distinct, reuses
 * existing admin components, route verified mounted, PR open not merged. The first three
 * are testable and each has a block below.
 *
 * ## Why most of these read source rather than rendered output
 *
 * This page starts with `loading` true and fetches in an effect.
 * `renderToStaticMarkup` renders the first paint and never runs effects, so a rendered
 * assertion here sees skeletons and nothing else. A first draft of this suite asserted
 * against the rendered HTML and would have failed in CI for that reason rather than for
 * any defect in the page.
 *
 * So the provenance wiring, the certification language and the route are all asserted by
 * reading the files off disk. That is also the stronger check for two of them: "route
 * verified mounted" cannot be proven by rendering a component, because a page under
 * pages/ can look finished and be unreachable, which is the trap this ticket's own prompt
 * warns about.
 *
 * Idiom otherwise follows the neighbouring V2 suites. This repo does not use
 * @testing-library.
 */
import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(path.join(__dirname, '..', 'SponsorDashboardPage.tsx'), 'utf8');
const ROUTES = fs.readFileSync(
  path.join(__dirname, '..', '..', 'routes', 'publicRoutes.tsx'), 'utf8',
);

/** Source with comments removed, so a guard never matches its own explanation. */
const code = SRC
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

describe('C5.10 - measured, target and not-yet-measured are visually distinct', () => {
  it('defines all three provenance classes, plus sample', () => {
    for (const cls of ['measured', 'target', 'not-yet-measured', 'sample']) {
      expect(code).toContain(cls);
    }
  });

  it('distinguishes them by glyph and not by colour alone', () => {
    const glyphs = [...code.matchAll(/glyph:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(glyphs.length).toBeGreaterThanOrEqual(4);
    // Distinct glyphs, so the distinction survives greyscale, colour-blindness and a
    // printed screenshot.
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });

  it('marks every headline figure, not just the page once', () => {
    const provenances = (code.match(/<Provenance\s+of=/g) || []).length;
    // Four seat figures are rendered and each carries its own marker. A single banner
    // near the top is what this replaces: a sponsor screenshots the number, not the page.
    expect(provenances).toBeGreaterThanOrEqual(4);
  });

  it('drives the marker from the live sample flag rather than hardcoding it', () => {
    expect(code).toMatch(/usingSample\s*\?\s*'sample'\s*:\s*'measured'/);
  });
});

describe('C5.10 - reuses the existing design system', () => {
  it('builds provenance from the shared Badge rather than a new primitive', () => {
    expect(code).toContain("from '../colaberry/components/core/Badge'");
    expect(code).toMatch(/<Badge\s+tone=\{p\.tone\}/);
  });
});

describe('C5.10 - route verified mounted', () => {
  it('is reachable at /sponsor/dashboard', () => {
    expect(ROUTES).toContain('path="/sponsor/dashboard"');
    expect(ROUTES).toContain('SponsorDashboardPage');
  });
});

describe('we do not certify anyone', () => {
  it('never tells a sponsor their employee is certified', () => {
    // The exam belongs to Anthropic. We sell preparation and issue nothing, so this
    // dashboard may describe preparation and must never describe a credential. The
    // column previously read "Certified" / "Not yet certified" beside a named person.
    expect(code).not.toMatch(/>\s*Certified\s*</);
    expect(code).not.toMatch(/Not yet certified/);
  });

  it('describes the preparation track instead', () => {
    expect(code).toContain('Preparation complete');
    expect(code).toContain('Preparation not yet complete');
  });

  // THE GUARD ABOVE IS NOT ENOUGH, AND THIS IS WHY IT NEEDS A SECOND ONE.
  //
  // `/>\s*Certified\s*</` and `/Not yet certified/` describe the two strings that one
  // fix removed from one table column. They do not describe the rule. Both passed in
  // CI while three sentences of live copy still told a sponsor we had certified their
  // named employees:
  //
  //   "...climbed high enough, and certified - they are the people to put on stage"
  //   "As your team ships projects and certifies, standouts will surface here."
  //   "{certifiedCount} of {participants.length} active builders certified so far."
  //
  // The third is the serious one: a computed number asserting a credential beside real
  // names, rendered as "3 of 10 active builders certified so far". A guard that only
  // knows the phrasing it was written against stops guarding the moment someone
  // rephrases - which is what happened here, in the same file, in the same PR.
  //
  // So this asserts on the claim rather than on a phrasing. The word legitimately
  // appears in the data contract (the API sends `cert_earned`; this page carries it as
  // a `certified` flag and a table key), so those tokens are removed first and
  // ANYTHING still containing "certif", in any casing, fails.
  it('does not claim a credential in any phrasing, only in field names', () => {
    const CONTRACT_TOKENS = [
      /\.certified\b/g, // reads of the flag: p.certified, row.certified
      /'certified'/g, // the table column key
      /\bcertified\b(?=\s*[:?])/g, // type members and object literals: `certified: true`
      /\bcert_earned\b/g, // the API field this maps from
    ];
    let prose = code;
    for (const token of CONTRACT_TOKENS) prose = prose.replace(token, ' ');

    const claims = [...prose.matchAll(/[^\n]*certif[^\n]*/gi)].map((m) => m[0].trim());
    expect(claims).toEqual([]);
  });
});
