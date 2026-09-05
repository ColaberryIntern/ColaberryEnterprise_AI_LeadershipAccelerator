import fs from 'fs';
import path from 'path';
import { MASTHEAD_FALLBACK } from '../storiesV2Model';

/**
 * The source-level contract for `/stories`.
 *
 * Three of this page's rules cannot be proved by rendering it, because they are
 * claims about what the code DOES NOT do:
 *
 *   1. the illustrative fixture is out of the production path (spec section 26).
 *      A render test can only show that today's six invented stories are absent
 *      from today's markup; it cannot show that no module imports them. That is a
 *      grep, so it is a grep;
 *   2. tracking goes through `utils/caseStudyTracking` and never through
 *      `trackEvent` directly. Calling the tracker straight would bypass
 *      `sanitizeEventData`, and nothing at runtime would complain - the payload
 *      would simply land in a JSONB column nobody prunes;
 *   3. every design token the stylesheet names is actually declared. An invalid
 *      custom property is an ABSENCE, not an error: `padding: var(--space-7)`
 *      resolved to no padding at all for as long as this page shipped it, and
 *      looked correct in every review.
 *
 * The behaviour lives in `StoriesV2.test.tsx` (states and cards) and
 * `StoriesV2.filters.test.tsx` (the filter engine). This file reads bytes.
 */

const HERE = __dirname;
const PAGE_DIR = path.join(HERE, '..');
const SRC = path.join(HERE, '..', '..', '..');
const PAGE = path.join(PAGE_DIR, 'StoriesV2.tsx');
const MODEL = path.join(PAGE_DIR, 'storiesV2Model.ts');
const CSS = path.join(PAGE_DIR, 'storiesV2.css');
const LEGACY_TOKENS = path.join(SRC, 'styles', 'tokens.css');
const V2_TOKEN_DIR = path.join(SRC, 'colaberry', 'tokens');

const read = (file: string): string => fs.readFileSync(file, 'utf8');

/** Comments stripped, so a name mentioned in prose is never read as a call. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/** Every `.ts`/`.tsx` under `src/`, excluding declaration files. */
function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      sourceFiles(full, found);
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      found.push(full);
    }
  }
  return found;
}

const ALL_SOURCES = sourceFiles(SRC);

/** A test or fixture module may reference anything; a production module may not. */
const isProductionModule = (file: string): boolean =>
  !file.includes(`${path.sep}__tests__${path.sep}`)
  && !file.includes(`${path.sep}__fixtures__${path.sep}`)
  && !/\.test\.tsx?$/.test(file);

const rel = (file: string): string => path.relative(SRC, file).split(path.sep).join('/');

/* ------------------------------------------------- the illustrative fixture --- */

describe('the illustrative stories are out of the production data path', () => {
  it('finds a non-trivial number of source files, so the sweep is not vacuous', () => {
    // Guarding the guard: a broken walker would make every assertion below pass
    // by finding nothing to check.
    expect(ALL_SOURCES.length).toBeGreaterThan(200);
    expect(ALL_SOURCES.map(rel)).toContain('pages/publicV2/StoriesV2.tsx');
  });

  it('is imported by no production module anywhere under src/', () => {
    const importers = ALL_SOURCES.filter(isProductionModule)
      .filter((file) => file !== path.join(SRC, 'config', 'v2Stories.ts'))
      .filter((file) => /from\s+['"][^'"]*\/v2Stories['"]/.test(stripComments(read(file))))
      .map(rel);
    expect(importers).toEqual([]);
  });

  it('still exists, and says on its own first line that it is a fixture', () => {
    // Section 26 keeps it for dev/test. Deleting it would lose the labelled
    // worked example; leaving it unlabelled is how it gets rendered again.
    const source = read(path.join(SRC, 'config', 'v2Stories.ts'));
    expect(source).toContain('NOT A PRODUCTION DATA SOURCE');
    expect(source).toContain('section 26');
  });

  it('is not what the page reads: the page reads the Case Study API', () => {
    const source = stripComments(read(PAGE));
    expect(source).not.toMatch(/v2Stories/);
    expect(source).toMatch(/from\s+'\.\.\/\.\.\/services\/caseStudyApi'/);
    expect(source).toMatch(/fetchCaseStudyIndex/);
    expect(source).toMatch(/fetchCaseStudyTaxonomy/);
  });

  it('composes the shipped case-study components rather than redrawing them', () => {
    const source = stripComments(read(PAGE));
    for (const component of ['CaseStudyCard', 'CaseStudyFilters', 'CaseStudyLedger']) {
      expect(source).toContain(`components/caseStudy/${component}`);
    }
  });
});

/* ------------------------------------------------------------------ tracking --- */

describe('tracking goes through the sanitising surface and nowhere else', () => {
  const source = stripComments(read(PAGE));

  it('imports its emitters from utils/caseStudyTracking', () => {
    expect(source).toMatch(/from\s+'\.\.\/\.\.\/utils\/caseStudyTracking'/);
    expect(source).toContain('trackCaseStudyFilter');
    expect(source).toContain('trackCaseStudyCardClick');
  });

  it('never reaches for the raw tracker, which would bypass sanitizeEventData', () => {
    expect(source).not.toMatch(/utils\/tracker/);
    expect(source).not.toMatch(/\btrackEvent\s*\(/);
  });

  it('does not emit case_study_view, which belongs to the detail page', () => {
    // The ingest has no event-level dedup; one INSERT per card per render is
    // what an index-side view event would produce.
    expect(source).not.toContain('trackCaseStudyView');
  });

  it('passes no key on the forbidden list', () => {
    // The emitters strip these silently, so a call site that sends one is not
    // detectable at runtime. Repository identity is the interesting half: a
    // Case Study can be built from a repo the public may not know exists.
    for (const key of ['repo_url', 'repo_owner', 'repo_name', 'repo_full_name', 'html_url',
      'email', 'lead_id', 'user_id', 'visitor_id', 'fingerprint']) {
      expect({ key, present: source.includes(key) }).toEqual({ key, present: false });
    }
  });

  it('claims no universal coverage, because V2 tracking is consent-gated and off by default', () => {
    expect(read(PAGE)).toMatch(/consent/i);
    expect(read(PAGE)).not.toMatch(/every visitor|all visitors|universal/i);
  });
});

/* --------------------------------------------------------------------- size --- */

describe('the pre-flight masthead is byte-identical to what the server sends', () => {
  /**
   * The page renders a fallback masthead before the first response lands, so
   * there is copy on screen immediately. That is only honest if the fallback is
   * the SAME copy — otherwise the visitor watches the headline rewrite itself,
   * and "the swap is invisible" becomes a claim the code contradicts.
   *
   * It drifted once: `/` vs `·` in the eyebrow, and "project delivery records"
   * vs "Refactored project records" in the lede. A comment asserted they
   * matched. Nothing checked. This reads the backend profile and compares.
   */
  const PROFILES = path.join(
    SRC, '..', '..', 'backend', 'src', 'services', 'caseStudy', 'caseStudySurfaceProfiles.ts',
  );

  /** Pull a quoted string value for `key:` out of the enterprise profile block. */
  function serverHero(source: string, key: string): string {
    const block = source.slice(source.indexOf('enterprise: profile('));
    const re = new RegExp(`${key}:\\s*((?:'[^']*'\\s*\\+?\\s*)+)`, 'm');
    const raw = re.exec(block)?.[1] ?? '';
    return [...raw.matchAll(/'([^']*)'/g)].map((m) => m[1]).join('');
  }

  it('the backend profile file is readable from here', () => {
    // Non-vacuity: a wrong path would make every comparison below trivially
    // pass on two empty strings.
    expect(fs.existsSync(PROFILES)).toBe(true);
  });

  it.each(['eyebrow', 'title', 'description'])('matches the server on %s', (key) => {
    const source = fs.readFileSync(PROFILES, 'utf8');
    const fromServer = serverHero(source, key);

    expect(fromServer.length).toBeGreaterThan(0);
    expect(MASTHEAD_FALLBACK[key as keyof typeof MASTHEAD_FALLBACK]).toBe(fromServer);
  });
});

describe('the page stays a page', () => {
  it('keeps StoriesV2.tsx inside the size budget a reader can hold', () => {
    expect(read(PAGE).split('\n').length).toBeLessThan(400);
  });

  it('keeps its model module small enough to read in one sitting', () => {
    expect(read(MODEL).split('\n').length).toBeLessThan(300);
  });
});

/* ------------------------------------------------------------------- styling --- */

describe('one styling mechanism, the one the V2 pages use', () => {
  const source = read(PAGE);

  it('imports the stylesheet as a plain side-effect import', () => {
    expect(source).toContain("import './storiesV2.css';");
  });

  it('uses no CSS Modules, no Bootstrap, no CSS-in-JS and no inline style objects', () => {
    expect(source).not.toMatch(/\.module\.css/);
    expect(source).not.toMatch(/import\s+\w+\s+from\s+['"][^'"]*\.css['"]/);
    expect(source).not.toMatch(/from\s+['"](?:react-)?bootstrap/);
    expect(source).not.toMatch(/from\s+['"]styled-components['"]/);
    expect(source).not.toMatch(/from\s+['"]@emotion/);
    // The page this replaced carried three of these.
    expect(source).not.toMatch(/style=\{\{/);
  });

  it('names every class it assigns inside the cbv2- namespace', () => {
    expect(source).not.toMatch(/className="(?![^"]*cbv2-)[^"]*"/);
  });

  it('names every selector in the stylesheet inside the namespace', () => {
    const css = read(CSS).replace(/\/\*[\s\S]*?\*\//g, ' ');
    const classes = (css.match(/\.[A-Za-z][A-Za-z0-9_-]*/g) ?? []).map((c) => c.slice(1));
    expect(classes.length).toBeGreaterThan(10);
    for (const name of classes) expect(name).toMatch(/^cbv2-/);
  });
});

/* -------------------------------------------------------------------- tokens --- */

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

const readCss = (file: string): string => read(file).replace(/\/\*[\s\S]*?\*\//g, ' ');

const pageCss = readCss(CSS);
const legacyDeclared = declaredIn(readCss(LEGACY_TOKENS));
const v2Declared = new Set<string>();
for (const file of fs.readdirSync(V2_TOKEN_DIR).filter((f) => f.endsWith('.css'))) {
  for (const name of declaredIn(readCss(path.join(V2_TOKEN_DIR, file)))) v2Declared.add(name);
}
const legacyOnly = [...legacyDeclared].filter((name) => !v2Declared.has(name)).sort();
const referenced = [...referencedIn(pageCss)].sort();

describe('storiesV2.css names only tokens that exist', () => {
  it('derives a non-trivial legacy-only list, so the ban below is not vacuous', () => {
    expect(legacyOnly.length).toBeGreaterThan(20);
    expect(legacyOnly).toContain('--color-primary');
    expect(legacyOnly).toContain('--space-md');
  });

  it('references a non-trivial number of tokens, so the check below is not vacuous', () => {
    expect(referenced.length).toBeGreaterThan(10);
  });

  it('references only tokens the V2 system actually declares', () => {
    /*
     * A CUSTOM PROPERTY THE PAGE DECLARES ITSELF IS DEFINED, and this rule used
     * to reject one purely because it had never met one. The check exists to
     * catch a DESIGN TOKEN that does not exist - `--space-7`, the regression
     * below - and a local variable declared a few lines above its own use is not
     * that. The word cloud sets `--cloud-hue` per field so one set of chip rules
     * serves three vocabularies; without this the only way to satisfy the
     * contract was to write the same block three times, which is worse code
     * passing a stricter-looking test.
     *
     * Strictness is unchanged where it matters: a name that is neither a V2
     * token nor declared in this stylesheet still fails.
     */
    const pageDeclared = declaredIn(pageCss);
    const undeclared = referenced.filter(
      (name) => !v2Declared.has(name) && !pageDeclared.has(name),
    );
    expect(undeclared).toEqual([]);
  });

  it('still fails a token that exists nowhere, so the allowance above is narrow', () => {
    // Non-vacuity for the rule just relaxed: a name neither declared in the
    // token system nor in this stylesheet must still be caught.
    const pageDeclared = declaredIn(pageCss);
    expect(v2Declared.has('--colour-that-does-not-exist')).toBe(false);
    expect(pageDeclared.has('--colour-that-does-not-exist')).toBe(false);
  });

  it('uses no step of the spacing scale that does not exist', () => {
    // THE REGRESSION THIS FILE WAS WRITTEN FOR. `--space-7` sat at line 12 of
    // this stylesheet: the scale runs 5, 6, 8, 10, so the card padding silently
    // resolved to nothing.
    expect(v2Declared.has('--space-7')).toBe(false);
    expect(referenced).not.toContain('--space-7');
    const spacing = referenced.filter((name) => /^--space-\d+$/.test(name));
    expect(spacing.length).toBeGreaterThan(0);
    for (const name of spacing) expect({ name, declared: v2Declared.has(name) })
      .toEqual({ name, declared: true });
  });

  it('references no legacy-only token', () => {
    expect(referenced.filter((name) => legacyOnly.includes(name))).toEqual([]);
  });

  it('hardcodes no colour outside the token system', () => {
    expect(pageCss.match(/#[0-9a-f]{3,8}\b/gi) ?? []).toEqual([]);
    expect(pageCss.match(/\b(?:rgba?|hsla?)\s*\(/gi) ?? []).toEqual([]);
  });

  it('pulls in no second stylesheet', () => {
    expect(read(CSS)).not.toMatch(/@import/);
  });

  it('gives every grid track a zero floor, so a long word cannot widen a column', () => {
    const tracks = pageCss
      .split(/[;{}]/)
      .map((line) => line.trim())
      .filter((line) => /^grid-template-columns\s*:/.test(line));
    expect(tracks.length).toBeGreaterThan(0);
    for (const track of tracks) {
      const safe = /minmax\(\s*(?:0|min\(100%,)/.test(track);
      expect({ track, safe }).toEqual({ track, safe: true });
    }
  });

  it('lets long words break rather than push the page sideways', () => {
    // The 320px assertion itself is T022's Playwright run against a real
    // viewport; this is the property that makes it possible.
    expect(pageCss).toContain('overflow-wrap: anywhere');
  });
});
