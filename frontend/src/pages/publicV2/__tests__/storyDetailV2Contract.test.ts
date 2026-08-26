import fs from 'fs';
import path from 'path';

/**
 * The source-level contract for `/stories/:slug`.
 *
 * Four of this page's rules cannot be proved by rendering it, because they are
 * claims about what the code DOES NOT do:
 *
 *   1. every design token the stylesheet names is actually declared. An invalid
 *      custom property is an ABSENCE, not an error: `padding: var(--space-7)`
 *      resolved to no padding at all for as long as the old stories card
 *      shipped it, and looked correct in every review. Sixteen live references
 *      to that non-existent token remain across eight other V2 stylesheets
 *      (deferred, D-07). This file makes sure there is no seventeenth here;
 *   2. tracking goes through `utils/caseStudyTracking` and never through
 *      `trackEvent` directly. Calling the tracker straight would bypass
 *      `sanitizeEventData`, and nothing at runtime would complain - the payload
 *      would simply land in a JSONB column nobody prunes;
 *   3. the route is NOT lazy-loaded. The shared `cbv2-` primitives this page
 *      leans on live in other pages' stylesheets and are in the bundle only
 *      because App.tsx imports the V2 pages statically. A `React.lazy` here
 *      would ship the page without its own layout;
 *   4. the case-study component directory is not extended. Its style contract
 *      asserts an exact ten filenames, so a new component there fails a test
 *      belonging to another task.
 *
 * The behaviour lives in `StoryDetailV2.test.tsx`. This file reads bytes.
 */

const HERE = __dirname;
const PAGE_DIR = path.join(HERE, '..');
const SRC = path.join(HERE, '..', '..', '..');
const PAGE = path.join(PAGE_DIR, 'StoryDetailV2.tsx');
const MODEL = path.join(PAGE_DIR, 'storyDetailV2Model.ts');
const SECTIONS = path.join(PAGE_DIR, 'storyDetailV2Sections.tsx');
const CSS = path.join(PAGE_DIR, 'storyDetailV2.css');
/**
 * The media band added by the carousel/diagram task. These files are page-local
 * for the SAME reason the three above are - `components/caseStudy/` is a closed
 * set of ten filenames - so they inherit the same rules and are listed here
 * rather than left unchecked. That was a deliberate extension of this contract,
 * not a side effect: without it, four new files could carry a hex literal, an
 * inline style object or a control character and nothing would say so.
 */
const MEDIA_SOURCES = [
  path.join(PAGE_DIR, 'storyMediaModel.ts'),
  path.join(PAGE_DIR, 'StoryMediaCarousel.tsx'),
  path.join(PAGE_DIR, 'StoryDiagram.tsx'),
  path.join(PAGE_DIR, 'StoryHeroActions.tsx'),
  /* The UI pass added five more page-local files - the between-sections figure
     band, the indicator rail, the section list and their two pure models - and
     they are listed here for exactly the reason the four above were: without it,
     a new file could carry a hex literal, an inline style object, a class
     outside the namespace or a control character, and nothing in this repository
     would say so. `storyIndicatorModel.ts` is named for its role rather than
     matching its component, because `storyIndicators.ts` beside
     `StoryIndicators.tsx` differs only in casing and Windows and macOS resolve
     the two to one file - which failed the build here before it could fail
     anywhere else. */
  path.join(PAGE_DIR, 'StoryFigure.tsx'),
  path.join(PAGE_DIR, 'StoryIndicators.tsx'),
  path.join(PAGE_DIR, 'StorySectionList.tsx'),
  path.join(PAGE_DIR, 'storyFigurePlacement.ts'),
  path.join(PAGE_DIR, 'storyIndicatorModel.ts'),
  /* The Story Format V1 pass added three more, and they are listed here for the
     same reason all of the above were - an unlisted page-local file could carry
     a hex literal, an inline style object, a class outside the namespace or a
     control character, and nothing in this repository would say so.
       - `StoryContextStrip.tsx` is the hero's second half, moved onto light
         ground: the counts, the facts grid and the headline figures.
       - `StorySituation.tsx` renders `situation.constraints` and `.goals`, two
         fields that were authored, populated and publish-gated but never
         projected.
       - `storySeoModel.ts` is the structured-data half of what used to be
         `storyDetailV2Model.ts`, split out when that file hit the 300-line
         ceiling asserted below. */
  path.join(PAGE_DIR, 'StoryContextStrip.tsx'),
  path.join(PAGE_DIR, 'StorySituation.tsx'),
  path.join(PAGE_DIR, 'storySeoModel.ts'),
];

/**
 * The picture rules, split out of `storyDetailV2.css` when it passed CLAUDE.md's
 * 500-line hard ceiling.
 *
 * IT IS CHECKED EXACTLY AS HARD AS THE FILE IT CAME OUT OF. A split that moves
 * rules from a contract-tested stylesheet into an untested one is a regression
 * wearing a refactor's clothes: every token, colour, namespace and
 * control-character assertion below runs over both files.
 */
const MEDIA_CSS = path.join(PAGE_DIR, 'storyMediaV2.css');
const STYLESHEETS = [path.join(PAGE_DIR, 'storyDetailV2.css'), MEDIA_CSS];
const APP = path.join(SRC, 'App.tsx');
const LEGACY_TOKENS = path.join(SRC, 'styles', 'tokens.css');
const V2_TOKEN_DIR = path.join(SRC, 'colaberry', 'tokens');
const CASE_STUDY_DIR = path.join(SRC, 'components', 'caseStudy');
const BACKEND_SECTIONS = path.join(
  SRC, '..', '..', 'backend', 'src', 'services', 'caseStudy', 'caseStudyPublicSections.ts',
);

const read = (file: string): string => fs.readFileSync(file, 'utf8');

/** Comments stripped, so a name mentioned in prose is never read as a call. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/* ------------------------------------------------------------- the route --- */

describe('the route is registered, and registered statically', () => {
  const app = read(APP);

  it('declares the child path without a leading slash, like every sibling', () => {
    // A leading slash makes a child route absolute, and it stops nesting under
    // PublicLayoutV2 - the page would then render with no header and no footer.
    expect(app).toContain('<Route path="stories/:slug" element={<StoryDetailV2 />} />');
    expect(app).not.toContain('path="/stories/:slug"');
  });

  it('imports the page statically, so the shared cbv2- primitives resolve', () => {
    expect(app).toContain("import StoryDetailV2 from './pages/publicV2/StoryDetailV2';");

    // The check is "is this page ever DYNAMICALLY imported", not "does the word
    // lazy appear near it". Two earlier formulations were wrong in opposite
    // directions and both are worth recording, because the failure modes are
    // not symmetrical:
    //
    //   /lazy\([^)]*StoryDetailV2/     shipped here, and could never match.
    //     `[^)]*` stops at the first `)`, which in `lazy(() => import(...))` is
    //     the one closing the empty arrow-function parameter list — long before
    //     the module path. Verified false against a genuinely lazy App.tsx, so
    //     the assertion could not fail and was guarding nothing.
    //
    //   /lazy\s*\([\s\S]*?StoryDetailV2/   fails the other way.
    //     `[\s\S]*?` crosses newlines and other statements, so ANY earlier
    //     lazy() call in this file - and App.tsx has several - matches forward
    //     to the static import below it. That reports lazy-loading that isn't
    //     there, which is worse than a silent pass: it fails on correct code.
    //
    // A dynamic import is the thing that actually breaks the page, whatever
    // wraps it (React.lazy, loadable, a custom shim). `import(` bounded by
    // `[^)]*` is safe because a module specifier contains no `)`, and a static
    // `import X from '...'` has no parenthesis at all, so it cannot match.
    const dynamicallyImported = /import\([^)]*StoryDetailV2/.test(app);
    expect(dynamicallyImported).toBe(false);
  });

  it('sits after the index route, so /stories still matches first', () => {
    expect(app.indexOf('path="stories/:slug"'))
      .toBeGreaterThan(app.indexOf('path="stories"'));
  });
});

/* ------------------------------------------------- the closed component set --- */

describe('the case-study component directory is untouched', () => {
  it('still ships exactly the ten files its own style contract asserts', () => {
    const files = fs
      .readdirSync(CASE_STUDY_DIR)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .sort();
    expect(files).toEqual([
      'CaseStudyArchitecture.tsx',
      'CaseStudyArtifacts.tsx',
      'CaseStudyCTA.tsx',
      'CaseStudyCard.tsx',
      'CaseStudyFilters.tsx',
      'CaseStudyLedger.tsx',
      'CaseStudyMeasurement.tsx',
      'CaseStudyRoadmap.tsx',
      'CaseStudyTimeline.tsx',
      'CaseStudyVerificationBadge.tsx',
    ]);
  });

  it('composes those components rather than redrawing them', () => {
    // The page holds the hero and the CTA; the section dispatcher holds the
    // rest. Both are read, because "which file imports it" is a layout decision
    // and this rule is about not reimplementing any of them.
    const source = stripComments(read(PAGE)) + stripComments(read(SECTIONS));
    for (const component of ['CaseStudyTimeline', 'CaseStudyArchitecture',
      'CaseStudyMeasurement', 'CaseStudyRoadmap', 'CaseStudyArtifacts', 'CaseStudyCTA',
      'CaseStudyVerificationBadge']) {
      expect(source).toContain(`components/caseStudy/${component}`);
    }
  });
});

/* ------------------------------------------------------------------ tracking --- */

describe('tracking goes through the sanitising surface and nowhere else', () => {
  const source = stripComments(read(PAGE));

  it('imports its emitters from utils/caseStudyTracking', () => {
    expect(source).toMatch(/from\s+'\.\.\/\.\.\/utils\/caseStudyTracking'/);
    for (const emitter of ['trackCaseStudyView', 'trackCaseStudyRepoClick',
      'trackCaseStudyArtifactClick', 'trackCaseStudyCtaClick', 'trackCaseStudyShare']) {
      expect(source).toContain(emitter);
    }
  });

  it('never reaches for the raw tracker, which would bypass sanitizeEventData', () => {
    expect(source).not.toMatch(/utils\/tracker/);
    expect(source).not.toMatch(/\btrackEvent\s*\(/);
  });

  it('emits the view from an effect, because the ingest has no event-level dedup', () => {
    const effect = /useEffect\(\(\) => \{[\s\S]*?trackCaseStudyView\(/.test(source);
    expect(effect).toBe(true);
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

/* ------------------------------------------------- the private-repo boundary --- */

describe('a withheld repository has no shape to arrive in', () => {
  it('reads the backend projection from here, so the check below is not vacuous', () => {
    expect(fs.existsSync(BACKEND_SECTIONS)).toBe(true);
  });

  it('is dropped by the server before the wire, not filtered on the client', () => {
    // Three gates, all on the server: public, consented, and a parseable URL.
    const backend = read(BACKEND_SECTIONS);
    expect(backend).toMatch(/visibility !== 'public'/);
    expect(backend).toMatch(/allowPublicRepoLink !== true/);
    expect(backend).toMatch(/privateRepositoryCount/);
  });

  it('gives the public repository type no owner, no visibility and no private url', () => {
    const contract = read(path.join(SRC, 'services', 'caseStudyPublicTypes.ts'));
    const block = contract.slice(
      contract.indexOf('export interface PublicCaseStudyRepository'),
      contract.indexOf('export interface PublicCaseStudyCta'),
    );
    expect(block.length).toBeGreaterThan(50);
    for (const field of ['owner', 'visibility', 'private', 'fullName', 'repoName']) {
      expect({ field, present: block.includes(field) }).toEqual({ field, present: false });
    }
  });

  it('does not re-filter on the client, which would imply the wire could carry one', () => {
    const source = stripComments(read(SECTIONS));
    expect(source).not.toMatch(/visibility\s*===\s*'public'/);
    expect(source).not.toMatch(/\.filter\(/);
  });
});

/* --------------------------------------------------------------------- size --- */

describe('the page stays a page', () => {
  it('keeps StoryDetailV2.tsx inside the size budget a reader can hold', () => {
    expect(read(PAGE).split('\n').length).toBeLessThan(400);
  });

  it('keeps its model module small enough to read in one sitting', () => {
    expect(read(MODEL).split('\n').length).toBeLessThan(300);
  });

  it('keeps its page-local sections module small enough too', () => {
    expect(read(SECTIONS).split('\n').length).toBeLessThan(300);
  });
});

/* ------------------------------------------------------------------ styling --- */

describe('one styling mechanism, the one the V2 pages use', () => {
  const source = read(PAGE);

  it('imports the stylesheet as a plain side-effect import', () => {
    expect(source).toContain("import './storyDetailV2.css';");
  });

  it('uses no CSS Modules, no Bootstrap, no CSS-in-JS and no inline style objects', () => {
    for (const file of [PAGE, SECTIONS]) {
      const text = read(file);
      expect(text).not.toMatch(/\.module\.css/);
      expect(text).not.toMatch(/import\s+\w+\s+from\s+['"][^'"]*\.css['"]/);
      expect(text).not.toMatch(/from\s+['"](?:react-)?bootstrap/);
      expect(text).not.toMatch(/from\s+['"]styled-components['"]/);
      expect(text).not.toMatch(/from\s+['"]@emotion/);
      expect(text).not.toMatch(/style=\{\{/);
    }
  });

  it('names every class it assigns inside the cbv2- namespace', () => {
    for (const file of [PAGE, SECTIONS]) {
      expect(read(file)).not.toMatch(/className="(?![^"]*cbv2-)[^"]*"/);
    }
  });

  it('names every selector in either stylesheet inside the namespace', () => {
    for (const file of STYLESHEETS) {
      const css = readCss(file);
      const classes = (css.match(/\.[A-Za-z][A-Za-z0-9_-]*/g) ?? []).map((c) => c.slice(1));
      // Non-vacuity per file, so a stylesheet that was emptied or misnamed
      // cannot pass this by having nothing in it to check.
      expect({ file: path.basename(file), count: classes.length > 10 })
        .toEqual({ file: path.basename(file), count: true });
      for (const name of classes) expect(name).toMatch(/^cbv2-/);
    }
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

/**
 * Both stylesheets, concatenated, comments already stripped.
 *
 * The token, colour and grid-track assertions below are about the page's STYLE
 * SYSTEM rather than about one file, so they read the whole system. The
 * per-file assertions that remain - `@import`, the size ceiling - stay per-file
 * because they are about a file.
 */
const allCss = STYLESHEETS.map(readCss).join('\n');
const pageCss = readCss(CSS);
const legacyDeclared = declaredIn(readCss(LEGACY_TOKENS));
const v2Declared = new Set<string>();
for (const file of fs.readdirSync(V2_TOKEN_DIR).filter((f) => f.endsWith('.css'))) {
  for (const name of declaredIn(readCss(path.join(V2_TOKEN_DIR, file)))) v2Declared.add(name);
}
const legacyOnly = [...legacyDeclared].filter((name) => !v2Declared.has(name)).sort();
const referenced = [...referencedIn(allCss)].sort();

describe('the story stylesheets name only tokens that exist', () => {
  it('derives a non-trivial legacy-only list, so the ban below is not vacuous', () => {
    expect(legacyOnly.length).toBeGreaterThan(20);
    expect(legacyOnly).toContain('--color-primary');
    expect(legacyOnly).toContain('--space-md');
  });

  it('references a non-trivial number of tokens, so the check below is not vacuous', () => {
    expect(referenced.length).toBeGreaterThan(10);
  });

  it('references only tokens the V2 system actually declares', () => {
    const undeclared = referenced.filter((name) => !v2Declared.has(name));
    expect(undeclared).toEqual([]);
  });

  it('adds no seventeenth reference to the spacing step that does not exist', () => {
    // The scale runs 5, 6, 8, 10. There is no --space-7, and a rule asking for
    // one resolves to nothing at all.
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

  /**
   * THE DEFECT THIS GUARDS SHIPPED, and was found by looking at the page rather
   * than by any test here. `.cbv2-pagehero .cbv2-story__term` was written for
   * the hero's facts strip, which sits directly on the dark ground - but it
   * matches EVERY descendant of the masthead, and the hero's figure card is
   * painted `--surface-card`. Sample, Methodology and Limitations rendered white
   * on white at 1.00:1, measured live, five elements, invisible.
   *
   * jsdom applies no stylesheet, so no unit test in this repository can compute
   * that cascade. This reads bytes, which is the only thing available here; the
   * assertion that actually catches the general case is the rendered-contrast
   * sweep in `tests/systemV2/caseStudyPublic.e2e.js`. Both are needed - this one
   * runs in CI on every push, that one needs a browser and a live record.
   */
  it('inverts text on the masthead by naming WHAT it inverts, not just the background', () => {
    const selectors = allCss.split('{').map((chunk) => chunk.split('}').pop()?.trim() ?? '');

    /* THE BAN, UNCHANGED AND STILL THE POINT OF THIS TEST. A descendant selector
       whose only scope is `.cbv2-pagehero` names a BACKGROUND, not a component,
       and matches every light card inside the dark band as well as the dark
       band's own text. */
    const unscoped = selectors.filter((selector) =>
      /\.cbv2-pagehero\s+\.cbv2-story__(term|value)\s*$/.test(selector)
      || /\.cbv2-pagehero\s+\.cbv2-story__(term|value)\s*,/.test(selector));
    expect(unscoped).toEqual([]);

    /* THE NON-VACUITY HALF CHANGED, AND HERE IS WHY, BECAUSE A WEAKENED GUARD
       THAT NOBODY EXPLAINED IS HOW THE NEXT ONE OF THESE SHIPS.
       This used to assert the presence of `.cbv2-pagehero .cbv2-story__facts
       .cbv2-story__term` - the correctly-scoped version of the rule that had
       failed. That rule is now GONE, because the facts strip is no longer on the
       masthead at all: it moved to `.cbv2-story__context`, on light ground,
       where it needs no inversion and there is no inverted region for a light
       card to be trapped inside. Requiring a rule that should no longer exist
       would have meant keeping a dead selector alive to satisfy a test.
       What replaces it is stronger rather than weaker: EVERY masthead-scoped
       colour rule in either stylesheet must name a component class, not just the
       masthead. That generalises the original guard from two class names to all
       of them. */
    const mastheadColourRules = selectors.filter((selector) =>
      /\.cbv2-pagehero\b/.test(selector));
    expect(mastheadColourRules.length).toBeGreaterThan(0);
    for (const selector of mastheadColourRules) {
      // Everything after `.cbv2-pagehero` must contain at least one further
      // class. `.cbv2-pagehero { ... }` itself is fine - it paints the ground.
      const tail = selector.slice(selector.lastIndexOf('.cbv2-pagehero') + '.cbv2-pagehero'.length);
      const namesAComponent = tail.trim().length === 0 || /\.cbv2-[a-z0-9_-]+/i.test(tail);
      expect({ selector, namesAComponent }).toEqual({ selector, namesAComponent: true });
    }

    // ...and the light card still says its own colours rather than inheriting
    // them. Belt and braces on the defect this page has shipped twice.
    expect(allCss).toMatch(/\.cbv2-story__metric\s+\.cbv2-story__value/);
  });

  it('hardcodes no colour outside the token system, in either stylesheet', () => {
    for (const file of STYLESHEETS) {
      const css = readCss(file);
      expect({ file: path.basename(file), hex: css.match(/#[0-9a-f]{3,8}\b/gi) ?? [] })
        .toEqual({ file: path.basename(file), hex: [] });
      expect({ file: path.basename(file), fn: css.match(/\b(?:rgba?|hsla?)\s*\(/gi) ?? [] })
        .toEqual({ file: path.basename(file), fn: [] });
    }
  });

  it('pulls in no second stylesheet by @import, in either file', () => {
    /* COMMENTS STRIPPED FIRST, and this test is the reason that matters.
       The predecessor of this assertion read RAW bytes, which was fine for as
       long as no stylesheet header happened to mention the word. `storyMediaV2.
       css` explains in its own header why it is a side-effect import in the page
       rather than an `@import` from the page stylesheet - and saying so made the
       check go red on a file that contains no `@import` rule at all. The rule is
       about an ACTIVE at-rule, and an at-rule inside a comment is not one, which
       is the same principle this file already applies to source: "Comments
       stripped, so a name mentioned in prose is never read as a call." */
    for (const file of STYLESHEETS) {
      expect({ file: path.basename(file), imports: /@import/.test(readCss(file)) })
        .toEqual({ file: path.basename(file), imports: false });
      // Non-vacuity: stripping did not empty the file and leave nothing to check.
      expect({ file: path.basename(file), substantial: readCss(file).trim().length > 500 })
        .toEqual({ file: path.basename(file), substantial: true });
    }
    // The second sheet reaches the bundle the other way: a side-effect import in
    // the page. An `@import` would cost a serial round trip before either sheet
    // could paint.
    expect(stripComments(read(PAGE))).toContain("import './storyMediaV2.css';");
  });

  it('keeps both stylesheets under the 500-line ceiling that forced the split', () => {
    const oversize = STYLESHEETS
      .map((file) => ({ file: path.basename(file), lines: read(file).split('\n').length }))
      .filter((entry) => entry.lines > 500);
    expect(oversize).toEqual([]);
  });

  it('gives every grid track a zero floor, so a long word cannot widen a column', () => {
    const tracks = allCss
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
    for (const file of STYLESHEETS) {
      expect({ file: path.basename(file), breaks: readCss(file).includes('overflow-wrap: anywhere') })
        .toEqual({ file: path.basename(file), breaks: true });
    }
  });

  /**
   * THE TONE GRAMMAR RESTS ON THIS PAGE'S OWN CLASS, NOT THE SHARED MODIFIER.
   * `.cbv2-section--sunken` is declared twice in this codebase with different
   * values - `homeV2.css` paints it `--surface-sunken`, `cinematicV2.css` paints
   * it `--cbv2-warm-sunken` - so which one a band gets depends on the order
   * App.tsx happens to import two other pages in. `STORY_FORMAT_V1.md` calls the
   * alternation a LOCKED grammar, and a locked grammar cannot rest on that.
   */
  it('declares its own sunken tone rather than inheriting a twice-declared one', () => {
    expect(pageCss).toMatch(/\.cbv2-story\s+\.cbv2-story__section--sunken\s*\{/);
    const claimsTheSharedOne = /^\s*\.cbv2-section--sunken\s*\{/m.test(pageCss);
    expect(claimsTheSharedOne).toBe(false);
    // Non-vacuity: the ambiguity this avoids is real and still present upstream.
    const home = readCss(path.join(PAGE_DIR, 'homeV2.css'));
    const cinematic = readCss(path.join(SRC, 'components', 'publicV2', 'cinematicV2.css'));
    expect(/\.cbv2-section--sunken\s*\{/.test(home)).toBe(true);
    expect(/\.cbv2-section--sunken\s*\{/.test(cinematic)).toBe(true);
  });
});

/* --------------------------------------------------------------- byte hygiene --- */

/* ----------------------------------------------------------- media band --- */

describe('the page-local media files play by the same rules as the page', () => {
  it('finds every one of them, so nothing below passes by reading an empty string', () => {
    // Non-vacuity, and it is the assertion the whole describe block rests on: a
    // mistyped path makes every check below pass against `''`.
    expect(MEDIA_SOURCES.length).toBeGreaterThan(10);
    for (const file of MEDIA_SOURCES) {
      expect({ file: path.basename(file), exists: fs.existsSync(file) })
        .toEqual({ file: path.basename(file), exists: true });
    }
  });

  it('uses no CSS Modules, no Bootstrap, no CSS-in-JS and no inline style objects', () => {
    for (const file of MEDIA_SOURCES) {
      const text = read(file);
      expect(text).not.toMatch(/\.module\.css/);
      expect(text).not.toMatch(/import\s+\w+\s+from\s+['"][^'"]*\.css['"]/);
      expect(text).not.toMatch(/from\s+['"](?:react-)?bootstrap/);
      expect(text).not.toMatch(/from\s+['"]styled-components['"]/);
      expect(text).not.toMatch(/from\s+['"]@emotion/);
      expect(text).not.toMatch(/style=\{\{/);
    }
  });

  it('names every class it assigns inside the cbv2- namespace', () => {
    for (const file of MEDIA_SOURCES) {
      expect(read(file)).not.toMatch(/className="(?![^"]*cbv2-)[^"]*"/);
    }
  });

  it('hardcodes no colour, which would be a second palette by another name', () => {
    for (const file of MEDIA_SOURCES) {
      const source = stripComments(read(file));
      expect({ file: path.basename(file), hex: source.match(/#[0-9a-f]{3,8}\b/gi) ?? [] })
        .toEqual({ file: path.basename(file), hex: [] });
    }
  });

  it('adds no carousel dependency — the track is CSS scroll-snap', () => {
    // A carousel library is a new runtime dependency, which CLAUDE.md makes a
    // governance escalation. The whole component is native scroll behaviour, and
    // this is the assertion that keeps it that way when somebody hits a rough
    // edge and reaches for swiper/slick/embla.
    const carousel = stripComments(read(path.join(PAGE_DIR, 'StoryMediaCarousel.tsx')));
    for (const library of ['swiper', 'slick', 'embla', 'keen-slider', 'glide', 'flickity']) {
      expect({ library, imported: new RegExp(`from\\s+['"][^'"]*${library}`).test(carousel) })
        .toEqual({ library, imported: false });
    }
    // The track lives in `storyMediaV2.css` since the split; this reads the
    // system rather than one file, so moving a rule between them cannot make
    // the assertion silently stop applying.
    expect(allCss).toContain('scroll-snap-type');
  });

  it('adds no mermaid dependency — the renderer fetches it at runtime', () => {
    const pkg = JSON.parse(read(path.join(SRC, '..', 'package.json'))) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const declared = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    expect(Object.keys(declared).filter((name) => name.includes('mermaid'))).toEqual([]);
    // ...and the band reaches the shipped component rather than re-implementing.
    expect(stripComments(read(path.join(PAGE_DIR, 'StoryDiagram.tsx'))))
      .toContain('components/visuals/MermaidDiagram');
  });

  it('keeps each one inside the size budget a reader can hold', () => {
    const oversize = MEDIA_SOURCES
      .map((file) => ({ file: path.basename(file), lines: read(file).split('\n').length }))
      .filter((entry) => entry.lines >= 300);
    expect(oversize).toEqual([]);
  });
});

/* --------------------------------------------------------------- carousel --- */

describe('the carousel cannot become a control that does nothing', () => {
  it('states its own floor rather than leaving it to each caller', () => {
    const model = stripComments(read(path.join(PAGE_DIR, 'storyMediaModel.ts')));
    expect(model).toContain('CAROUSEL_MINIMUM_SLIDES');
    // The floor is applied where the slides are built, so no call site can skip
    // it. Behaviour is asserted in `storyMedia.test.tsx`; this is the shape.
    expect(model).toMatch(/>= CAROUSEL_MINIMUM_SLIDES/);
  });

  it('leaves reduced-motion readers a stylesheet rule as well as a runtime check', () => {
    // Both halves are needed: a programmatic `scrollBy` carries its own
    // behaviour and ignores the stylesheet, and a native drag ignores the
    // runtime check. Either one alone leaves half the interaction unhandled.
    expect(allCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(stripComments(read(path.join(PAGE_DIR, 'StoryMediaCarousel.tsx'))))
      .toContain('prefers-reduced-motion: reduce');
  });
});

/* ------------------------------------------------------------- version skew --- */

describe('the detail fetch normalises before a component can read it', () => {
  /**
   * WHY A SOURCE ASSERTION AND NOT A BEHAVIOURAL ONE. Every render test in this
   * suite mocks `fetchCaseStudyDetail`, so nothing exercises the real function
   * body, and the defect being guarded lives in one line INSIDE it: whether the
   * fetched payload is handed to `normalizeDetailResponse` before it is returned.
   * Deleting that call reintroduces a white screen against any server older than
   * this bundle, and every mocked test would stay green.
   *
   * The defect is not hypothetical. Pointed at the live production API, this page
   * rendered nothing at all: `StorySituation` and `TagGroup` both threw reading
   * `.length` of `undefined`, because the deployed projection does not yet send
   * `situation.constraints`, `situation.goals` or `architecture.dataStores`.
   */
  const api = read(path.join(SRC, 'services', 'caseStudyApi.ts'));
  const source = stripComments(api);

  it('reads the client from here, so the checks below are not vacuous', () => {
    expect(api.length).toBeGreaterThan(1000);
    expect(source).toContain('export async function fetchCaseStudyDetail');
  });

  it('routes the detail response through the normaliser rather than returning it raw', () => {
    const body = source.slice(source.indexOf('export async function fetchCaseStudyDetail'));
    const upToReturn = body.slice(0, body.indexOf('\n}'));
    expect(upToReturn).toContain('return normalizeDetailResponse(body);');
    expect(upToReturn).not.toMatch(/return\s+body\s*;/);
  });

  it('normalises the three fields that a server older than this bundle omits', () => {
    for (const field of ['constraints', 'goals', 'dataStores']) {
      expect({ field, normalised: source.includes(field) })
        .toEqual({ field, normalised: true });
    }
  });
});

/* --------------------------------------------------------------- byte hygiene --- */

describe('the files carry no stray control characters', () => {
  it('contains nothing below space except tab, newline and carriage return', () => {
    // A shell heredoc turns `\b` into 0x08 and the result compiles, renders and
    // reviews clean while carrying a byte no editor shows. These files were
    // written through the editor for that reason; this checks it held.
    const forbidden = new RegExp(
      `[${String.fromCharCode(0)}-${String.fromCharCode(8)}`
      + `${String.fromCharCode(11)}${String.fromCharCode(12)}`
      + `${String.fromCharCode(14)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`,
    );
    for (const file of [PAGE, MODEL, SECTIONS, ...STYLESHEETS, ...MEDIA_SOURCES]) {
      expect({ file: path.basename(file), clean: !forbidden.test(read(file)) })
        .toEqual({ file: path.basename(file), clean: true });
    }
  });
});
