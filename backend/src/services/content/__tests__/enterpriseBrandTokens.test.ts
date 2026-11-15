import fs from 'fs';
import path from 'path';

/**
 * enterpriseBrandTokens.test.ts - the public enterprise site paints Colaberry
 * ENTERPRISE, not Colaberry Training.
 *
 * WHY THIS EXISTS
 *
 * enterprise.colaberry.ai shipped for months in the career school's cherry
 * #FB2832: every primary button, every active state, every accent rule. The
 * Colaberry Enterprise design system says the opposite in its own file -
 * "Brand constants - logo artwork only; UI surfaces never use these directly"
 * and "Accent marks only the primary action + active state" - with #2E6A86 as
 * the accent. Nothing in the repository enforced that, so nothing noticed.
 *
 * frontend/src/styles/enterprise-brand.css is the fix: one scoped block that
 * re-points the brand token family onto the enterprise accent. This file is why
 * that stays true.
 *
 * THE FOUR WAYS THIS FAILS, which is the whole design:
 *   1. the bridge stops being imported, or stops being scoped to the public
 *      shell - the rebrand silently reverts, or silently escapes into the
 *      portal and admin, which are legitimately the Training brand
 *   2. a brand token the public CSS reads is NOT re-pointed - a new cherry
 *      surface appears without anyone writing a cherry hex
 *   3. the enterprise design system's accent moves upstream and the bridge no
 *      longer matches it - the sync PR lands and this goes red instead of the
 *      site going quietly wrong
 *   4. someone writes a Training-brand hex straight into the public CSS
 *
 * AND THE WAY IT MUST NOT FAIL: reading nothing. Every path below is asserted
 * to exist and every scan is asserted against a floor, because a scanner that
 * resolves to an empty directory reports clean and is worse than no scanner.
 * That is not hypothetical: the Explorer copy lint's first draft scanned 1
 * value instead of 77 and passed.
 */

/** `__tests__` -> content -> services -> src -> backend -> repo root. */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

/** The Colaberry Enterprise system, vendored and kept current by design-system-sync.yml. */
const ENTERPRISE_COLORS = path.join(
  REPO_ROOT,
  'apps/colaberry-enterprise-design/src/assets/design/tokens/colors.css',
);
/** The Colaberry token layer the React app actually loads. */
const COLABERRY_COLORS = path.join(REPO_ROOT, 'frontend/src/colaberry/tokens/colors.css');
/** The legacy literal tokens: --cherry and friends. */
const LEGACY_TOKENS = path.join(REPO_ROOT, 'frontend/src/styles/tokens.css');
/** The bridge under test. */
const BRIDGE = path.join(REPO_ROOT, 'frontend/src/styles/enterprise-brand.css');
const INDEX_TSX = path.join(REPO_ROOT, 'frontend/src/index.tsx');

/** Where the public enterprise site's CSS lives. */
const PUBLIC_CSS_DIRS = [
  path.join(REPO_ROOT, 'frontend/src/pages/publicV2'),
  path.join(REPO_ROOT, 'frontend/src/components/publicV2'),
];

function read(file: string): string {
  expect(fs.existsSync(file)).toBe(true);
  const text = fs.readFileSync(file, 'utf8');
  expect(text.length).toBeGreaterThan(100);
  return text;
}

/** CSS comments hold prose ABOUT colours; only declarations paint. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Read `--name: value;` declarations. Last writer wins, matching the cascade
 * within one `:root` block, and only the light theme is read: the dark blocks
 * are keyed on `[data-theme="dark"]`, which this site does not set.
 */
function declarations(css: string, stopAtDarkTheme = true): Map<string, string> {
  const body = stopAtDarkTheme ? stripComments(css).split('[data-theme="dark"]')[0] : stripComments(css);
  const out = new Map<string, string>();
  const re = /(--[a-z0-9-]+)\s*:\s*([^;}]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) out.set(m[1].toLowerCase(), m[2].trim());
  return out;
}

/** Every `--name` READ through var() in a stylesheet. */
function tokensRead(css: string): Set<string> {
  const out = new Set<string>();
  const re = /var\(\s*(--[a-z0-9-]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripComments(css))) !== null) out.add(m[1].toLowerCase());
  return out;
}

function cssFilesIn(dir: string): string[] {
  expect(fs.existsSync(dir)).toBe(true);
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.css'))
    .map((f) => path.join(dir, f));
}

/* ------------------------------------------------------------------ 1. wiring */

/**
 * COMMENTS STRIPPED FIRST, and this is not fastidiousness. The first draft of
 * the two tests below asserted against the raw source, and when the import was
 * commented out to check they could fail, BOTH still passed: `toContain` was
 * matching the text inside `// import './styles/enterprise-brand.css';`. They
 * were checking that the words had been written, not that the stylesheet was
 * loaded, which is the same defect this repo already found once in
 * shell.test.tsx - two footer link assertions that passed while both links
 * 404'd.
 */
function activeSource(file: string): string {
  return read(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

describe('the enterprise brand bridge is wired, and scoped', () => {
  it('is imported by index.tsx, on a line that is not commented out', () => {
    expect(activeSource(INDEX_TSX)).toContain("import './styles/enterprise-brand.css'");
  });

  it('loads AFTER the cherry bridge, so it is the later word on a shared name', () => {
    const src = activeSource(INDEX_TSX);
    const mine = src.indexOf('styles/enterprise-brand.css');
    const cherry = src.indexOf('styles/brand-bridge.css');
    expect(mine).toBeGreaterThan(-1);
    expect(cherry).toBeGreaterThan(-1);
    expect(mine).toBeGreaterThan(cherry);
  });

  /*
      The scope is the point. .cbv2-shell is the wrapper PublicLayoutV2 renders
      around every public V2 page and nothing else in the app renders inside it.
      Declaring these on :root would rebrand the portal and admin too, which are
      the career school and are SUPPOSED to be cherry.
  */
  it('declares its tokens on the public shell, never on :root', () => {
    const css = stripComments(read(BRIDGE));
    expect(css).toContain('.cbv2-shell {');
    expect(css).not.toMatch(/(^|\})\s*:root\s*\{/);
    expect(css).not.toContain('html {');
    expect(css).not.toContain('body {');
  });
});

/* ------------------------------------- 2. every cherry token is re-pointed -- */

describe('no brand token the public site reads still resolves to cherry', () => {
  /**
   * Derived, not listed. The set of token names that point at the red ramp is
   * computed from the token layer itself, so adding a cherry-valued token and
   * using it on a public page fails this test without anyone remembering to
   * update a list here.
   */
  it('re-points every red-ramp token that the public CSS actually uses', () => {
    const colaberry = declarations(read(COLABERRY_COLORS));
    const legacy = declarations(read(LEGACY_TOKENS));
    const bridge = declarations(read(BRIDGE), false);

    /* The cherry ramp steps, by value, out of the Colaberry colour file. */
    const redSteps = new Set(
      [...colaberry.entries()]
        .filter(([name]) => /^--red-\d+$/.test(name))
        .map(([name]) => name),
    );
    expect(redSteps.size).toBeGreaterThanOrEqual(5);

    const CHERRY_LITERAL = /#(fb2832|e5121d|c20e1e|fff0f1|fd5760|ff8a90)\b/i;

    /** A token is cherry-valued if it points at a red step or is a cherry literal. */
    const cherryValued = new Set<string>();
    for (const [name, value] of [...colaberry.entries(), ...legacy.entries()]) {
      const refs = [...value.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((m) => m[1].toLowerCase());
      if (refs.some((r) => redSteps.has(r)) || CHERRY_LITERAL.test(value)) cherryValued.add(name);
    }
    /* The ramp steps themselves are the brand constants; the logo uses them. */
    redSteps.forEach((s) => cherryValued.delete(s));
    expect(cherryValued.size).toBeGreaterThanOrEqual(6);

    /* What the public site reads. */
    const used = new Set<string>();
    for (const dir of PUBLIC_CSS_DIRS) {
      for (const file of cssFilesIn(dir)) tokensRead(read(file)).forEach((t) => used.add(t));
    }
    expect(used.size).toBeGreaterThanOrEqual(40);

    const unmapped = [...cherryValued]
      .filter((t) => used.has(t))
      .filter((t) => !bridge.has(t))
      /* Status colours are function, not brand identity, and are deliberately
         out of scope. enterprise-brand.css says so and says why. */
      .filter((t) => !t.startsWith('--status-'));

    expect(unmapped).toEqual([]);
  });

  it('points the mapped tokens at the accent rather than at anything red', () => {
    const bridge = declarations(read(BRIDGE), false);
    for (const name of ['--cherry', '--cherry-deep', '--cherry-text', '--cherry-bg',
      '--brand-accent', '--brand-primary', '--surface-brand', '--border-brand', '--action-bg']) {
      const value = bridge.get(name);
      expect(value).toBeDefined();
      expect(value).toMatch(/var\(--accent/);
    }
  });
});

/* --------------------------------- 3. the bridge still matches its upstream -- */

describe('the bridge still matches the vendored Colaberry Enterprise system', () => {
  /**
   * The bridge introduces no new hex. It maps onto Colaberry ramp steps whose
   * values are identical to the enterprise system's semantic roles. That
   * identity is the load-bearing assumption, so it is asserted rather than
   * trusted: a design-system-sync PR that moves the enterprise accent turns
   * this red instead of leaving the site quietly off-brand.
   */
  it('maps ramp steps whose values equal the enterprise accent roles', () => {
    const ent = declarations(read(ENTERPRISE_COLORS));
    const cby = declarations(read(COLABERRY_COLORS));

    const norm = (v: string | undefined): string => (v || '').trim().toLowerCase();

    expect(norm(ent.get('--accent'))).toBe(norm(cby.get('--blue-600')));
    expect(norm(ent.get('--accent-soft'))).toBe(norm(cby.get('--blue-50')));
    expect(norm(ent.get('--accent-contrast'))).toBe(norm(cby.get('--neutral-0')));

    /* Non-empty, so an unreadable file cannot satisfy the equalities above. */
    expect(norm(ent.get('--accent'))).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('uses the enterprise dark-theme accent for dark bands', () => {
    const entDark = declarations(read(ENTERPRISE_COLORS), false);
    const cby = declarations(read(COLABERRY_COLORS));
    const bridge = declarations(read(BRIDGE), false);

    /* The dark block redeclares --accent; `declarations` keeps the last writer,
       so reading the whole file yields the dark value. */
    expect((entDark.get('--accent') || '').toLowerCase()).toBe(
      (cby.get('--blue-300') || '').toLowerCase(),
    );
    expect(bridge.get('--accent-on-dark')).toContain('--blue-300');
  });

  it('still describes cherry as logo-only, which is the rule it implements', () => {
    expect(read(ENTERPRISE_COLORS)).toContain('logo artwork only');
  });
});

/* ------------------------------------------ 4. no raw Training brand in CSS -- */

describe('the public enterprise CSS writes no Training-brand colour', () => {
  /**
   * Fallbacks are exempt and counted instead. `var(--cherry, #FB2832)` paints
   * the accent now, because --cherry is re-pointed; the literal only fires if
   * the token were undefined. Those are recorded as a shrinking baseline so
   * they can be cleaned up but never grow.
   */
  const BARE = /#(fb2832|fd5760|ff8a90|c20e1e)\b|rgba\(\s*251\s*,\s*40\s*,\s*50/gi;
  /* Measured, not estimated: 14 `var(--token, #cherry)` fallbacks remain across
     the public CSS on 2026-11-15. Each is dead as long as the token is defined,
     which tokens.css does. Shrink this number when they are cleaned up; it must
     never be raised. */
  const FALLBACK_BASELINE = 14;

  it('contains no bare cherry declaration, and no more fallbacks than recorded', () => {
    let scanned = 0;
    let fallbacks = 0;
    const bare: string[] = [];

    for (const dir of PUBLIC_CSS_DIRS) {
      for (const file of cssFilesIn(dir)) {
        scanned += 1;
        const rel = path.relative(REPO_ROOT, file).split(path.sep).join('/');
        stripComments(read(file))
          .split('\n')
          .forEach((line, i) => {
            const hits = line.match(BARE);
            if (!hits) return;
            hits.forEach((hit) => {
              /* Is this occurrence the fallback arm of a var()? */
              const inFallback = new RegExp(
                `var\\(\\s*--[a-z0-9-]+\\s*,\\s*${hit.replace(/[()]/g, '\\$&')}`,
                'i',
              ).test(line);
              if (inFallback) fallbacks += 1;
              else bare.push(`${rel}:${i + 1}  ${hit}`);
            });
          });
      }
    }

    /* The floor. Without this, a bad path reports clean. */
    expect(scanned).toBeGreaterThanOrEqual(30);
    expect(bare).toEqual([]);
    expect(fallbacks).toBeLessThanOrEqual(FALLBACK_BASELINE);
  });
});
